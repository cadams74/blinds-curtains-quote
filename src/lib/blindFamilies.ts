/**
 * UI/route config for the five blind families that share genericBlind.ts
 * (Roller is deliberately not here -- it has its own dedicated route/form
 * because it has extra fields (cassette/side channels/links) none of these
 * five have in the source workbook, and it's the one family validated
 * against real data -- see app/README.md).
 *
 * Each family's sourcesList/controlTypesList/bracketTrackList points at an
 * option_lists row seeded from the workbook's own named ranges (see
 * seed.ts). Not every family has every field: only Panel has a bracket/
 * track option in the source data (PanelBrackets), and only Roller has a
 * priced ControlPrices table -- Venetian/Roman/Panel/Verishade/Vertical all
 * have a Control Type dropdown but it prices to $0, because the source
 * workbook itself has no <Family>ControlPrices table for them. That's not a
 * bug here, it's what's actually in the spreadsheet.
 *
 * `pricingFamily` must match both genericBlind.ts's BlindFamily union and
 * the family_slug values in price_grid_groups (from price_grids/
 * blind_price_grids.json's "family" field) -- verified against the
 * extraction output while building this.
 */
import type { BlindFamily } from "@/pricing/genericBlind";

export interface BlindFamilyUiConfig {
  slug: string; // URL segment, e.g. "venetian"
  label: string; // "Venetian Blind"
  pricingFamily: BlindFamily;
  sourcesList: string;
  controlTypesList: string;
  bracketTrackList?: string;
  // Non-pricing fields, extracted from the Blind Quote sheet the same way
  // curtain's Fitting/Ctrl Side were (see CurtainLineItemForm.tsx and
  // actions.ts) -- present on every row in the source sheet but never fed
  // into priceGenericBlind()/priceRollerBlind() because they don't appear
  // in any of the AR:BA pricing-formula columns. controlSidesList is a
  // per-family named range (e.g. VenetianControlSides); baseStylesList only
  // exists for Roller and Panel in the source workbook's Blind_Settings --
  // the other four families have no base-style dropdown at all.
  controlSidesList: string;
  baseStylesList?: string;
}

export const GENERIC_BLIND_FAMILIES: BlindFamilyUiConfig[] = [
  {
    slug: "venetian",
    label: "Venetian Blind",
    pricingFamily: "Venetian",
    sourcesList: "VenetianSources",
    controlTypesList: "VenetianControlTypes",
    controlSidesList: "VenetianControlSides",
  },
  {
    slug: "roman",
    label: "Roman Blind",
    pricingFamily: "Roman",
    sourcesList: "RomanSources",
    controlTypesList: "RomanControlTypes",
    controlSidesList: "RomanControlSides",
  },
  {
    slug: "panel",
    label: "Panel Glide",
    pricingFamily: "Panel",
    sourcesList: "PanelSources",
    controlTypesList: "PanelControlTypes",
    bracketTrackList: "PanelBrackets",
    controlSidesList: "PanelControlSides",
    baseStylesList: "PanelBaseStyles",
  },
  {
    slug: "verishade",
    label: "Verishade",
    pricingFamily: "Verishade",
    sourcesList: "VerishadeSources",
    controlTypesList: "VerishadeControlTypes",
    controlSidesList: "VerishadeControlSides",
  },
  {
    slug: "vertical",
    label: "Vertical Blind",
    pricingFamily: "Vertical",
    sourcesList: "VerticalSources",
    controlTypesList: "VerticalControlTypes",
    controlSidesList: "VerticalControlSides",
  },
];

export function getBlindFamilyConfig(slug: string): BlindFamilyUiConfig | undefined {
  return GENERIC_BLIND_FAMILIES.find((f) => f.slug === slug);
}

// Every family_slug that quotes as a blind -- Roller plus the five
// genericBlind.ts families above. Honeycomb excluded, same reason as
// everywhere else it's excluded: no live quoting route yet (see app
// README). Shared by anything that needs to treat "is this line item a
// blind" as one check -- blind-grid/page.tsx's line-item query and
// quoteViews.ts's Blind Grid predicate, rather than each redefining the
// same list.
export const ALL_BLIND_FAMILY_SLUGS = ["roller", ...GENERIC_BLIND_FAMILIES.map((f) => f.slug)];

// The source workbook's own "Blind Type" values (Blind_Settings!$A$2:$A$9,
// the BlindTypes named range) keyed by our URL slug -- matches exactly,
// since pricingFamily was chosen to match this list in the first place.
// Shared by blind-grid/page.tsx and blind-install/page.tsx, both of which
// need to show "Roller"/"Venetian"/etc. rather than the internal slug.
export const BLIND_TYPE_LABELS: Record<string, string> = {
  roller: "Roller",
  ...Object.fromEntries(GENERIC_BLIND_FAMILIES.map((f) => [f.slug, f.pricingFamily])),
};
