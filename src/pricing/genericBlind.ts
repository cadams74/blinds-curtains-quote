/**
 * Shared pricing logic for every blind family in Blind_Pricing. Ported from
 * the Blind Quote sheet's row formulas, which are already written generically
 * against the blind type in column D (INDIRECT(D3 & "Group" & Q3 & ...) etc)
 * -- so one engine covers Roller, Venetian, Roman, Panel, Verishade, and
 * Vertical, with only a couple of family-specific branches (booster is
 * Roller-only, track pricing is Panel-only) exactly as the source formulas
 * special-case them. Honeycomb needs one extra parameter (see honeycomb.ts)
 * because its family name is built from blind type *and* control style
 * (D3 & IF(D3="Honeycomb",J3,"") & "Group" & ...) -- see that file for why.
 *
 * Validated against 27 real Roller blind quote lines (see roller.test.ts).
 * The family-specific extras below (booster, Panel track pricing) reuse the
 * exact same formulas the Roller engine validated; the mechanical part of
 * supporting other families (parameterizing on family name) is low-risk
 * because AU/AV/AX/AY/AZ/BA were already written generically against D3 in
 * the source. Still: only Roller has been checked against real numbers.
 * Venetian/Roman/Panel/Verishade/Vertical have zero real historical rows in
 * the sample quote to validate against (see genericBlind.test.ts for the
 * hand-computed cross-checks used instead).
 */
import { ceilingTo, priceGridLookup } from "./bandLookup.js";
import {
  getControlPrice,
  getFabricGroup,
  getPriceGrid,
  getPricingConstants,
  type PriceGridGroup,
} from "./loadData.js";

/**
 * Everything priceFromGrid()/priceGenericBlind() need to look up. Defaults
 * to the JSON-extraction-backed functions in loadData.ts (exactly what
 * roller.ts, honeycomb.ts, and every existing test use -- zero behaviour
 * change for any current caller). The live Next.js app injects a DB-backed
 * implementation instead (see app/src/lib/pricingDataSource.ts) so admin-
 * edited prices/constants take effect without a redeploy, while the
 * validated engine itself, and everything it's tested against, stays
 * untouched.
 */
export interface BlindDataSource {
  getPricingConstants(): Record<string, number>;
  getPriceGrid(family: string, group: number): PriceGridGroup;
  getFabricGroup(source: string, fabricName: string): number | null;
  getControlPrice(familyLabel: string, controlType: string): number;
}

const defaultDataSource: BlindDataSource = {
  getPricingConstants,
  getPriceGrid,
  getFabricGroup,
  getControlPrice,
};

export type BlindFamily = "Roller" | "Venetian" | "Roman" | "Panel" | "Verishade" | "Vertical";

export interface GenericBlindInput {
  family: BlindFamily;
  widthMm: number;
  heightMm: number;
  fabricSource: string;
  fabricName: string;
  controlType?: string;
  bracketTrack?: string; // "Dual Compact" | "On Dual" | ... (Roller); track/bracket choice for others
  cassette?: "Round" | "Square";
  sideChannels?: boolean;
  linked?: boolean;
}

export interface GenericBlindBreakdown {
  fabricGroup: number;
  blindPricing: number; // AR
  freight: number; // AS
  booster: number; // AT (Roller only)
  cassettesCost: number; // AU
  sideChannelsCost: number; // AV
  tracksCost: number; // AW (Panel only)
  bracketCost: number; // AX
  linksCost: number; // AY
  controlsCost: number; // AZ
  installationCost: number; // BA
  calculatedPrice: number; // ROUNDUP(SUM(AR:BA), 0)
}

export type GenericBlindResult =
  | { ok: true; breakdown: GenericBlindBreakdown }
  | { ok: false; reason: "fabric_not_found" | "width_or_height_exceeds_price_bands" };

/** Internal: shared by genericBlind() and honeycomb.ts, which resolves its
 * own fabric group / price-grid family name before calling this. */
export function priceFromGrid(
  args: {
    family: BlindFamily | "Honeycomb";
    priceGridFamilyName: string; // e.g. "Roller", or "HoneycombCordless" for honeycomb
    fabricGroup: number;
    widthMm: number;
    heightMm: number;
    controlType?: string;
    bracketTrack?: string;
    cassette?: "Round" | "Square";
    sideChannels?: boolean;
    linked?: boolean;
  },
  data: BlindDataSource = defaultDataSource
): GenericBlindResult {
  const c = data.getPricingConstants();
  const grid = data.getPriceGrid(args.priceGridFamilyName, args.fabricGroup);
  const rawPrice = priceGridLookup(grid, args.widthMm, args.heightMm);
  if (rawPrice === null) return { ok: false, reason: "width_or_height_exceeds_price_bands" };

  const blindPricing = rawPrice * 1.88;
  const freight = blindPricing > 0 ? 6 : 0;

  const booster =
    args.family === "Roller" && args.heightMm > 1800 && args.widthMm > 2000 ? c.BoosterCost : 0;

  const cassettesCost = args.cassette
    ? (ceilingTo(args.widthMm, 1000) / 1000) *
      (args.cassette === "Round" ? c.RoundCassetteCost : c.SquareCassetteCost)
    : 0;

  const sideChannelsCost = args.sideChannels
    ? (ceilingTo(args.heightMm, 1000) / 1000) * c.SideChannelCost
    : 0;

  let tracksCost = 0;
  if (args.family === "Panel") {
    const panelGrid = data.getPriceGrid(args.priceGridFamilyName, args.fabricGroup);
    if (panelGrid.track && args.bracketTrack) {
      const floor = Math.min(...panelGrid.track.width_bands_mm);
      const widthTarget = Math.max(floor, ceilingTo(args.widthMm, panelGrid.track.width_scale_mm));
      const wIdx = panelGrid.track.width_bands_mm.indexOf(widthTarget);
      if (wIdx !== -1) tracksCost = panelGrid.track.price_matrix[0][wIdx] * 1.88;
    }
  }

  const bracketCost = args.bracketTrack === "Dual Compact" ? c.DualCompactCost : 0;

  const linksCost = args.linked
    ? args.bracketTrack === "Dual Compact"
      ? c.DoubleIntermediateCost + 2 * c.IntermediateDriversCost
      : c.SingleIntermediateCost + c.IntermediateDriversCost
    : 0;

  const controlsCost = args.controlType ? data.getControlPrice(args.family, args.controlType) : 0;

  const installationCost = args.bracketTrack === "On Dual" ? c.InstallationCostOnDual : c.InstallationCost;

  const sum =
    blindPricing +
    freight +
    booster +
    cassettesCost +
    sideChannelsCost +
    tracksCost +
    bracketCost +
    linksCost +
    controlsCost +
    installationCost;

  return {
    ok: true,
    breakdown: {
      fabricGroup: args.fabricGroup,
      blindPricing,
      freight,
      booster,
      cassettesCost,
      sideChannelsCost,
      tracksCost,
      bracketCost,
      linksCost,
      controlsCost,
      installationCost,
      calculatedPrice: Math.ceil(sum),
    },
  };
}

export function priceGenericBlind(
  input: GenericBlindInput,
  data: BlindDataSource = defaultDataSource
): GenericBlindResult {
  const fabricGroup = data.getFabricGroup(input.fabricSource, input.fabricName);
  if (fabricGroup === null) return { ok: false, reason: "fabric_not_found" };

  return priceFromGrid({
    family: input.family,
    priceGridFamilyName: input.family,
    fabricGroup,
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    controlType: input.controlType,
    bracketTrack: input.bracketTrack,
    cassette: input.cassette,
    sideChannels: input.sideChannels,
    linked: input.linked,
  }, data);
}
