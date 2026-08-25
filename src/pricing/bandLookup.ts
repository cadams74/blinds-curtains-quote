import type { PriceGridGroup } from "./loadData.js";

function ceilingTo(value: number, scale: number): number {
  return Math.ceil(value / scale) * scale;
}

/**
 * Reproduces the Blind_Pricing width x height banded lookup exactly as the
 * source workbook's formula does it:
 *
 *   VLOOKUP(MAX(MIN(Widths), CEILING(height, HScale)), Prices,
 *           MATCH(MAX(MIN(Widths), CEILING(width, WScale)), Widths, 0), 0)
 *
 * Note the source formula clamps BOTH axes against MIN(Widths) (not a
 * separate MIN(Heights)) -- almost certainly a copy-paste quirk in the
 * original spreadsheet rather than intentional, but reproduced faithfully
 * here since it's what the business has actually been quoting from. For
 * every family checked so far the width and height band lists are
 * identical, so this is harmless in practice; it's worth re-checking if a
 * family is ever found where they differ.
 *
 * Both axes require an EXACT match against their band list (VLOOKUP's/
 * MATCH's 4th/3rd arg is 0), matching Excel. If the raw measurement, once
 * rounded up, exceeds the largest published band, this returns null --
 * exactly mirroring the spreadsheet's #N/A for oversized items, which in
 * practice get a manual price override rather than a formula-driven price.
 */
export function priceGridLookup(
  grid: PriceGridGroup,
  widthMm: number,
  heightMm: number
): number | null {
  const floor = Math.min(...grid.width_bands_mm);
  const widthTarget = Math.max(floor, ceilingTo(widthMm, grid.width_scale_mm));
  const heightTarget = Math.max(floor, ceilingTo(heightMm, grid.height_scale_mm));

  const wIdx = grid.width_bands_mm.indexOf(widthTarget);
  const hIdx = grid.height_bands_mm.indexOf(heightTarget);
  if (wIdx === -1 || hIdx === -1) return null;

  return grid.price_matrix[hIdx][wIdx];
}

export { ceilingTo };
