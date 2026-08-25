/**
 * Seed the Postgres schema from the workbook extraction output. Requires a
 * real DATABASE_URL to run -- a Neon connection string in production, or a
 * local/self-hosted Postgres for dev. Verified end-to-end against a real
 * local Postgres (not just dry-run) while building the app, which is how
 * the fabric-price idempotency bugs documented inline below were actually
 * found. Safe to re-run: every insert is conflict-safe. Run with:
 *
 *   DATABASE_URL=postgres://... npm run seed
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = join(__dirname, "..", "..", "data", "extraction_output");

function readJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(join(DATA_ROOT, relPath), "utf-8")) as T;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set -- pass a Neon connection string to actually seed a database.");
    console.error("Running in dry-run mode: validating extraction data shape only.\n");
  }

  const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
  const db = pool ? drizzle(pool, { schema }) : null;

  // ---- suppliers + fabrics -------------------------------------------------
  const supplierIndex = readJson<{ suppliers: { name: string; slug: string }[] }>(
    "suppliers/_index.json"
  );
  let fabricRowCount = 0;
  let unusablePriceCount = 0;
  for (const s of supplierIndex.suppliers) {
    const supplierData = readJson<{ fabrics: { name: string; price_per_metre: number | string | null }[] }>(
      `suppliers/${s.slug}_fabrics.json`
    );
    fabricRowCount += supplierData.fabrics.length;

    if (db) {
      let inserted = await db
        .insert(schema.suppliers)
        .values({ name: s.name })
        .onConflictDoNothing()
        .returning({ id: schema.suppliers.id });
      if (inserted.length === 0) {
        // Already exists from a previous run -- onConflictDoNothing() returns
        // no row on conflict, so re-fetch rather than crash on undefined.
        inserted = await db.select({ id: schema.suppliers.id }).from(schema.suppliers).where(
          eq(schema.suppliers.name, s.name)
        );
      }
      const supplierId = inserted[0].id;
      if (supplierData.fabrics.length) {
        // Only insert names this supplier doesn't already have a row for --
        // NOT just relying on the (supplierId, name, price) unique index,
        // which is what earlier idempotency fixes used. That index alone
        // isn't enough once a row's price can change after seeding: the
        // admin fabric-prices page (see adminActions.ts) edits a fabric's
        // pricePerMetre in place, and re-running this script afterwards
        // would then see the *edited* row as "not a conflict" against the
        // *original* JSON price, and insert a second, stale-priced
        // duplicate for the same name -- caught by actually fixing a fabric
        // via the admin UI and then re-running the seed script for real,
        // the same "run it for real" discipline that found every other
        // idempotency bug in this file. Checking existing names first, and
        // simply not touching a name the database already has, treats the
        // database as authoritative once seeded -- a live-edited price is
        // never silently reverted or duplicated by a later seed run. (Two
        // real same-name-different-price fabrics, e.g. Zepel "Dadaism" at
        // $70 and $95, still both land correctly on a first run: neither
        // name exists yet, so both pass this filter and go into the same
        // insert, where the unique index still keeps them as two distinct
        // rows rather than colliding.)
        const existingNames = new Set(
          (
            await db
              .select({ name: schema.fabrics.name })
              .from(schema.fabrics)
              .where(eq(schema.fabrics.supplierId, supplierId))
          ).map((r) => r.name)
        );
        const newFabrics = supplierData.fabrics.filter((f) => !existingNames.has(f.name));
        if (newFabrics.length) {
          await db
            .insert(schema.fabrics)
            .values(
              newFabrics.map((f) => {
                // A handful of real fabrics have an unusable cached price --
                // a literal "#N/A" formula error, or genuinely blank/null.
                // Keep the fabric name (it may appear on historical quotes)
                // but mark it inactive with no price rather than crashing on
                // an invalid numeric literal or silently writing "0.00".
                const usable = typeof f.price_per_metre === "number";
                if (!usable) unusablePriceCount++;
                return {
                  supplierId,
                  name: f.name,
                  pricePerMetre: usable ? String(f.price_per_metre) : null,
                  active: usable,
                };
              })
            )
            .onConflictDoNothing();
        }
      }
    }
  }
  console.log(`suppliers: ${supplierIndex.suppliers.length}, fabrics: ${fabricRowCount}`);
  if (unusablePriceCount) {
    console.log(
      `  (${unusablePriceCount} fabric(s) had an unusable source price -- "#N/A" or blank -- ` +
        `seeded inactive with no price rather than skipped or coerced to 0)`
    );
  }

  // ---- blind price grids -----------------------------------------------
  const grids = readJson<{ groups: any[] }>("price_grids/blind_price_grids.json");
  if (db) {
    for (const g of grids.groups) {
      await db.insert(schema.priceGridGroups).values({
        familySlug: g.family,
        groupNumber: g.group,
        widthBandsMm: g.width_bands_mm,
        heightBandsMm: g.height_bands_mm,
        priceMatrix: g.price_matrix,
        widthScaleMm: g.width_scale_mm,
        heightScaleMm: g.height_scale_mm,
        track: g.track ?? null,
      }).onConflictDoNothing();
    }
  }
  console.log(`price grid groups: ${grids.groups.length}`);

  // ---- blind fabric name -> price group, per source ---------------------
  const blindSettings = readJson<{ ranges: Record<string, any> }>(
    "settings/blind_settings_named_ranges.json"
  );
  let fabricOptionRowsAttempted = 0;
  let fabricOptionRowsInserted = 0;
  for (const [key, rows] of Object.entries(blindSettings.ranges)) {
    const m = key.match(/^(.*)FabricPrices$/);
    if (!m || !Array.isArray(rows)) continue;
    const source = m[1];
    const values = (rows as [string, number][])
      .filter((r) => Array.isArray(r) && typeof r[1] === "number")
      .map((r) => ({ familySlug: "blind", source, fabricName: r[0], priceGroup: r[1] }));
    fabricOptionRowsAttempted += values.length;
    if (db && values.length) {
      const inserted = await db
        .insert(schema.blindFabricOptions)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: schema.blindFabricOptions.id });
      fabricOptionRowsInserted += inserted.length;
    }
  }
  const skippedAsDuplicate = fabricOptionRowsAttempted - fabricOptionRowsInserted;
  console.log(
    db
      ? `blind fabric options: ${fabricOptionRowsInserted} inserted (of ${fabricOptionRowsAttempted} rows in the source data)`
      : `blind fabric options: ${fabricOptionRowsAttempted}`
  );
  if (db && skippedAsDuplicate > 0) {
    console.log(
      `  (${skippedAsDuplicate} skipped as duplicates -- either a re-run of this script, or a ` +
        `genuine internally-duplicated fabric name within one source's list, e.g. Roller's ` +
        `"E Screen 6%" appearing twice with two different price groups. That's a real source-` +
        `data ambiguity, not an extraction bug: first occurrence wins here, matching Excel's own ` +
        `VLOOKUP behaviour on the same duplicated data, so it's not a behaviour change from the ` +
        `workbook -- but worth Clive's attention since it means the "losing" group assignment is ` +
        `effectively unreachable. See app/README.md.)`
    );
  }

  // ---- control prices, per blind family ----------------------------------
  let controlPriceRows = 0;
  for (const [key, rows] of Object.entries(blindSettings.ranges)) {
    const m = key.match(/^(.*)ControlPrices$/);
    if (!m || !Array.isArray(rows)) continue;
    const familySlug = m[1];
    const values = (rows as [string, number][])
      .filter((r) => Array.isArray(r) && typeof r[1] === "number")
      .map((r) => ({ familySlug, controlType: r[0], price: String(r[1]) }));
    controlPriceRows += values.length;
    if (db && values.length) await db.insert(schema.controlPrices).values(values).onConflictDoNothing();
  }
  console.log(`control price rows: ${controlPriceRows}`);

  // ---- blind accessories --------------------------------------------------
  const accessories = readJson<{ accessories: [string, number][] }>(
    "price_grids/blind_accessories.json"
  );
  if (db) {
    await db
      .insert(schema.blindAccessories)
      .values(accessories.accessories.map(([name, price]) => ({ name, price: String(price) })))
      .onConflictDoNothing();
  }
  console.log(`blind accessories: ${accessories.accessories.length}`);

  // ---- option lists (dropdown values not covered by a dedicated table) ----
  // Everything in blind_settings/curtain_settings EXCEPT the "*FabricPrices"
  // and "*ControlPrices" suffixes above, which already have their own
  // tables. Covers things like RollerSources, RollerBrackets, RollerCassettes,
  // RollerChannels, RollerLinks, RollerControlTypes, plus the equivalents for
  // every other family and the curtain side -- so cascading dropdowns can be
  // DB-backed (and admin-editable later) rather than baked into the UI code.
  const curtainSettings = readJson<{ ranges: Record<string, any> }>(
    "settings/curtain_settings_named_ranges.json"
  );
  let optionListRows = 0;
  for (const ranges of [blindSettings.ranges, curtainSettings.ranges]) {
    for (const [name, values] of Object.entries(ranges)) {
      if (/FabricPrices$|ControlPrices$/.test(name)) continue;
      optionListRows++;
      if (db) {
        await db.insert(schema.optionLists).values({ name, values }).onConflictDoNothing();
      }
    }
  }
  console.log(`option lists: ${optionListRows}`);

  // ---- curtain price lists (track length -> price banded lookup) -----------
  // Never seeded before this phase -- curtain.ts read these straight from
  // the extraction JSON fixtures (see loadCurtainData.ts / curtain.ts's file
  // comment on making curtain pricing database-backed). NOTE the schema's
  // column name (trackLengthsMm) mirrors price_grid_groups' blind
  // convention, but these values are actually in CENTIMETRES, matching how
  // curtain.ts's own trackLengthCm/makeHeightCm are computed (see Phase 4's
  // cm-vs-mm finding, documented in curtain.ts) -- a naming mismatch worth
  // fixing properly later (a real column rename or a units column), flagged
  // here rather than left silently confusing.
  const curtainPricing = readJson<{ ranges: Record<string, unknown> }>(
    "curtain_pricing/named_ranges.json"
  );
  let curtainPriceListRows = 0;
  const skippedTrackLengthNames: string[] = [];
  for (const [key, values] of Object.entries(curtainPricing.ranges)) {
    if (!key.endsWith("TrackLengths")) continue;
    const name = key.slice(0, -"TrackLengths".length);
    const prices = curtainPricing.ranges[`${name}Prices`];
    if (!Array.isArray(values) || !Array.isArray(prices)) {
      skippedTrackLengthNames.push(name);
      continue;
    }
    curtainPriceListRows++;
    if (db) {
      await db
        .insert(schema.curtainPriceLists)
        .values({ name, trackLengthsMm: values, prices })
        .onConflictDoNothing();
    }
  }
  console.log(`curtain price lists: ${curtainPriceListRows}`);
  if (skippedTrackLengthNames.length) {
    console.log(
      `  (${skippedTrackLengthNames.length} track-length range(s) have no matching Prices range in ` +
        `the source data, so were skipped: ${skippedTrackLengthNames.join(", ")} -- one of these is a ` +
        `real case-mismatch in the workbook's own named ranges: "...somfySeries82rtsswaveTrackLengths" ` +
        `(lowercase "somfy") vs "...SomfySeries82rtsswavePrices" (capitalized) never match as the same ` +
        `name, so that track list has no usable price data in the source workbook either)`
    );
  }

  // ---- curtain direct-address tables (make-height / track-length adjustments) --
  // Also never seeded before this phase. No real named range backs these in
  // the source workbook (see Phase 4's finding: the Curtain Quote row
  // formulas reference these by raw cell address, e.g. $D$9:$E$102, not a
  // named range) -- so unlike everything else seeded into option_lists,
  // there's no original workbook name to reuse. These four names are
  // invented here for this app, not extracted from the workbook.
  const directTables = readJson<{
    finish_make_height_adjustment_D9_E102: unknown;
    track_make_height_adjustment_H9_I126: unknown;
    hook_make_height_adjustment_O9_P17: unknown;
    layout_track_length_adjustment_K10_L102: unknown;
  }>("settings/curtain_direct_address_tables.json");
  const directTableRows: { name: string; values: unknown }[] = [
    { name: "CurtainFinishMakeHeightAdjustment", values: directTables.finish_make_height_adjustment_D9_E102 },
    { name: "CurtainTrackMakeHeightAdjustment", values: directTables.track_make_height_adjustment_H9_I126 },
    { name: "CurtainHookMakeHeightAdjustment", values: directTables.hook_make_height_adjustment_O9_P17 },
    { name: "CurtainLayoutTrackLengthAdjustment", values: directTables.layout_track_length_adjustment_K10_L102 },
  ];
  if (db) {
    for (const row of directTableRows) {
      await db.insert(schema.optionLists).values(row).onConflictDoNothing();
    }
  }
  console.log(`curtain direct-address tables: ${directTableRows.length}`);

  // ---- families (product catalog) -----------------------------------------
  // All six blind families, sheer curtains, and Misc Quote now have working
  // UI (see app/README.md) -- this table is the product-catalog record of
  // that, and is what a future admin UI would edit rather than the app's
  // src/lib/blindFamilies.ts config (which is what the UI actually reads
  // from today; this table isn't queried by the app yet, but keeping it
  // accurate now avoids a stale catalog later).
  const familyRows: { slug: string; name: string; category: string; optionCascade: unknown }[] = [
    {
      slug: "roller",
      name: "Roller Blind",
      category: "blind",
      optionCascade: {
        fields: [
          { name: "fabricSource", label: "Fabric Source", optionsFrom: "RollerSources" },
          { name: "fabricName", label: "Fabric", dependsOn: "fabricSource" },
          { name: "controlType", label: "Control Type", optionsFrom: "RollerControlTypes" },
          { name: "bracketTrack", label: "Bracket / Track", optionsFrom: "RollerBrackets" },
          { name: "cassette", label: "Cassette", optionsFrom: "RollerCassettes" },
          { name: "sideChannels", label: "Side Channels", optionsFrom: "RollerChannels" },
          { name: "linked", label: "Linked", optionsFrom: "RollerLinks" },
        ],
      },
    },
    {
      slug: "venetian",
      name: "Venetian Blind",
      category: "blind",
      optionCascade: {
        fields: [
          { name: "fabricSource", label: "Fabric Source", optionsFrom: "VenetianSources" },
          { name: "fabricName", label: "Fabric", dependsOn: "fabricSource" },
          { name: "controlType", label: "Control Type", optionsFrom: "VenetianControlTypes" },
        ],
      },
    },
    {
      slug: "roman",
      name: "Roman Blind",
      category: "blind",
      optionCascade: {
        fields: [
          { name: "fabricSource", label: "Fabric Source", optionsFrom: "RomanSources" },
          { name: "fabricName", label: "Fabric", dependsOn: "fabricSource" },
          { name: "controlType", label: "Control Type", optionsFrom: "RomanControlTypes" },
        ],
      },
    },
    {
      slug: "panel",
      name: "Panel Glide",
      category: "blind",
      optionCascade: {
        fields: [
          { name: "fabricSource", label: "Fabric Source", optionsFrom: "PanelSources" },
          { name: "fabricName", label: "Fabric", dependsOn: "fabricSource" },
          { name: "controlType", label: "Control Type", optionsFrom: "PanelControlTypes" },
          { name: "bracketTrack", label: "Track / Panel Config", optionsFrom: "PanelBrackets" },
        ],
      },
    },
    {
      slug: "verishade",
      name: "Verishade",
      category: "blind",
      optionCascade: {
        fields: [
          { name: "fabricSource", label: "Fabric Source", optionsFrom: "VerishadeSources" },
          { name: "fabricName", label: "Fabric", dependsOn: "fabricSource" },
          { name: "controlType", label: "Control Type", optionsFrom: "VerishadeControlTypes" },
        ],
      },
    },
    {
      slug: "vertical",
      name: "Vertical Blind",
      category: "blind",
      optionCascade: {
        fields: [
          { name: "fabricSource", label: "Fabric Source", optionsFrom: "VerticalSources" },
          { name: "fabricName", label: "Fabric", dependsOn: "fabricSource" },
          { name: "controlType", label: "Control Type", optionsFrom: "VerticalControlTypes" },
        ],
      },
    },
    {
      slug: "s_wave_sheer",
      name: "Curtain (S Wave Sheer)",
      category: "curtain",
      optionCascade: {
        fields: [
          { name: "style", label: "Style", optionsFrom: "Styles" },
          { name: "finish", label: "Finish", optionsFrom: "Finish" },
          { name: "trackName", label: "Track", optionsFrom: "Tracks" },
          { name: "layout", label: "Layout", optionsFrom: "Layouts" },
        ],
      },
    },
    {
      slug: "misc",
      name: "Misc Quote item",
      category: "misc",
      optionCascade: { fields: [] }, // free text -- see misc.ts
    },
  ];
  if (db) {
    for (const f of familyRows) {
      await db.insert(schema.families).values(f).onConflictDoNothing();
    }
  }
  console.log(`families: ${familyRows.length}`);

  // ---- pricing constants (v1) ---------------------------------------------
  const constants = readJson<{ constants: Record<string, number> }>("settings/pricing_constants.json");
  const flatConstants = readJson<Record<string, number>>("price_grids/blind_flat_constants.json");
  const formulaLiterals = readJson<{ constants: Record<string, unknown> }>(
    "settings/formula_literal_constants.json"
  );
  if (db) {
    // No unique constraint on `label` to hang onConflictDoNothing() off of
    // (a real re-seed might legitimately want a new labeled version), but a
    // plain re-run of THIS script re-inserting "extraction-v1" every time
    // would otherwise pile up duplicate "active" versions -- caught by
    // actually re-running the seed against a real database. Guard explicitly.
    const [existing] = await db
      .select({ id: schema.pricingConstantsVersions.id })
      .from(schema.pricingConstantsVersions)
      .where(eq(schema.pricingConstantsVersions.label, "extraction-v1"));
    if (!existing) {
      await db.insert(schema.pricingConstantsVersions).values({
        label: "extraction-v1",
        constants: { ...constants.constants, ...flatConstants },
        formulaLiteralConstants: formulaLiterals.constants,
        isActive: true,
      });
    }
  }
  console.log("pricing constants: 1 version seeded");

  if (pool) await pool.end();
  console.log(db ? "\nSeed complete." : "\nDry run complete (no DATABASE_URL set, nothing written).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
