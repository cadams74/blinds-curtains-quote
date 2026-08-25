/**
 * Roller blind pricing. Thin, family-fixed wrapper around genericBlind.ts
 * (the shared engine covering every non-Honeycomb blind family) -- kept as
 * its own module/types since it's the one validated against 27 real
 * historical quote lines (see roller.test.ts) and is the reference example
 * for how the other families were built on top of the same shared logic.
 */
import { priceGenericBlind, type GenericBlindBreakdown, type BlindDataSource } from "./genericBlind.js";

export interface RollerBlindInput {
  widthMm: number;
  heightMm: number;
  fabricSource: string;
  fabricName: string;
  controlType: string;
  bracketTrack?: string;
  cassette?: "Round" | "Square";
  sideChannels?: boolean;
  linked?: boolean;
}

export interface RollerBlindBreakdown {
  fabricGroup: number;
  blindPricing: number;
  freight: number;
  booster: number;
  cassettesCost: number;
  sideChannelsCost: number;
  tracksCost: number;
  rollerBracketsCost: number;
  linksCost: number;
  controlsCost: number;
  installationCost: number;
  calculatedPrice: number;
}

export type RollerBlindResult =
  | { ok: true; breakdown: RollerBlindBreakdown }
  | { ok: false; reason: "fabric_not_found" | "width_or_height_exceeds_price_bands" };

function toRollerBreakdown(b: GenericBlindBreakdown): RollerBlindBreakdown {
  return {
    fabricGroup: b.fabricGroup,
    blindPricing: b.blindPricing,
    freight: b.freight,
    booster: b.booster,
    cassettesCost: b.cassettesCost,
    sideChannelsCost: b.sideChannelsCost,
    tracksCost: b.tracksCost,
    rollerBracketsCost: b.bracketCost,
    linksCost: b.linksCost,
    controlsCost: b.controlsCost,
    installationCost: b.installationCost,
    calculatedPrice: b.calculatedPrice,
  };
}

export function priceRollerBlind(
  input: RollerBlindInput,
  data?: BlindDataSource
): RollerBlindResult {
  const result = data
    ? priceGenericBlind({ family: "Roller", ...input }, data)
    : priceGenericBlind({ family: "Roller", ...input });
  return result.ok ? { ok: true, breakdown: toRollerBreakdown(result.breakdown) } : result;
}
