import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { priceCurtain } from "./curtain.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CurtainFixture {
  room: string;
  style: string;
  lining_input: "U" | "L";
  finish: string;
  fabric_company: string;
  fabric_name: string;
  colour: string;
  price_per_metre: number;
  track_name: string;
  left_return: number;
  right_return: number;
  overlap?: number;
  layout: string;
  lpw_cm?: number; // blank in the source for some layouts, e.g. "Wall to Wall"
  ww_cm?: number;
  rpw_cm?: number;
  track_length_cm: number;
  height_cm: number;
  hooks: string;
  calculated_price: number | string; // "#N/A" for the 3 real oversized rows
  fullness: number;
  make_height: number;
  fabric_quantity_m: number;
  track_pricing: number | string;
  mitres: number;
  bends: number;
  curtain_making: number;
  fabric_pricing: number;
  lining_pricing: number;
  installation: number;
}

const fixtures: CurtainFixture[] = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "data", "curtain_fixtures.json"), "utf-8")
);

function toInput(f: CurtainFixture) {
  return {
    style: f.style,
    liningInput: f.lining_input,
    finish: f.finish,
    trackName: f.track_name,
    pricePerMetre: f.price_per_metre,
    layout: f.layout,
    leftReturnCm: f.left_return,
    rightReturnCm: f.right_return,
    overlapCm: f.overlap,
    lpwCm: f.lpw_cm,
    wwCm: f.ww_cm,
    rpwCm: f.rpw_cm,
    heightCm: f.height_cm,
    hooks: f.hooks,
  };
}

describe("priceCurtain — validated against real historical 'S Wave Sheer' quote lines", () => {
  it("has 11 fixtures, 8 clean + 3 with a real source-formula error", () => {
    expect(fixtures.length).toBe(11);
    const clean = fixtures.filter((f) => typeof f.calculated_price === "number");
    const broken = fixtures.filter((f) => typeof f.calculated_price === "string");
    expect(clean.length).toBe(8);
    expect(broken.length).toBe(3);
  });

  for (const f of fixtures.filter((f) => typeof f.calculated_price === "number")) {
    it(`${f.room}: matches the workbook's calculated price exactly`, () => {
      const result = priceCurtain(toInput(f));
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.breakdown.fullness).toBeCloseTo(f.fullness, 6);
      expect(result.breakdown.makeHeightCm).toBeCloseTo(f.make_height, 6);
      expect(result.breakdown.fabricQuantityM).toBeCloseTo(f.fabric_quantity_m, 6);
      expect(result.breakdown.trackPricing).toBeCloseTo(f.track_pricing as number, 6);
      expect(result.breakdown.mitres).toBe(f.mitres);
      expect(result.breakdown.bends).toBe(f.bends);
      expect(result.breakdown.curtainMaking).toBeCloseTo(f.curtain_making, 6);
      expect(result.breakdown.fabricPricing).toBeCloseTo(f.fabric_pricing, 6);
      expect(result.breakdown.liningPricing).toBe(f.lining_pricing);
      expect(result.breakdown.installation).toBe(f.installation);
      expect(result.breakdown.calculatedPrice).toBe(f.calculated_price);
    });
  }

  for (const f of fixtures.filter((f) => typeof f.calculated_price === "string")) {
    it(`${f.room}: reproduces the real workbook's #N/A (track length exceeds published bands) rather than guessing a price`, () => {
      const result = priceCurtain(toInput(f));
      expect(result).toEqual({ ok: false, reason: "track_length_exceeds_bands" });
    });
  }
});
