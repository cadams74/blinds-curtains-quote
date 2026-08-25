/**
 * Fabric import: parse a supplier's uploaded Excel or PDF price list, diff
 * it against the currently seeded/edited fabrics for that supplier, and
 * stage the result for an admin to review before anything touches live
 * pricing.
 *
 * Excel (parseWorkbookBuffer) and PDF (parsePdfBuffer) are two independent
 * parsers that both resolve to the exact same { headers, rows } grid shape
 * -- every downstream step (detectColumns/buildParsedRows/
 * diffAgainstExisting/summarizeDiff) is format-agnostic and was written
 * once, for Excel, back in the phase this feature first shipped; PDF only
 * needed a second parser feeding the same pipe, not a parallel pipeline.
 *
 * Also deliberately synchronous, in one Server Action request, rather than
 * the background-job queue architecture-proposal.md sketched out. That
 * sketch was written before knowing the real scale: the whole seeded
 * fabric library is 3,313 rows across 11 suppliers, so a single supplier's
 * price list -- what this actually parses -- is at most a few thousand
 * rows, comfortably inside a Node Server Action's request budget (raised
 * via next.config.ts's serverActions.bodySizeLimit for the upload itself).
 * Revisit with a real queue (Inngest/Trigger.dev, as proposed) if a
 * supplier ever sends something that doesn't fit that budget -- not
 * before, since that infra has a real ongoing cost or complexity budget it
 * doesn't need yet.
 */
import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// Parsing

/** Normalizes one Excel cell's value to plain text -- exceljs hands back
 * strings, numbers, Dates, or richer objects (rich text runs, formula
 * results) depending on how the source file wrote the cell. */
function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const obj = value as unknown as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text.trim();
    if ("result" in obj) return cellToText(obj.result as ExcelJS.CellValue);
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>)
        .map((r) => r.text ?? "")
        .join("")
        .trim();
    }
  }
  return String(value).trim();
}

/** Reads the first worksheet of an uploaded .xlsx file into a plain grid --
 * first row is assumed to be the header row (true of every real supplier
 * price list export seen so far), fully-blank rows are dropped. */
export async function parseWorkbookBuffer(
  buffer: Buffer
): Promise<{ headers: string[]; rows: string[][] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const allRows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as ExcelJS.CellValue[]; // 1-indexed; [0] is unused
    const cells: string[] = [];
    for (let i = 1; i < values.length; i++) cells.push(cellToText(values[i]));
    allRows.push(cells);
  });

  if (allRows.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = allRows;
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// PDF table reconstruction
//
// A PDF has no cell/row/column structure at all -- it only records where
// each run of text sits on the page (an x/y position, from pdf.js's own
// text-extraction), so a table has to be reconstructed from raw positions.
// Confirmed against architecture-proposal.md's own note that the real
// supplier PDFs are "reasonably clean tables (not brochure/catalogue
// layouts)" -- i.e. one row per line, aligned columns -- which is the shape
// this reconstruction is built for, not general-purpose PDF table
// extraction (multi-line wrapped cells, merged/spanning cells, and rotated
// or multi-column-per-page page layouts are all out of scope; see the
// parsePdfBuffer doc comment for what that means in practice).
interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

/** Groups same-line text items together (page coordinates reset per page,
 * so this runs once per page) using a small y tolerance rather than exact
 * equality -- real PDF generators place an entire line at the same
 * baseline, but not always to the same floating-point bit. */
function groupIntoLines(items: PositionedItem[]): PositionedItem[][] {
  const Y_TOLERANCE = 2;
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PositionedItem[][] = [];
  for (const item of sorted) {
    const current = lines[lines.length - 1];
    if (current && Math.abs(current[0].y - item.y) <= Y_TOLERANCE) {
      current.push(item);
    } else {
      lines.push([item]);
    }
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

/** A column boundary is a horizontal gap between two text runs on the same
 * line that's much wider than normal word-spacing. Two independent signals
 * feed the threshold, because either one alone has a real failure mode:
 *
 * 1. An absolute floor scaled to this document's own average character
 *    width (a column gap should be able to fit a few real characters, not
 *    just a single space). This is the only signal available at all when
 *    a document has just one gap per line -- e.g. a PDF built by placing
 *    each cell as its own whole text run with no internal word breaks
 *    (confirmed against a real pdf-lib-generated fixture that renders
 *    each cell as one drawText() call: with only one gap per row, there's
 *    no second "small" cluster to compare against, so a clustering
 *    approach alone finds nothing to split on and would wrongly leave
 *    every row as a single unsplit cell).
 * 2. A refinement using every same-line gap across the whole document,
 *    cut at the single biggest jump in the sorted gap sizes -- the classic
 *    whitespace-table-extraction heuristic (the same idea behind
 *    `pdftotext -layout` + a column-gap pass). This is more precise than
 *    the flat floor when a document genuinely has two clearly separated
 *    gap sizes (in-cell word-spacing vs. column-spacing, as a browser's
 *    HTML-table-to-PDF rendering produces), but it's meaningless noise on
 *    a document that doesn't have that two-cluster shape -- e.g. a page
 *    of prose with no table at all -- so it only overrides the floor when
 *    the jump is both a few points wide and clearly bigger than the gap
 *    below it, and only ever pushes the threshold up, never below the
 *    floor.
 *
 * If neither signal finds anything trustworthy, every line is left as one
 * unsplit cell, which then can't produce a name+price header pair and
 * fails with a clear error rather than guessing a layout that isn't
 * there. */
function findColumnGapThreshold(lines: PositionedItem[][]): number {
  let totalWidth = 0;
  let totalChars = 0;
  for (const line of lines) {
    for (const item of line) {
      totalWidth += item.width;
      totalChars += item.str.length;
    }
  }
  const avgCharWidth = totalChars > 0 ? totalWidth / totalChars : 5;
  const absoluteFloor = avgCharWidth * 2.5;

  const gaps: number[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const gap = line[i].x - (line[i - 1].x + line[i - 1].width);
      if (gap > 0) gaps.push(gap);
    }
  }
  if (gaps.length === 0) return Infinity;
  if (gaps.length < 2) return absoluteFloor;

  const sorted = [...gaps].sort((a, b) => a - b);
  let bestJumpIdx = -1;
  let bestJump = -1;
  for (let i = 1; i < sorted.length; i++) {
    const jump = sorted[i] - sorted[i - 1];
    if (jump > bestJump) {
      bestJump = jump;
      bestJumpIdx = i;
    }
  }
  const below = sorted[bestJumpIdx - 1];
  const above = sorted[bestJumpIdx];
  const elbowIsReasonable = bestJump >= 4 && above >= below * 1.5;
  const elbowThreshold = elbowIsReasonable ? (below + above) / 2 : 0;

  return Math.max(absoluteFloor, elbowThreshold);
}

interface PositionedCell {
  text: string;
  x: number;
}

/** Merges a line's text items into cells wherever the gap between two
 * items doesn't clear the column threshold -- items separated by normal
 * word-spacing end up joined into the same cell's text. */
function splitLineIntoCells(line: PositionedItem[], gapThreshold: number): PositionedCell[] {
  const cells: PositionedCell[] = [];
  let current: PositionedItem[] = [];
  for (let i = 0; i < line.length; i++) {
    const item = line[i];
    const prev = current[current.length - 1];
    const gap = prev ? item.x - (prev.x + prev.width) : 0;
    if (prev && gap > gapThreshold) {
      cells.push({ text: current.map((it) => it.str).join(" "), x: current[0].x });
      current = [item];
    } else {
      current.push(item);
    }
  }
  if (current.length > 0) cells.push({ text: current.map((it) => it.str).join(" "), x: current[0].x });
  return cells;
}

function nearestColumnIndex(x: number, columnStarts: number[]): number {
  let best = 0;
  let bestDistance = Infinity;
  columnStarts.forEach((start, idx) => {
    const distance = Math.abs(x - start);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = idx;
    }
  });
  return best;
}

/** Reads a supplier's uploaded PDF price list into the same plain grid
 * shape parseWorkbookBuffer produces for Excel, so every step after this
 * one (detectColumns, buildParsedRows, diffAgainstExisting) is completely
 * unaware of which format the upload actually was.
 *
 * The first page's first line of text is taken as the header row -- its
 * cells set both the column labels and the x-position each column "lives"
 * at on the page. Every following line (this page and any later ones) is
 * split into cells the same way and each cell is snapped to whichever
 * header column its x-position sits closest to, so a data row's own
 * word-spacing quirks can't accidentally invent an extra column the header
 * didn't have.
 *
 * Known limitations, deliberately not handled rather than silently
 * guessed:
 *
 * A table cell that wraps onto a second PDF line (e.g. a long fabric name
 * in a narrow column) produces two separate output rows, not one merged
 * one -- reconstructing "this line is a continuation of the row above"
 * needs real table-structure inference this doesn't attempt. This is worse
 * than a harmless parse failure and worth calling out plainly: the
 * wrapped-off first line usually has no price cell (empty string in that
 * column) and correctly lands as `invalid_price`, but the *second* line
 * -- the wrapped remainder, e.g. just the word "Name" -- sits on the same
 * PDF line as the row's real price, so it comes out looking like a
 * legitimate new fabric named after a name fragment, at a real price
 * (confirmed with a test fixture in fabricImport.test.ts). Approving a
 * batch applies every "new"/"price_change" row in the batch at once with
 * no per-row selection, so an admin who doesn't actually read the review
 * table before clicking Approve could let a nonsense-named fabric through.
 * The mitigation today is the review step itself, same as
 * ambiguous/invalid-price rows already rely on -- not a structural fix.
 * Revisit if a real supplier PDF turns out to wrap names in practice.
 *
 * A header row repeated on every page of a multi-page price list isn't
 * specially detected either -- it shows up as an ordinary row whose price
 * cell doesn't parse, which is just one more `invalid_price` row an admin
 * can see and ignore, not a mis-priced fabric (a repeated header's "price"
 * column holds its own header text, e.g. "Price", which parsePriceText
 * correctly refuses to read as a number). */
export async function parsePdfBuffer(buffer: Buffer): Promise<{ headers: string[]; rows: string[][] }> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    // Text-position extraction only -- nothing here ever rasterizes a page,
    // so pdf.js's own glyph-width metrics (bundled independently of the
    // renderable font data standardFontDataUrl would otherwise fetch) are
    // all this needs. Silences the expected "Ensure that the
    // standardFontDataUrl API parameter is provided" warning that would
    // otherwise fire on every upload using a non-embedded standard font
    // (Helvetica, Times, etc. -- common in report-generated price lists) --
    // confirmed harmless by checking the extracted item widths are
    // identical with or without it configured.
    verbosity: 0,
  }).promise;

  const pageLines: PositionedItem[][][] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const items: PositionedItem[] = [];
    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[]; width?: number };
      const str = (item.str ?? "").trim();
      if (str === "") continue; // drop pdf.js's own whitespace-run items
      items.push({ str, x: item.transform?.[4] ?? 0, y: item.transform?.[5] ?? 0, width: item.width ?? 0 });
    }
    pageLines.push(groupIntoLines(items));
  }

  const allLines = pageLines.flat();
  if (allLines.length === 0) return { headers: [], rows: [] };

  const gapThreshold = findColumnGapThreshold(allLines);

  const [headerLine, ...restOfFirstPage] = pageLines[0];
  const headerCells = splitLineIntoCells(headerLine, gapThreshold);
  const headers = headerCells.map((c) => c.text);
  const columnStarts = headerCells.map((c) => c.x);
  if (headers.length === 0) return { headers: [], rows: [] };

  const dataLines = [...restOfFirstPage, ...pageLines.slice(1).flat()];
  const rows: string[][] = [];
  for (const line of dataLines) {
    const cells = splitLineIntoCells(line, gapThreshold);
    const row = new Array<string>(headers.length).fill("");
    for (const cell of cells) {
      const idx = nearestColumnIndex(cell.x, columnStarts);
      row[idx] = row[idx] ? `${row[idx]} ${cell.text}` : cell.text;
    }
    if (row.some((c) => c !== "")) rows.push(row);
  }

  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Column detection

export interface ColumnDetection {
  nameColIdx: number;
  priceColIdx: number;
  /** False means neither column was identified by its header text --
   * fallen back to a numeric-content guess. Surfaced to the admin rather
   * than silently trusted, since a wrong guess here would mis-price every
   * row in the batch. */
  confident: boolean;
}

const NAME_HEADER_RE = /name|fabric|code|description|colour|color|item/i;
const PRICE_HEADER_RE = /price|rate|cost|rrp|\$|per\s*m(?:etre)?\b/i;

/** Strips currency symbols/commas/whitespace and parses a number; NaN if
 * what's left isn't a clean number (so "#N/A", "TBC", "" etc. are caught
 * rather than silently becoming 0 -- the same discipline misc.ts already
 * applies to the source workbook's own free-text price cells). */
export function parsePriceText(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export function detectColumns(headers: string[], sampleRows: string[][]): ColumnDetection {
  const nameByHeader = headers.findIndex((h) => NAME_HEADER_RE.test(h));
  const priceByHeader = headers.findIndex((h) => PRICE_HEADER_RE.test(h));
  if (nameByHeader !== -1 && priceByHeader !== -1 && nameByHeader !== priceByHeader) {
    return { nameColIdx: nameByHeader, priceColIdx: priceByHeader, confident: true };
  }

  // Fallback: whichever column parses as a clean number most often in the
  // sample is probably the price column; the first other column is probably
  // the name column. A guess, explicitly marked as one via confident:false.
  const numericScore = headers.map((_, colIdx) => {
    let numeric = 0;
    let total = 0;
    for (const row of sampleRows) {
      const v = row[colIdx];
      if (v === undefined || v === "") continue;
      total++;
      if (!Number.isNaN(parsePriceText(v))) numeric++;
    }
    return total > 0 ? numeric / total : 0;
  });
  let priceColIdx = 1;
  let bestScore = -1;
  numericScore.forEach((score, idx) => {
    if (score > bestScore) {
      bestScore = score;
      priceColIdx = idx;
    }
  });
  if (bestScore <= 0.5) priceColIdx = headers.length > 1 ? 1 : 0;
  const nameColIdx = priceColIdx === 0 ? Math.min(1, headers.length - 1) : 0;

  return { nameColIdx, priceColIdx, confident: false };
}

// ---------------------------------------------------------------------------
// Row extraction + diff

export interface ParsedFabricRow {
  /** 1-indexed data row within the sheet (header excluded), for display. */
  rowNumber: number;
  name: string;
  rawPrice: string;
  price: number | null;
}

export function buildParsedRows(
  rows: string[][],
  nameColIdx: number,
  priceColIdx: number
): ParsedFabricRow[] {
  const out: ParsedFabricRow[] = [];
  rows.forEach((row, i) => {
    const name = (row[nameColIdx] ?? "").trim();
    const rawPrice = (row[priceColIdx] ?? "").trim();
    if (name === "") return; // no fabric name -- nothing to import for this row
    const parsed = parsePriceText(rawPrice);
    out.push({ rowNumber: i + 1, name, rawPrice, price: Number.isNaN(parsed) ? null : parsed });
  });
  return out;
}

export type FabricImportDiffKind = "new" | "price_change" | "unchanged" | "ambiguous" | "invalid_price";

export interface DiffedFabricRow extends ParsedFabricRow {
  diff: FabricImportDiffKind;
  previousPrice: number | null;
  matchedFabricId: number | null;
  /** How many existing fabrics share this exact name for this supplier --
   * >1 means "ambiguous": which one the supplier's updated price applies to
   * can't be inferred from name alone (see the real Dadaism/Softdrape Plus
   * same-name-different-price fabrics found in Phase 6). Left for manual
   * resolution via the Fabric Prices admin page rather than guessed. */
  matchCount: number;
}

export interface ExistingFabric {
  id: number;
  name: string;
  pricePerMetre: number | null;
  active: boolean;
}

export function diffAgainstExisting(
  parsedRows: ParsedFabricRow[],
  existing: ExistingFabric[]
): DiffedFabricRow[] {
  const byName = new Map<string, ExistingFabric[]>();
  for (const f of existing) {
    if (!byName.has(f.name)) byName.set(f.name, []);
    byName.get(f.name)!.push(f);
  }

  return parsedRows.map((row) => {
    if (row.price === null) {
      return { ...row, diff: "invalid_price", previousPrice: null, matchedFabricId: null, matchCount: 0 };
    }
    const matches = byName.get(row.name) ?? [];
    if (matches.length === 0) {
      return { ...row, diff: "new", previousPrice: null, matchedFabricId: null, matchCount: 0 };
    }
    if (matches.length > 1) {
      return { ...row, diff: "ambiguous", previousPrice: null, matchedFabricId: null, matchCount: matches.length };
    }
    const match = matches[0];
    const samePrice = match.pricePerMetre !== null && Math.abs(match.pricePerMetre - row.price) < 0.005;
    return {
      ...row,
      diff: samePrice ? "unchanged" : "price_change",
      previousPrice: match.pricePerMetre,
      matchedFabricId: match.id,
      matchCount: 1,
    };
  });
}

export function summarizeDiff(rows: DiffedFabricRow[]): Record<FabricImportDiffKind, number> {
  const counts: Record<FabricImportDiffKind, number> = {
    new: 0,
    price_change: 0,
    unchanged: 0,
    ambiguous: 0,
    invalid_price: 0,
  };
  for (const r of rows) counts[r.diff]++;
  return counts;
}
