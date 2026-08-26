import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeCurtainFabricSellPrice } from "./curtainFabricSellPrice.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The real published band, extracted from Curtain_Pricing!$A$106:$A$121 --
// see data/extraction_output/curtain_pricing/named_ranges.json's
// "SellPricePoints" entry.
const SELL_PRICE_POINTS = [0, 30, 36, 41, 46, 51, 56, 66, 76, 90, 105, 120, 135, 150, 165, 180];

interface CurtainFixture {
  fabric_company: string;
  fabric_name: string;
  price_per_metre: number;
}

const fixtures: CurtainFixture[] = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "data", "curtain_fixtures.json"), "utf-8")
);

describe("computeCurtainFabricSellPrice", () => {
  it("all 11 real historical fixtures use Zepel 'Audiance' (cost $35) -- matches the workbook's own $76 sell price", () => {
    expect(fixtures.length).toBe(11);
    for (const f of fixtures) {
      expect(f.fabric_company).toBe("Zepel");
      expect(f.fabric_name).toBe("Audiance");
      expect(computeCurtainFabricSellPrice(35, SELL_PRICE_POINTS)).toBe(f.price_per_metre);
    }
  });

  it("rounds up to the next published band when cost*2 falls between two bands", () => {
    // cost 20 -> target 40 -> smallest band >= 40 is 41, not 36.
    expect(computeCurtainFabricSellPrice(20, SELL_PRICE_POINTS)).toBe(41);
  });

  it("picks the exact band when cost*2 lands exactly on one (>=, not >)", () => {
    // cost 15 -> target 30, which is itself a published band.
    expect(computeCurtainFabricSellPrice(15, SELL_PRICE_POINTS)).toBe(30);
  });

  it("a zero-cost fabric prices at the $0 band", () => {
    expect(computeCurtainFabricSellPrice(0, SELL_PRICE_POINTS)).toBe(0);
  });

  it("returns null (needs a manual price) when cost*2 exceeds every published band", () => {
    // Real example: JamesDunlop "Hattusa F0797", cost $215 -- confirmed
    // against the source workbook (recalculated with LibreOffice) that the
    // real formula evaluates to 0 in this case, not a usable price.
    expect(computeCurtainFabricSellPrice(215, SELL_PRICE_POINTS)).toBe(null);
    // Boundary: cost 90 -> target 180, the highest published band -- still
    // usable (>=, inclusive).
    expect(computeCurtainFabricSellPrice(90, SELL_PRICE_POINTS)).toBe(180);
    // Boundary: cost 90.01 -> target 180.02, just over the highest band.
    expect(computeCurtainFabricSellPrice(90.01, SELL_PRICE_POINTS)).toBe(null);
  });
});
