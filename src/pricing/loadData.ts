import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = join(__dirname, "..", "..", "data", "extraction_output");

function readJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(join(DATA_ROOT, relPath), "utf-8")) as T;
}

export interface PriceGridGroup {
  family: string;
  group: number;
  width_bands_mm: number[];
  height_bands_mm: number[];
  price_matrix: number[][];
  width_scale_mm: number;
  height_scale_mm: number;
  track?: {
    width_bands_mm: number[];
    price_matrix: number[][];
    width_scale_mm: number;
  };
}

let _priceGrids: PriceGridGroup[] | null = null;
export function loadPriceGrids(): PriceGridGroup[] {
  if (!_priceGrids) {
    const data = readJson<{ groups: PriceGridGroup[] }>("price_grids/blind_price_grids.json");
    _priceGrids = data.groups;
  }
  return _priceGrids;
}

export function getPriceGrid(family: string, group: number): PriceGridGroup {
  const grid = loadPriceGrids().find((g) => g.family === family && g.group === group);
  if (!grid) throw new Error(`No price grid for ${family} group ${group}`);
  return grid;
}

let _blindSettings: { ranges: Record<string, any> } | null = null;
function blindSettings() {
  if (!_blindSettings) {
    _blindSettings = readJson("settings/blind_settings_named_ranges.json");
  }
  return _blindSettings!.ranges;
}

/** Blind fabric name -> pricing group number, for a given fabric source. */
export function getFabricGroup(source: string, fabricName: string): number | null {
  const key = `${source}FabricPrices`;
  const rows: [string, number][] | undefined = blindSettings()[key];
  if (!rows) return null;
  const row = rows.find((r) => r[0] === fabricName);
  return row ? row[1] : null;
}

/** Control type -> $ cost, for a given blind family (e.g. "Roller"). */
export function getControlPrice(familyLabel: string, controlType: string): number {
  const key = `${familyLabel}ControlPrices`;
  const rows: [string, number][] | undefined = blindSettings()[key];
  if (!rows) return 0;
  const row = rows.find((r) => r[0] === controlType);
  return row ? row[1] : 0;
}

let _blindConstants: Record<string, number> | null = null;
export function getPricingConstants(): Record<string, number> {
  if (!_blindConstants) {
    const named = readJson<{ constants: Record<string, number> }>("settings/pricing_constants.json");
    const flat = readJson<Record<string, number>>("price_grids/blind_flat_constants.json");
    _blindConstants = { ...named.constants, ...flat };
  }
  return _blindConstants;
}

export interface FormulaLiteralConstant {
  value: number;
  found_in: string;
  meaning: string;
}
let _formulaLiterals: Record<string, FormulaLiteralConstant> | null = null;
export function getFormulaLiteralConstants(): Record<string, FormulaLiteralConstant> {
  if (!_formulaLiterals) {
    const data = readJson<{ constants: Record<string, FormulaLiteralConstant> }>(
      "settings/formula_literal_constants.json"
    );
    _formulaLiterals = data.constants;
  }
  return _formulaLiterals;
}
