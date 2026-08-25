import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = join(__dirname, "..", "..", "data", "extraction_output");

function readJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(join(DATA_ROOT, relPath), "utf-8")) as T;
}

let _curtainRanges: Record<string, unknown> | null = null;
function curtainRanges(): Record<string, unknown> {
  if (!_curtainRanges) {
    _curtainRanges = readJson<{ ranges: Record<string, unknown> }>(
      "curtain_pricing/named_ranges.json"
    ).ranges;
  }
  return _curtainRanges;
}

/** Track price-by-length list for a given "<Type>WS<TrackName>" key, e.g.
 * "OtherWSTWSeries74Venice" -> its TrackLengths/Prices named-range pair. */
export function getTrackPriceList(key: string): { lengths: number[]; prices: number[] } | null {
  const lengths = curtainRanges()[`${key}TrackLengths`] as number[] | undefined;
  const prices = curtainRanges()[`${key}Prices`] as number[] | undefined;
  if (!lengths || !prices) return null;
  return { lengths, prices };
}

let _curtainSettings: Record<string, unknown> | null = null;
function curtainSettings(): Record<string, unknown> {
  if (!_curtainSettings) {
    _curtainSettings = readJson<{ ranges: Record<string, unknown> }>(
      "settings/curtain_settings_named_ranges.json"
    ).ranges;
  }
  return _curtainSettings;
}

export function getFullness(style: string): number | null {
  const rows = curtainSettings()["Fullnesses"] as [string, number | null][];
  const row = rows.find((r) => r[0] === style);
  return row && typeof row[1] === "number" ? row[1] : null;
}

export function getBendCount(layout: string): number {
  const rows = curtainSettings()["LayoutBends"] as [string, unknown, number][];
  const row = rows.find((r) => r[0] === layout);
  return row ? row[2] : 0;
}

interface DirectAddressTables {
  finish_make_height_adjustment_D9_E102: [string, number][];
  track_make_height_adjustment_H9_I126: [string, number][];
  hook_make_height_adjustment_O9_P17: [string | number, number][];
  layout_track_length_adjustment_K10_L102: [string, number][];
}
let _directTables: DirectAddressTables | null = null;
function directTables(): DirectAddressTables {
  if (!_directTables) {
    _directTables = readJson<DirectAddressTables>("settings/curtain_direct_address_tables.json");
  }
  return _directTables;
}

function lookup(rows: [string | number, number][], key: string | number): number {
  const row = rows.find((r) => r[0] === key);
  return row ? row[1] : 0;
}

export function getFinishMakeHeightAdjustment(finish: string): number {
  return lookup(directTables().finish_make_height_adjustment_D9_E102, finish);
}
export function getTrackMakeHeightAdjustment(trackName: string): number {
  return lookup(directTables().track_make_height_adjustment_H9_I126, trackName);
}
export function getHookMakeHeightAdjustment(hooks: string): number {
  return lookup(directTables().hook_make_height_adjustment_O9_P17, hooks);
}

/** The hook table's row keys, for a dropdown -- there's no dedicated "Hooks"
 * named range in the source workbook (unlike Styles/Finish/Tracks/Layouts),
 * only this direct-address adjustment table (see curtain_direct_address_
 * tables.json / the module comment on DirectAddressTables). One row's key is
 * the bare number `1`, not a hook name -- almost certainly a raw-cell
 * artifact from the extraction rather than a real selectable hook type, so
 * it's excluded here rather than shown as a confusing "1" option. */
export function getHookNames(): string[] {
  return directTables()
    .hook_make_height_adjustment_O9_P17.map((r) => r[0])
    .filter((k): k is string => typeof k === "string");
}
export function getLayoutTrackLengthAdjustment(layout: string): number {
  return lookup(directTables().layout_track_length_adjustment_K10_L102, layout);
}

let _pricingConstants: Record<string, number> | null = null;
export function getCurtainPricingConstants(): Record<string, number> {
  if (!_pricingConstants) {
    _pricingConstants = readJson<{ constants: Record<string, number> }>(
      "settings/pricing_constants.json"
    ).constants;
  }
  return _pricingConstants;
}
