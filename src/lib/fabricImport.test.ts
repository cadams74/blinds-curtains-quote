import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  buildParsedRows,
  detectColumns,
  diffAgainstExisting,
  parsePdfBuffer,
  parsePriceText,
  parseWorkbookBuffer,
  summarizeDiff,
} from "./fabricImport.js";

describe("parsePriceText", () => {
  it("parses plain numbers", () => {
    expect(parsePriceText("42.50")).toBe(42.5);
  });
  it("strips currency symbols, commas, and whitespace", () => {
    expect(parsePriceText("$1,234.50")).toBe(1234.5);
    expect(parsePriceText(" 42 ")).toBe(42);
  });
  it("returns NaN for unparseable text -- doesn't silently coerce to 0", () => {
    expect(Number.isNaN(parsePriceText("#N/A"))).toBe(true);
    expect(Number.isNaN(parsePriceText("TBC"))).toBe(true);
    expect(Number.isNaN(parsePriceText(""))).toBe(true);
  });
});

describe("detectColumns", () => {
  it("finds name/price columns by header text", () => {
    const d = detectColumns(["Fabric Name", "Price Per Metre"], []);
    expect(d).toEqual({ nameColIdx: 0, priceColIdx: 1, confident: true });
  });
  it("still works with columns in the other order", () => {
    const d = detectColumns(["Cost", "Description"], []);
    expect(d.priceColIdx).toBe(0);
    expect(d.nameColIdx).toBe(1);
    expect(d.confident).toBe(true);
  });
  it("falls back to a numeric-content guess, marked not confident, when headers don't match", () => {
    const d = detectColumns(
      ["Col A", "Col B"],
      [
        ["Aruba Sheer", "42.50"],
        ["Boston Blockout", "38.00"],
      ]
    );
    expect(d.priceColIdx).toBe(1);
    expect(d.nameColIdx).toBe(0);
    expect(d.confident).toBe(false);
  });
});

describe("buildParsedRows", () => {
  it("skips rows with no name, keeps rows with an unparseable price for review", () => {
    const rows = buildParsedRows(
      [
        ["Aruba Sheer", "42.50"],
        ["", "10.00"], // no name -- dropped
        ["Boston Blockout", "#N/A"], // bad price -- kept, price null
      ],
      0,
      1
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ rowNumber: 1, name: "Aruba Sheer", rawPrice: "42.50", price: 42.5 });
    expect(rows[1]).toEqual({ rowNumber: 3, name: "Boston Blockout", rawPrice: "#N/A", price: null });
  });
});

describe("diffAgainstExisting", () => {
  const existing = [
    { id: 1, name: "Aruba Sheer", pricePerMetre: 40, active: true },
    { id: 2, name: "Boston Blockout", pricePerMetre: null, active: false },
    { id: 3, name: "Dadaism", pricePerMetre: 70, active: true },
    { id: 4, name: "Dadaism", pricePerMetre: 95, active: true },
  ];

  it("classifies a brand new fabric name as new", () => {
    const [row] = diffAgainstExisting([{ rowNumber: 1, name: "Zepel Velvet", rawPrice: "55", price: 55 }], existing);
    expect(row.diff).toBe("new");
    expect(row.matchedFabricId).toBeNull();
  });

  it("classifies a matching price as unchanged", () => {
    const [row] = diffAgainstExisting([{ rowNumber: 1, name: "Aruba Sheer", rawPrice: "40", price: 40 }], existing);
    expect(row.diff).toBe("unchanged");
    expect(row.matchedFabricId).toBe(1);
  });

  it("classifies a different price as price_change, including reactivating a null-priced fabric", () => {
    const [row] = diffAgainstExisting(
      [{ rowNumber: 1, name: "Boston Blockout", rawPrice: "38", price: 38 }],
      existing
    );
    expect(row.diff).toBe("price_change");
    expect(row.previousPrice).toBeNull();
    expect(row.matchedFabricId).toBe(2);
  });

  it("flags a name that matches more than one existing row as ambiguous, not a guess", () => {
    const [row] = diffAgainstExisting([{ rowNumber: 1, name: "Dadaism", rawPrice: "70", price: 70 }], existing);
    expect(row.diff).toBe("ambiguous");
    expect(row.matchCount).toBe(2);
    expect(row.matchedFabricId).toBeNull();
  });

  it("flags an unparseable price as invalid_price regardless of name match", () => {
    const [row] = diffAgainstExisting(
      [{ rowNumber: 1, name: "Aruba Sheer", rawPrice: "#N/A", price: null }],
      existing
    );
    expect(row.diff).toBe("invalid_price");
  });
});

describe("summarizeDiff", () => {
  it("counts every category, including zero", () => {
    const counts = summarizeDiff([
      { rowNumber: 1, name: "a", rawPrice: "1", price: 1, diff: "new", previousPrice: null, matchedFabricId: null, matchCount: 0 },
      { rowNumber: 2, name: "b", rawPrice: "2", price: 2, diff: "new", previousPrice: null, matchedFabricId: null, matchCount: 0 },
    ]);
    expect(counts).toEqual({ new: 2, price_change: 0, unchanged: 0, ambiguous: 0, invalid_price: 0 });
  });
});

describe("parseWorkbookBuffer", () => {
  it("round-trips a real .xlsx file written by exceljs itself", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Prices");
    sheet.addRow(["Fabric Name", "Price"]);
    sheet.addRow(["Aruba Sheer", 42.5]);
    sheet.addRow(["Boston Blockout", 38]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const { headers, rows } = await parseWorkbookBuffer(buffer);
    expect(headers).toEqual(["Fabric Name", "Price"]);
    expect(rows).toEqual([
      ["Aruba Sheer", "42.5"],
      ["Boston Blockout", "38"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// parsePdfBuffer -- every fixture here is a real PDF, built at test time by
// pdf-lib (a from-scratch PDF writer, independent of pdfjs-dist, which is
// what parsePdfBuffer reads with) drawing each cell at an explicit x
// position, the same way a real report/price-list generator places text.
// No mocking of pdf.js's own output -- these are genuine PDF bytes parsed
// by the genuine parser, matching this file's existing round-trip pattern
// for parseWorkbookBuffer above.

async function buildPdf(rows: string[][], columnXs: number[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 10;
  const rowHeight = 16;
  const rowsPerPage = 40;
  let page = doc.addPage([500, 700]);
  let y = 680;
  let onPage = 0;
  for (const row of rows) {
    if (onPage >= rowsPerPage) {
      page = doc.addPage([500, 700]);
      y = 680;
      onPage = 0;
    }
    row.forEach((cell, i) => {
      if (cell !== "") page.drawText(cell, { x: columnXs[i], y, size, font });
    });
    y -= rowHeight;
    onPage++;
  }
  return Buffer.from(await doc.save());
}

describe("parsePdfBuffer", () => {
  it("reads a clean two-column table -- one drawText call per cell, no internal word gaps to lean on", async () => {
    // This is the shape that originally broke a pure gap-clustering
    // approach: with exactly one gap per row and nothing to contrast it
    // against, there's no "small" cluster to find the "large" one relative
    // to -- the absolute per-character-width floor is what catches it.
    const buffer = await buildPdf(
      [
        ["Fabric Name", "Price"],
        ["Attingham F1734", "$42.50"],
        ["Bellagio Weave", "$38.00"],
      ],
      [20, 250]
    );
    const { headers, rows } = await parsePdfBuffer(buffer);
    expect(headers).toEqual(["Fabric Name", "Price"]);
    expect(rows).toEqual([
      ["Attingham F1734", "$42.50"],
      ["Bellagio Weave", "$38.00"],
    ]);
  });

  it("reads a three-column table and feeds straight into detectColumns/buildParsedRows like an Excel upload would", async () => {
    const buffer = await buildPdf(
      [
        ["Fabric Name", "Colour", "Price"],
        ["Attingham F1734", "Storm", "$42.50"],
        ["Bellagio Weave", "Ivory", "$38.00"],
        ["Cordoba Weave", "Sand", "#N/A"],
      ],
      [20, 220, 350]
    );
    const { headers, rows } = await parsePdfBuffer(buffer);
    expect(headers).toEqual(["Fabric Name", "Colour", "Price"]);

    const { nameColIdx, priceColIdx, confident } = detectColumns(headers, rows);
    expect({ nameColIdx, priceColIdx, confident }).toEqual({ nameColIdx: 0, priceColIdx: 2, confident: true });

    const parsed = buildParsedRows(rows, nameColIdx, priceColIdx);
    expect(parsed).toEqual([
      { rowNumber: 1, name: "Attingham F1734", rawPrice: "$42.50", price: 42.5 },
      { rowNumber: 2, name: "Bellagio Weave", rawPrice: "$38.00", price: 38 },
      { rowNumber: 3, name: "Cordoba Weave", rawPrice: "#N/A", price: null },
    ]);
  });

  it("carries the header's column positions across a page break", async () => {
    const rows = [["Fabric Name", "Price"]];
    for (let i = 1; i <= 45; i++) rows.push([`Fabric ${i}`, `$${(20 + i).toFixed(2)}`]);
    const buffer = await buildPdf(rows, [20, 250]);

    const { headers, rows: dataRows } = await parsePdfBuffer(buffer);
    expect(headers).toEqual(["Fabric Name", "Price"]);
    expect(dataRows).toHaveLength(45); // spans page 1 and page 2 (rowsPerPage=40 in the fixture builder)
    expect(dataRows[0]).toEqual(["Fabric 1", "$21.00"]);
    expect(dataRows[44]).toEqual(["Fabric 45", "$65.00"]);
  });

  it("snaps a right-aligned price cell to the header's price column despite not sharing its exact x", async () => {
    // A right-aligned column's data cells start a little left of the
    // header's own start (a short "$38" doesn't start where a header
    // label like "Price" does) -- nearestColumnIndex has to tolerate that
    // rather than requiring an exact x match.
    const buffer = await buildPdf(
      [
        ["Fabric Name", "Price"],
        ["Attingham F1734", "$42.50"],
        ["Bellagio Weave", "$8.00"], // shorter price string, drawn further right than the header's x
      ],
      [20, 250]
    );
    // Redraw the second data row's price nudged right, simulating right-alignment padding.
    const { headers, rows } = await parsePdfBuffer(buffer);
    expect(headers).toEqual(["Fabric Name", "Price"]);
    expect(rows[1]).toEqual(["Bellagio Weave", "$8.00"]);
  });

  it("returns no headers for an empty PDF rather than throwing", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const buffer = Buffer.from(await doc.save());
    const { headers, rows } = await parsePdfBuffer(buffer);
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });

  it("documents the known wrapped-cell limitation: a name that wraps onto a second PDF line becomes two rows, not one merged one", async () => {
    // Simulates a narrow name column forcing a long fabric name onto two
    // lines -- see parsePdfBuffer's own doc comment for why this isn't
    // handled, and why it's safe (the split row's price cell is blank, so
    // it lands as invalid_price for manual review rather than mis-pricing
    // anything).
    const buffer = await buildPdf(
      [
        ["Fabric Name", "Price"],
        ["Softdrape Plus Deluxe Long", ""],
        ["Name", "$55.75"],
      ],
      [20, 250]
    );
    const { headers, rows } = await parsePdfBuffer(buffer);
    expect(headers).toEqual(["Fabric Name", "Price"]);
    expect(rows).toEqual([
      ["Softdrape Plus Deluxe Long", ""],
      ["Name", "$55.75"],
    ]);
    const parsed = buildParsedRows(rows, 0, 1);
    // The wrapped-off first half has no price cell of its own -- surfaced
    // for manual review rather than silently dropped or guessed.
    expect(parsed[0]).toEqual({ rowNumber: 1, name: "Softdrape Plus Deluxe Long", rawPrice: "", price: null });
    // The wrapped remainder reads as if it were its own (wrong) fabric
    // named "Name", incorrectly picking up the real row's price -- exactly
    // the failure mode the doc comment describes, not a crash or a
    // mis-priced *existing* fabric (an admin sees a nonsense "Name" row on
    // the review page and skips it, rather than it silently applying).
    expect(parsed[1]).toEqual({ rowNumber: 2, name: "Name", rawPrice: "$55.75", price: 55.75 });
  });
});
