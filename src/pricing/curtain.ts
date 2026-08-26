/**
 * Curtain pricing -- ported from the Curtain Quote sheet's row formulas.
 * Structurally different from the blind families: instead of a 2D width x
 * height banded grid, it's fullness ratio x fabric metreage x a 1D
 * track-length-banded price, plus lining/making-cost lookups.
 *
 * VALIDATED against 8 real historical "S Wave Sheer" quote lines (unlined,
 * sheer, not "OH"/"Over" variant, not two-way-affecting) -- see
 * curtain.test.ts. The other 3 real lines in the sample quote have their
 * own #N/A errors in the source workbook (their required track length
 * exceeded the largest published band for that track series -- the same
 * "oversized -> needs a manual price" failure mode found in the blind
 * families and Honeycomb; see priceCurtain's "track_length_exceeds_bands"
 * result, deliberately mirroring it rather than guessing a price).
 *
 * Several branches below are transcribed directly from the source formulas
 * but NOT exercised by any of the 11 real rows (all "S Wave Sheer",
 * unlined, non-"OH"): the Lined lining-cost path, the non-sheer/Upleat
 * fabric-quantity formula (AQ-based, vs. the validated AR-based sheer
 * formula), the "Over 270cm" and "OH" 2.2x making-cost surcharge, and the
 * Upleat-specific track-pricing lookup. Each is marked below. Treat these
 * the same way as the blind engine's unvalidated cassette/side-channel
 * paths: plausible, formula-accurate, but pending a real example.
 */
import {
  getBendCount,
  getCurtainPricingConstants,
  getFinishMakeHeightAdjustment,
  getFullness,
  getHookMakeHeightAdjustment,
  getLayoutTrackLengthAdjustment,
  getTrackMakeHeightAdjustment,
  getTrackPriceList,
} from "./loadCurtainData.js";

/**
 * Same pattern as genericBlind.ts's BlindDataSource (see that file's
 * comment) -- lets the live app price off the database instead of the
 * static extraction JSON, with zero change to the pricing math itself.
 * `defaultCurtainDataSource` (JSON-backed, via loadCurtainData.ts) is the
 * default, so curtain.test.ts's existing calls (`priceCurtain(input)`, no
 * second argument) keep exercising the exact same code path unchanged. The
 * live app instead passes `loadCurtainDataSource(db)`'s result -- see
 * curtainDataSource.ts.
 */
export interface CurtainDataSource {
  getPricingConstants(): Record<string, number>;
  getTrackPriceList(key: string): { lengths: number[]; prices: number[] } | null;
  getFullness(style: string): number | null;
  getBendCount(layout: string): number;
  getFinishMakeHeightAdjustment(finish: string): number;
  getTrackMakeHeightAdjustment(trackName: string): number;
  getHookMakeHeightAdjustment(hooks: string): number;
  getLayoutTrackLengthAdjustment(layout: string): number;
}

export const defaultCurtainDataSource: CurtainDataSource = {
  getPricingConstants: getCurtainPricingConstants,
  getTrackPriceList,
  getFullness,
  getBendCount,
  getFinishMakeHeightAdjustment,
  getTrackMakeHeightAdjustment,
  getHookMakeHeightAdjustment,
  getLayoutTrackLengthAdjustment,
};

export interface CurtainInput {
  style: string; // D column, e.g. "S Wave Sheer" -- drives fullness, sheer/OH/wide/upleat detection
  liningInput: "U" | "L"; // E column
  finish: string; // F column, e.g. "  Top Fix" (leading spaces are real -- match the source's own labels)
  trackName: string; // N column, e.g. "  TW Series 74 Venice"
  pricePerMetre: number; // M column
  layout: string; // U column, e.g. "Wall Right"
  leftReturnCm: number; // P
  rightReturnCm: number; // Q
  overlapCm?: number; // R
  lpwCm?: number; // V -- blank in the source for some layouts (e.g. "Wall to Wall", which only fills W); Excel's SUM() treats a blank as 0, so we do too
  wwCm?: number; // W
  rpwCm?: number; // X
  heightCm: number; // Z
  hooks: string; // AG column, e.g. "USpike"
  // H column, e.g. "2W" -- the "Stacks" named range (Curtain_Settings!$G$9:
  // $G$13: "1WL","1WR","2W","1ANY","2ANY"). Only feeds the "2way?" flag (AM
  // column) that drives Width Definition below -- confirmed against the
  // source formulas that it plays no part in trackLengthCm, makeHeightCm, or
  // fabricQuantityM, so it was never needed for calculatedPrice and got
  // dropped when this engine was first ported. Needed now to reproduce AT's
  // "Width Definition" string, which the (not yet built) Curtain Install
  // document pulls by raw cell reference.
  stack: string;
}

export interface CurtainBreakdown {
  fullness: number;
  trackLengthCm: number;
  makeHeightCm: number;
  fabricQuantityM: number;
  trackPricing: number; // AY
  mitres: number; // AZ
  bends: number; // BA
  curtainMaking: number; // BB
  fabricPricing: number; // BC
  liningPricing: number; // BD
  installation: number; // BE
  calculatedPrice: number; // ROUNDUP(SUM(AY:BE), 0)
  // AT column -- a workroom-facing shorthand for how many fabric widths
  // (leaves) make up the curtain and how much fabric each needs, e.g.
  // "2x7.4m" (a pair, 7.4m of fabric each side) or "1x9.7m" (a single
  // panel). Doesn't feed calculatedPrice at all -- purely descriptive, but
  // it's what the Curtain Install document (Curtain Install!D5 etc., via
  // VLOOKUP(...,'Curtain Quote'!...,46,0)) shows installers per line.
  widthDefinition: string;
}

export type CurtainResult =
  | { ok: true; breakdown: CurtainBreakdown }
  | {
      ok: false;
      reason:
        | "fullness_not_found"
        | "track_length_exceeds_bands"
        | "unvalidated_style_variant";
    };

function isSheer(style: string) {
  return /sheer/i.test(style);
}
function isUpleat(style: string) {
  return /upleat/i.test(style);
}
function isOH(style: string) {
  return /oh/i.test(style);
}
function isWide(style: string) {
  return /xw/i.test(style);
}
function isTwinOrInvertedLining(style: string) {
  return ["Twin Lining", "Twin Lining OH", "Inverted Lining", "Inverted Lining OH"].includes(style);
}
// AM3: IF(OR(H3="2W",H3="2ANY"),2,""). Excel's "=" comparison is
// case-insensitive, so match the same way rather than assume the DB-seeded
// "Stacks" values always arrive in the exact case shown in the dropdown.
function isTwoWay(stack: string) {
  const s = stack.trim().toUpperCase();
  return s === "2W" || s === "2ANY";
}

/** 1D ascending band lookup: smallest published length >= target, else null
 * (mirrors the source's array-formula LOOKUP(MIN(IF(bands>=target,bands)),...),
 * which returns #N/A -- requiring a manual price -- when the target exceeds
 * every published band). */
function trackPriceLookup(lengths: number[], prices: number[], targetCm: number): number | null {
  let bestIdx = -1;
  let bestLen = Infinity;
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] >= targetCm && lengths[i] < bestLen) {
      bestLen = lengths[i];
      bestIdx = i;
    }
  }
  return bestIdx === -1 ? null : prices[bestIdx];
}

export function priceCurtain(
  input: CurtainInput,
  data: CurtainDataSource = defaultCurtainDataSource
): CurtainResult {
  const c = data.getPricingConstants();

  const fullness = data.getFullness(input.style);
  if (fullness === null) return { ok: false, reason: "fullness_not_found" };

  const type = isUpleat(input.style) ? "Upleat" : "Other";
  const linedUnlined = input.liningInput === "U" ? "Unlined" : "Lined";
  const sheer = isSheer(input.style);
  const ohFlag = isOH(input.style); // AX: style name contains "OH" -- NOT height-based
  const wide = isWide(input.style);

  // Source formula is SUM(V3:X3)+adjustment -- Excel's SUM treats blank cells
  // as 0 rather than erroring, which real rows rely on (e.g. "Wall to Wall"
  // layout rows only fill W, leaving V and X blank).
  const trackLengthCm =
    (input.lpwCm ?? 0) +
    (input.wwCm ?? 0) +
    (input.rpwCm ?? 0) +
    data.getLayoutTrackLengthAdjustment(input.layout);

  const makeHeightCm =
    input.heightCm +
    data.getFinishMakeHeightAdjustment(input.finish) +
    data.getTrackMakeHeightAdjustment(input.trackName) +
    data.getHookMakeHeightAdjustment(input.hooks);

  // "Over 270cm" surcharge flag is height-based, but ONLY for non-sheer
  // styles (the source formula's AND(...,AK3="",...) requires "not sheer").
  const overFlag = !sheer && !isTwinOrInvertedLining(input.style) && makeHeightCm > 270;

  // --- fabric quantity (metres) ---------------------------------------
  // VALIDATED path: sheer, not-OH (our 8 real fixtures all take this branch).
  // The formula also fires for Twin/Inverted Lining (without Over) or Wide
  // curtains regardless of sheer -- transcribed but NOT validated by real
  // data (none of the 11 real rows are those styles).
  const usesSheerMetresFormula =
    (sheer && !ohFlag) ||
    (input.style === "Twin Lining" && !overFlag) ||
    (input.style === "Inverted Lining" && !overFlag) ||
    wide;

  let fabricQuantityM: number;
  if (usesSheerMetresFormula) {
    const roundedTrack = Math.ceil(trackLengthCm * 1.03);
    fabricQuantityM =
      Math.ceil(
        ((roundedTrack + input.leftReturnCm + input.rightReturnCm + (input.overlapCm ?? 0) * 2) *
          fullness) /
          100 *
          10
      ) / 10; // ROUNDUP(...,1)
  } else {
    // UNVALIDATED: the non-sheer/non-special-case fabric quantity formula
    // (AQ-based: (ROUNDUP(trackLength*1.03,0)+P+Q+R)*fullness/(140+/-adjustments),
    // then further processed into a "drops" count). Deliberately not
    // transcribed here -- no real example to check it against yet, and a
    // wrong guess here would silently mis-price every non-sheer curtain
    // style. Report clearly instead of pretending to price it.
    return { ok: false, reason: "unvalidated_style_variant" };
  }

  // --- track pricing (AY) ----------------------------------------------
  const trackKey = `${type}WS${input.trackName.replace(/ /g, "")}`;
  const trackList = data.getTrackPriceList(trackKey);
  const rawTrackPrice = trackList
    ? trackPriceLookup(trackList.lengths, trackList.prices, trackLengthCm)
    : null;
  if (rawTrackPrice === null) return { ok: false, reason: "track_length_exceeds_bands" };
  const trackPricing = rawTrackPrice * 1.1 * 2;

  // --- mitres (AZ) --------------------------------------------------------
  const mitres = isTwinOrInvertedLining(input.style) ? 0 : 2 * c.MitreCost;

  // --- bends (BA) -----------------------------------------------------
  const bends = data.getBendCount(input.layout) * c.BendCost;

  // --- curtain making (BB) ---------------------------------------------
  const overSuffix = overFlag || ohFlag ? "Over" : "";
  const makingKey = `${type}${linedUnlined}CurtainMaking${overSuffix}` as keyof typeof c;
  const makingRate = c[makingKey] ?? 0;
  const sheerOverMultiplier = (sheer || isTwinOrInvertedLining(input.style)) && ohFlag ? 2.2 : 1;
  const curtainMaking = makingRate * fabricQuantityM * sheerOverMultiplier;

  // --- fabric pricing (BC) ----------------------------------------------
  const fabricPricing = input.pricePerMetre * fabricQuantityM;

  // --- lining pricing (BD) ----------------------------------------------
  // UNVALIDATED for the "Lined" branch -- all 11 real rows are Unlined.
  const liningPricing = linedUnlined === "Lined" ? fabricQuantityM * 14 * (wide ? 2 : 1) : 0;

  // --- installation (BE) -------------------------------------------------
  // Source: IF(Y3<901, InstallationCost+(QUOTIENT(Y3-350,150)+1)*0.5*InstallationCost, 250).
  // Excel's QUOTIENT truncates toward zero, unlike Math.floor which rounds
  // toward -Infinity -- they diverge whenever Y3-350 is negative (any track
  // under 350cm), which real short-curtain rows hit constantly. Math.trunc
  // is the correct JS equivalent.
  const installation =
    trackLengthCm < 901
      ? c.InstallationCost + (Math.trunc((trackLengthCm - 350) / 150) + 1) * 0.5 * c.InstallationCost
      : 250;

  const sum = trackPricing + mitres + bends + curtainMaking + fabricPricing + liningPricing + installation;

  // --- width definition (AT) --------------------------------------------
  // AT3: IF(AM3=2,"2x","1x") & ROUNDUP(IF(AR3="",ROUNDUP(AQ3,0),AR3)/IF(AM3=2,2,1),2) & IF(AR3="","d","m")
  // AR (Metres) is only ever blank on the non-sheer/non-Wide/non-Twin-
  // Inverted-Lining path, which already returned "unvalidated_style_variant"
  // above -- so on every reachable path here AR is populated (it's exactly
  // fabricQuantityM, see the usesSheerMetresFormula branch), meaning the "d"
  // (Drops-based) suffix is unreachable today and only the "m" suffix
  // applies. Re-derive the "d" branch alongside the Drops-based fabric
  // quantity formula if that style variant ever gets validated.
  const twoWay = isTwoWay(input.stack);
  const widthDefinitionValue = Math.ceil((fabricQuantityM / (twoWay ? 2 : 1)) * 100) / 100;
  const widthDefinition = `${twoWay ? "2x" : "1x"}${widthDefinitionValue}m`;

  return {
    ok: true,
    breakdown: {
      fullness,
      trackLengthCm,
      makeHeightCm,
      fabricQuantityM,
      trackPricing,
      mitres,
      bends,
      curtainMaking,
      fabricPricing,
      liningPricing,
      installation,
      calculatedPrice: Math.ceil(sum),
      widthDefinition,
    },
  };
}
