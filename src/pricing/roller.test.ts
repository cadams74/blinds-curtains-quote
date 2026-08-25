import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { priceRollerBlind } from "./roller.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RollerFixture {
  room: string;
  width_mm: number;
  height_mm: number;
  control_side: string;
  control_type: string;
  fabric_source: string;
  fabric_name: string;
  fabric_group: number;
  bracket_track?: string;
  linked?: string;
  calculated_price: number; // AA column: the formula-driven price, before any manual override
  blind_pricing: number; // AR column: raw grid price x 1.88, for a finer-grained check
  freight: number;
  booster: number;
  controls_cost: number;
  links_cost: number;
}

const fixtures: RollerFixture[] = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "data", "roller_fixtures.json"), "utf-8")
);

describe("priceRollerBlind — validated against 27 real historical quote lines", () => {
  it("has fixtures to test against", () => {
    expect(fixtures.length).toBe(27);
  });

  for (const f of fixtures) {
    it(`${f.room} (${f.width_mm}x${f.height_mm}mm) matches the workbook's calculated price exactly`, () => {
      const result = priceRollerBlind({
        widthMm: f.width_mm,
        heightMm: f.height_mm,
        fabricSource: f.fabric_source,
        fabricName: f.fabric_name,
        controlType: f.control_type,
        bracketTrack: f.bracket_track,
        linked: Boolean(f.linked),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // fabric group resolved via lookup should match the workbook's own Q column
      expect(result.breakdown.fabricGroup).toBe(f.fabric_group);

      // raw grid price x markup, before rounding -- catches band-lookup errors precisely
      expect(result.breakdown.blindPricing).toBeCloseTo(f.blind_pricing, 2);

      expect(result.breakdown.freight).toBe(f.freight);
      expect(result.breakdown.booster).toBe(f.booster);
      expect(result.breakdown.controlsCost).toBe(f.controls_cost);
      expect(result.breakdown.linksCost).toBe(f.links_cost);

      // final ROUNDUP(SUM(...),0) price -- the number that actually appears on the quote
      expect(result.breakdown.calculatedPrice).toBe(f.calculated_price);
    });
  }
});
