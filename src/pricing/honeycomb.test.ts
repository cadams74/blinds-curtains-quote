/**
 * See honeycomb.ts for why this can't be validated against real quote
 * data: all 5 real Honeycomb line items in the sample workbook have broken
 * source formulas (blank Fabric Source -> fabric group 0 -> #REF!), so
 * there's no clean real "calculated price" to check against. These are
 * hand-computed cross-checks against the raw extracted price grids instead
 * -- same caveat as genericBlind.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { priceHoneycomb } from "./honeycomb.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const grids = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", "data", "extraction_output", "price_grids", "blind_price_grids.json"),
    "utf-8"
  )
).groups as { family: string; group: number; width_bands_mm: number[]; height_bands_mm: number[]; price_matrix: number[][]; width_scale_mm: number; height_scale_mm: number }[];

function expectedRaw(family: string, group: number, widthMm: number, heightMm: number): number {
  const g = grids.find((x) => x.family === family && x.group === group)!;
  const floor = Math.min(...g.width_bands_mm);
  const wTarget = Math.max(floor, Math.ceil(widthMm / g.width_scale_mm) * g.width_scale_mm);
  const hTarget = Math.max(floor, Math.ceil(heightMm / g.height_scale_mm) * g.height_scale_mm);
  const wIdx = g.width_bands_mm.indexOf(wTarget);
  const hIdx = g.height_bands_mm.indexOf(hTarget);
  return g.price_matrix[hIdx][wIdx];
}

describe("priceHoneycomb — hand-computed cross-checks (no clean real historical data available)", () => {
  const cases: { style: "Classic" | "Easy_Rise" | "Cordless"; widthMm: number; heightMm: number }[] = [
    { style: "Classic", widthMm: 700, heightMm: 1200 },
    { style: "Cordless", widthMm: 900, heightMm: 1600 },
    { style: "Easy_Rise", widthMm: 1100, heightMm: 2000 },
  ];

  for (const { style, widthMm, heightMm } of cases) {
    it(`${style} ${widthMm}x${heightMm}mm matches an independent grid computation`, () => {
      const result = priceHoneycomb({
        style,
        widthMm,
        heightMm,
        fabricName: "Harlem TL", // group 1, per HoneycombFabricPrices
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const raw = expectedRaw(`Honeycomb${style}`, 1, widthMm, heightMm);
      expect(result.breakdown.blindPricing).toBeCloseTo(raw * 1.88, 6);
      // no <Family>ControlPrices table exists for Honeycomb in the source
      expect(result.breakdown.controlsCost).toBe(0);
    });
  }

  it("reproduces the real workbook's actual failure mode: unset fabric source/name -> reported, not a silent wrong price", () => {
    const result = priceHoneycomb({
      style: "Cordless",
      widthMm: 704,
      heightMm: 2543, // real dimensions from the sample quote's "FF Bed 4 B" line
      fabricName: "", // the real quote left Fabric Source blank; here that's an unresolvable fabric name
    });
    expect(result).toEqual({ ok: false, reason: "fabric_not_found" });
  });
});
