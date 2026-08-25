/**
 * DB-backed implementation of pricing/genericBlind.ts's BlindDataSource
 * interface, used by the live app's server actions so that admin-edited
 * prices/constants/fabric-group mappings take effect without a redeploy --
 * the whole point of moving off the spreadsheet (see architecture-
 * proposal.md section 2). The pricing MATH itself is untouched and still
 * the exact code validated in genericBlind.test.ts/roller.test.ts; this
 * module only swaps out where the numbers come from.
 *
 * Loads everything needed to price one family in a handful of small
 * queries (dozens of rows, not thousands) up front, then hands back plain
 * synchronous lookup functions closed over that data -- genericBlind.ts's
 * pricing functions are synchronous (deliberately: pricing math shouldn't
 * need to be async), so the DB round-trip has to happen before calling in,
 * not during.
 */
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { BlindDataSource } from "../pricing/genericBlind.js";
import type { PriceGridGroup } from "../pricing/loadData.js";

export async function loadBlindDataSource(db: Db, family: string): Promise<BlindDataSource> {
  const [constantsRow, gridRows, fabricOptionRows, controlPriceRows] = await Promise.all([
    db
      .select()
      .from(schema.pricingConstantsVersions)
      .where(eq(schema.pricingConstantsVersions.isActive, true))
      .limit(1),
    db.select().from(schema.priceGridGroups).where(eq(schema.priceGridGroups.familySlug, family)),
    // Fabric-source-name -> group mapping isn't actually keyed by family in
    // the source workbook (see seed.ts comment) -- the same fabric-source
    // catalog (e.g. "Mermet") can be a valid Fabric Source for several
    // blind families, so we load the whole table rather than filtering by
    // family here. It's ~220 rows.
    db.select().from(schema.blindFabricOptions),
    db.select().from(schema.controlPrices).where(eq(schema.controlPrices.familySlug, family)),
  ]);

  if (!constantsRow[0]) {
    throw new Error("No active pricing_constants_versions row -- run the seed script.");
  }

  const constants = constantsRow[0].constants as Record<string, number>;

  const grids = new Map<number, PriceGridGroup>();
  for (const g of gridRows) {
    grids.set(g.groupNumber, {
      family: g.familySlug,
      group: g.groupNumber,
      width_bands_mm: g.widthBandsMm as number[],
      height_bands_mm: g.heightBandsMm as number[],
      price_matrix: g.priceMatrix as number[][],
      width_scale_mm: g.widthScaleMm,
      height_scale_mm: g.heightScaleMm,
      track: (g.track as PriceGridGroup["track"]) ?? undefined,
    });
  }

  // First occurrence wins on duplicate (source, fabricName) pairs -- matches
  // both Excel's own VLOOKUP behaviour and the JSON-backed loadData.ts, on
  // the handful of genuinely-duplicated source rows (see seed.ts comment).
  const fabricGroups = new Map<string, number>();
  for (const row of fabricOptionRows) {
    const key = `${row.source}::${row.fabricName}`;
    if (!fabricGroups.has(key)) fabricGroups.set(key, row.priceGroup);
  }

  const controlPricesMap = new Map<string, number>();
  for (const row of controlPriceRows) {
    controlPricesMap.set(row.controlType, Number(row.price));
  }

  return {
    getPricingConstants: () => constants,
    getPriceGrid: (gridFamily, group) => {
      const grid = grids.get(group);
      if (!grid) throw new Error(`No price grid for ${gridFamily} group ${group}`);
      return grid;
    },
    getFabricGroup: (source, fabricName) => fabricGroups.get(`${source}::${fabricName}`) ?? null,
    getControlPrice: (_familyLabel, controlType) => controlPricesMap.get(controlType) ?? 0,
  };
}

/** Fetches an option list's raw values by its original workbook named-range
 * name (e.g. "RollerSources", "RollerBrackets") -- see seed.ts.
 *
 * Normalizes shape: most named ranges are a real list ("RollerSources" has
 * 9 suppliers), but several (e.g. "VenetianSources", "VerishadeControlTypes")
 * have exactly one valid value in the source workbook, and the extraction
 * stores those as a bare string/number rather than a one-element array --
 * the same single-vs-list shape inconsistency already found and fixed once
 * for VerishadeFabricPrices (see extraction/README.md's "shape bug"). Wrap
 * a non-array value in a one-element array here rather than at every call
 * site, so callers can always assume a list. A single valid option is also
 * a real UI signal worth acting on -- see honeycomb.ts's writeup on the
 * blank-Fabric-Source failure mode this caused in the source spreadsheet;
 * the generic blind form auto-selects when a list has exactly one value
 * rather than making the estimator pick the only option. */
export async function getOptionListValues(db: Db, name: string): Promise<unknown[]> {
  const [row] = await db.select().from(schema.optionLists).where(eq(schema.optionLists.name, name));
  if (row === undefined || row.values === null || row.values === undefined) return [];
  return Array.isArray(row.values) ? row.values : [row.values];
}
