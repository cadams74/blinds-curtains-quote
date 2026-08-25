/**
 * Which option_lists rows are actually fetched by a live form today, vs.
 * seeded but not currently read by anything. Hand-maintained (grep the app
 * for `getOptionListValues(db, "...")` calls to re-derive this if a new
 * form is added) rather than computed dynamically, the same tradeoff
 * blindFamilies.ts already makes -- a short, explicit list is easier to
 * audit than machinery that reads route files at runtime.
 *
 * The option_lists table has 75 rows total, seeded from every named range
 * in the workbook's Blind_Settings/Curtain_Settings sheets that isn't a
 * *FabricPrices/*ControlPrices table (see seed.ts) -- which means it also
 * picked up plenty of things that aren't flat dropdown lists at all: single
 * numeric/string values (BendCost, ItemsPerPage), and paired-data tables
 * (Fullnesses, LayoutBends) that curtain.ts actually uses for pricing, but
 * reads from the static extraction JSON, not this table (same caveat as
 * pricingConstantsConfig.ts's curtain constants -- see that file). Editing
 * any of those here is still allowed (the admin page doesn't hide them),
 * just clearly badged as not currently wired to a live form, so an edit
 * there doesn't look like it did something it didn't.
 */
export const LIVE_OPTION_LIST_NAMES: ReadonlySet<string> = new Set([
  // Roller's own dedicated form (src/app/quotes/[id]/line-items/new/roller/)
  "RollerSources",
  "RollerBrackets",
  "RollerCassettes",
  "RollerChannels",
  "RollerLinks",
  "RollerControlTypes",
  // The five genericBlind.ts families' shared form, per blindFamilies.ts
  "VenetianSources",
  "VenetianControlTypes",
  "RomanSources",
  "RomanControlTypes",
  "PanelSources",
  "PanelControlTypes",
  "PanelBrackets",
  "VerishadeSources",
  "VerishadeControlTypes",
  "VerticalSources",
  "VerticalControlTypes",
  // Curtain form (src/app/quotes/[id]/line-items/new/curtain/)
  "Styles",
  "Finish",
  "Tracks",
  "Layouts",
]);
