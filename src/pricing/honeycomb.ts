/**
 * Honeycomb blind pricing. Structurally the same as genericBlind.ts, with
 * one wrinkle: the source formula builds the price-grid family name as
 * `D3 & IF(D3="Honeycomb", J3, "") & "Group" & Q3 & ...` -- i.e. for every
 * other family the grid is just "<BlindType>Group<N>", but for Honeycomb
 * it's "<BlindType><ControlType>Group<N>", because the "Control Type"
 * column doubles as the honeycomb lifting-mechanism style (Classic /
 * Easy_Rise / Cordless), and each style has its own separate price grid
 * (see extraction/output/price_grids: HoneycombClassicGroup1-3,
 * HoneycombEasy_RiseGroup1-3, HoneycombCordlessGroup1-3). Fabric group (1-3)
 * is a *separate* axis from style, shared across all three styles
 * (Blind_Settings HoneycombFabricNames/Prices: Harlem TL=1, Harlem BO=2,
 * Clarity Sheer=3).
 *
 * IMPORTANT -- unlike Roller, this has NOT been validated against real
 * numbers. The sample quote has 5 real Honeycomb line items, but all 5 have
 * #REF! errors in their own cached calculated-price cells: their Fabric
 * Source column was left blank (Honeycomb's own source list has exactly one
 * valid value, "Honeycomb", easy to overlook), so the source spreadsheet's
 * own fabric-group lookup came back 0, which doesn't correspond to any real
 * price grid. The estimator worked around it by typing a manual price
 * override rather than fixing the input. This is a genuine real-world
 * failure mode worth designing the new UI around (a proper required <select>
 * with only one option, defaulted, rather than a blank cell) -- see
 * app/README.md.
 *
 * Because there was no clean real example to validate against, this was
 * checked instead with hand-computed cross-checks directly against the
 * extracted price grid JSON -- see honeycomb.test.ts.
 */
import { getFabricGroup, getPricingConstants } from "./loadData.js";
import { priceFromGrid, type GenericBlindResult } from "./genericBlind.js";

export type HoneycombStyle = "Classic" | "Easy_Rise" | "Cordless";

export interface HoneycombInput {
  style: HoneycombStyle; // the "Control Type" column's intended values
  widthMm: number;
  heightMm: number;
  fabricName: string; // one of Harlem TL / Harlem BO / Clarity Sheer
  bracketTrack?: string;
  linked?: boolean;
}

export function priceHoneycomb(input: HoneycombInput): GenericBlindResult {
  const fabricGroup = getFabricGroup("Honeycomb", input.fabricName);
  if (fabricGroup === null) return { ok: false, reason: "fabric_not_found" };

  return priceFromGrid({
    family: "Honeycomb",
    priceGridFamilyName: `Honeycomb${input.style}`,
    fabricGroup,
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    bracketTrack: input.bracketTrack,
    linked: input.linked,
    // Honeycomb has no <Family>ControlPrices table in the source (the
    // "control type" slot is used for style, not a priced mechanism), so
    // controlType is intentionally omitted -- controlsCost is always 0,
    // matching the source (IFERROR(...,0) with no HoneycombControlPrices
    // named range to find).
  });
}

// re-exported for convenience / consistency with genericBlind's public API
export { getPricingConstants };
