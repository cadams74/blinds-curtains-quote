/**
 * DB-backed implementation of pricing/curtain.ts's CurtainDataSource
 * interface -- the curtain-side equivalent of pricingDataSource.ts's
 * loadBlindDataSource(), same goal: an admin-edited price/constant/table
 * takes effect without a redeploy, with zero change to the pricing math
 * curtain.test.ts already validated against 8 real historical quote lines.
 *
 * Everything this reads was already being seeded except two pieces that
 * were only ever seeded for this phase: curtain_price_lists (the table
 * existed in schema.ts since Phase 2 but nothing ever wrote to it) and the
 * four direct-address adjustment tables (finish/track/hook make-height,
 * layout track-length -- seeded into option_lists under invented names,
 * see seed.ts's comment on why they have no real workbook name to reuse).
 * Fullnesses/LayoutBends were already in option_lists (seeded since Phase
 * 1/6) but nothing read them from there until now. Pricing constants were
 * already fully present in the same pricing_constants_versions blob
 * genericBlind.ts's constants come from -- see pricingConstantsConfig.ts's
 * file comment, confirmed while building this that curtain's 11 keys
 * (MitreCost, BendCost, the 8 making-cost variants) are already in that
 * JSON, just never read from here before.
 */
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { CurtainDataSource } from "../pricing/curtain.js";

type Pair = [string | number, unknown];

function lookup(rows: unknown, key: string | number): number {
  if (!Array.isArray(rows)) return 0;
  const row = (rows as Pair[]).find((r) => r[0] === key);
  return row && typeof row[1] === "number" ? row[1] : 0;
}

export async function loadCurtainDataSource(db: Db): Promise<CurtainDataSource> {
  const [constantsRow, trackListRows, optionRows] = await Promise.all([
    db
      .select()
      .from(schema.pricingConstantsVersions)
      .where(eq(schema.pricingConstantsVersions.isActive, true))
      .limit(1),
    db.select().from(schema.curtainPriceLists),
    db.select().from(schema.optionLists),
  ]);

  if (!constantsRow[0]) {
    throw new Error("No active pricing_constants_versions row -- run the seed script.");
  }
  const constants = constantsRow[0].constants as Record<string, number>;

  const trackLists = new Map<string, { lengths: number[]; prices: number[] }>();
  for (const row of trackListRows) {
    trackLists.set(row.name, {
      lengths: row.trackLengthsMm as number[],
      prices: row.prices as number[],
    });
  }

  const optionByName = new Map(optionRows.map((r) => [r.name, r.values]));
  const fullnessRows = optionByName.get("Fullnesses");
  const bendRows = optionByName.get("LayoutBends");
  const finishAdjRows = optionByName.get("CurtainFinishMakeHeightAdjustment");
  const trackAdjRows = optionByName.get("CurtainTrackMakeHeightAdjustment");
  const hookAdjRows = optionByName.get("CurtainHookMakeHeightAdjustment");
  const layoutAdjRows = optionByName.get("CurtainLayoutTrackLengthAdjustment");

  return {
    getPricingConstants: () => constants,
    getTrackPriceList: (key) => trackLists.get(key) ?? null,
    getFullness: (style) => {
      if (!Array.isArray(fullnessRows)) return null;
      const row = (fullnessRows as Pair[]).find((r) => r[0] === style);
      return row && typeof row[1] === "number" ? row[1] : null;
    },
    getBendCount: (layout) => {
      if (!Array.isArray(bendRows)) return 0;
      const row = (bendRows as [string, unknown, number][]).find((r) => r[0] === layout);
      return row ? row[2] : 0;
    },
    getFinishMakeHeightAdjustment: (finish) => lookup(finishAdjRows, finish),
    getTrackMakeHeightAdjustment: (trackName) => lookup(trackAdjRows, trackName),
    getHookMakeHeightAdjustment: (hooks) => lookup(hookAdjRows, hooks),
    getLayoutTrackLengthAdjustment: (layout) => lookup(layoutAdjRows, layout),
  };
}

/** The hook adjustment table's row keys, for the Hooks dropdown -- same
 * filter as loadCurtainData.ts's getHookNames() (there's no dedicated
 * "Hooks" named range in the source workbook, only this adjustment table;
 * one row's key is the bare number `1`, almost certainly a raw-cell
 * extraction artifact rather than a real hook type, excluded here too).
 * Kept separate from loadCurtainDataSource() since this is UI option-list
 * data, not something priceCurtain()'s math reads. */
export async function getCurtainHookNames(db: Db): Promise<string[]> {
  const [row] = await db
    .select()
    .from(schema.optionLists)
    .where(eq(schema.optionLists.name, "CurtainHookMakeHeightAdjustment"));
  if (!row || !Array.isArray(row.values)) return [];
  return (row.values as Pair[]).map((r) => r[0]).filter((k): k is string => typeof k === "string");
}
