/**
 * Curtain Quote's "$ P/M" column (M) is NOT the fabric's raw cost price --
 * it's a computed retail sell price: double the cost, then round UP to the
 * nearest published "SellPricePoints" band (Curtain_Pricing!$A$106:$A$121:
 * 0, 30, 36, 41, 46, 51, 56, 66, 76, 90, 105, 120, 135, 150, 165, 180).
 * Source formula (array-entered):
 *   =MIN(IF(SellPricePoints>=cost*2, SellPricePoints))
 * where `cost` is a VLOOKUP into the chosen supplier sheet's own "Price"
 * column -- exactly what's seeded into `fabrics.pricePerMetre` (see
 * schema.ts, adminActions.ts, seed.ts). That column was never meant to be
 * quoted to a customer directly; this is the one place the markup gets
 * applied. Confirmed against all 11 real historical curtain fixtures
 * (Zepel "Audiance", cost $35 -> sell $76 -- matches `price_per_metre` in
 * data/curtain_fixtures.json exactly) and by reproducing the array formula
 * in the source workbook itself for a fabric outside the fixtures' range.
 *
 * About 15% of the real fabric library (498 of 3,309 fabrics checked, any
 * cost over $90) has a cost high enough that doubling it exceeds every
 * published band. In the real workbook, MIN(IF(...)) over an
 * all-FALSE condition evaluates to 0 (confirmed by opening the source file
 * and forcing a recalculation) -- which would silently and drastically
 * underprice those curtains if reproduced here. Returning `null` instead,
 * so the caller can flag it as needing a manual price, matches this app's
 * established pattern for every other "value exceeds every published band"
 * case (curtain.ts's track_length_exceeds_bands, the blind families'
 * oversized handling) rather than faithfully copying a silent $0 bug from
 * the source spreadsheet.
 */
export function computeCurtainFabricSellPrice(
  costPerMetre: number,
  sellPricePoints: number[]
): number | null {
  const target = costPerMetre * 2;
  let best: number | null = null;
  for (const point of sellPricePoints) {
    if (point >= target && (best === null || point < best)) {
      best = point;
    }
  }
  return best;
}
