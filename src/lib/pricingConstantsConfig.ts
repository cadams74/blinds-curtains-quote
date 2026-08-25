/**
 * Which keys inside pricing_constants_versions.constants are actually real,
 * live editing targets -- and which aren't, even though they live in the
 * same JSON blob. This distinction matters enough to get its own file: the
 * extraction's "constants" bucket (settings/pricing_constants.json +
 * price_grids/blind_flat_constants.json, merged in seed.ts) is a grab-bag of
 * three very different things, found while building the admin UI for it:
 *
 * 1. Real $ cost constants genericBlind.ts's pricing math actually reads at
 *    request time via BlindDataSource.getPricingConstants() (see
 *    genericBlind.ts's `c.BoosterCost` etc, and pricingDataSource.ts, which
 *    is what wires the DB's active version into that interface for the live
 *    app). Editing one of these THROUGH THE ADMIN UI changes what every
 *    Roller/Venetian/Roman/Panel/Verishade/Vertical quote costs, immediately,
 *    no redeploy -- these are EDITABLE_BLIND_CONSTANTS below.
 * 2. Real $ cost constants curtain.ts's pricing math reads (MitreCost,
 *    BendCost, the 8 curtain-making variants) -- curtain.ts is now
 *    database-backed too (curtainDataSource.ts, see app/README.md's "The
 *    app layer"), so these are genuinely live: EDITABLE_CURTAIN_CONSTANTS
 *    below.
 * 3. Everything else in the blob (per-price-grid-group *WScale/*HScale
 *    values, single-value duplicates of option-list data like
 *    "VenetianSources": "Venetian", DefaultLiningName, ItemsPerPage, and
 *    similar) are extraction artifacts, not live pricing knobs -- nothing
 *    in the app reads them by these names at runtime (price grid scale
 *    values come from price_grid_groups' own widthScaleMm/heightScaleMm
 *    columns, populated once at seed time, not re-read from here). Left out
 *    of the admin UI entirely rather than shown as editable-but-inert.
 *    `CordCost` also belongs in this bucket, not bucket 2 -- it looked like
 *    a real curtain constant (it's grouped with MitreCost/BendCost in the
 *    source data) but a full grep of curtain.ts found no code that ever
 *    reads it; corrected here rather than left listed as live.
 */

export interface ConstantField {
  key: string;
  label: string;
  /** Which families this affects, for the UI copy. */
  appliesTo: string;
}

export const EDITABLE_BLIND_CONSTANTS: ConstantField[] = [
  { key: "InstallationCost", label: "Installation cost", appliesTo: "all 6 blind families" },
  { key: "InstallationCostOnDual", label: "Installation cost (On Dual bracket)", appliesTo: "Roller" },
  { key: "BoosterCost", label: "Booster cost (oversized surcharge)", appliesTo: "Roller only" },
  { key: "RoundCassetteCost", label: "Round cassette cost ($/m width)", appliesTo: "Roller" },
  { key: "SquareCassetteCost", label: "Square cassette cost ($/m width)", appliesTo: "Roller" },
  { key: "SideChannelCost", label: "Side channel cost ($/m height)", appliesTo: "Roller" },
  { key: "DualCompactCost", label: "Dual Compact bracket cost", appliesTo: "Roller" },
  { key: "SingleIntermediateCost", label: "Single intermediate (link) cost", appliesTo: "Roller (linked blinds)" },
  { key: "DoubleIntermediateCost", label: "Double intermediate (link) cost", appliesTo: "Roller (linked, Dual Compact)" },
  { key: "IntermediateDriversCost", label: "Intermediate drivers cost (per driver)", appliesTo: "Roller (linked blinds)" },
];

export const EDITABLE_CURTAIN_CONSTANTS: ConstantField[] = [
  { key: "MitreCost", label: "Mitre cost", appliesTo: "curtains (x2 per curtain)" },
  { key: "BendCost", label: "Bend cost", appliesTo: "curtains (per bend, from Layout)" },
  { key: "OtherUnlinedCurtainMaking", label: "Unlined making cost ($/m, standard)", appliesTo: "curtains" },
  { key: "OtherUnlinedCurtainMakingOver", label: "Unlined making cost ($/m, Over/OH)", appliesTo: "curtains" },
  { key: "OtherLinedCurtainMaking", label: "Lined making cost ($/m, standard)", appliesTo: "curtains" },
  { key: "OtherLinedCurtainMakingOver", label: "Lined making cost ($/m, Over/OH)", appliesTo: "curtains" },
  { key: "UpleatUnlinedCurtainMaking", label: "Upleat unlined making cost ($/m, standard)", appliesTo: "curtains" },
  { key: "UpleatUnlinedCurtainMakingOver", label: "Upleat unlined making cost ($/m, Over/OH)", appliesTo: "curtains" },
  { key: "UpleatLinedCurtainMaking", label: "Upleat lined making cost ($/m, standard)", appliesTo: "curtains" },
  { key: "UpleatLinedCurtainMakingOver", label: "Upleat lined making cost ($/m, Over/OH)", appliesTo: "curtains" },
];
