import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { priceMisc } from "./misc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface MiscFixture {
  row: number;
  description: string;
  additional_details: string | null;
  price: number | string | null;
  install_time_minutes: number | null;
}

const { line_items: fixtures } = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "data", "misc_quote_fixtures.json"), "utf-8")
) as { line_items: MiscFixture[] };

describe("priceMisc — normalizes the real Misc Quote sample rows (no formula to validate against; this sheet is pure manual entry)", () => {
  it("has all 4 real sample rows", () => {
    expect(fixtures.length).toBe(4);
  });

  it("row 3: a plain numeric price", () => {
    const f = fixtures.find((r) => r.row === 3)!;
    const result = priceMisc({ description: f.description, price: f.price });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakdown).toEqual({
      noCharge: false,
      priceKind: "amount",
      calculatedPrice: 2200,
      installTimeMinutes: 0,
    });
  });

  it("row 4: the literal 'N/C' no-charge marker", () => {
    const f = fixtures.find((r) => r.row === 4)!;
    const result = priceMisc({ description: f.description, price: f.price });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakdown).toEqual({
      noCharge: true,
      priceKind: "no_charge",
      calculatedPrice: 0,
      installTimeMinutes: 0,
    });
  });

  it("row 5: also 'N/C'", () => {
    const f = fixtures.find((r) => r.row === 5)!;
    const result = priceMisc({ description: f.description, price: f.price });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakdown.priceKind).toBe("no_charge");
    expect(result.breakdown.calculatedPrice).toBe(0);
  });

  it("row 6: a bare note line with no price at all -- distinct from an explicit 'N/C'", () => {
    const f = fixtures.find((r) => r.row === 6)!;
    expect(f.price).toBeNull();
    const result = priceMisc({ description: f.description, price: f.price });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakdown).toEqual({
      noCharge: true,
      priceKind: "note_only",
      calculatedPrice: 0,
      installTimeMinutes: 0,
    });
  });

  it("rejects a missing description", () => {
    const result = priceMisc({ description: "   ", price: 100 });
    expect(result).toEqual({ ok: false, reason: "missing_description" });
  });

  it("rejects an unparseable price (typo, not a real 'no charge' marker)", () => {
    const result = priceMisc({ description: "Extra bracket", price: "TBC" });
    expect(result).toEqual({ ok: false, reason: "unparseable_price" });
  });

  it("rejects a negative price", () => {
    const result = priceMisc({ description: "Extra bracket", price: -5 });
    expect(result).toEqual({ ok: false, reason: "unparseable_price" });
  });

  it("carries install time through when present, even though none of the real sample rows have it set", () => {
    const result = priceMisc({ description: "Custom cornice", price: 150, installTimeMinutes: 45 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakdown.installTimeMinutes).toBe(45);
  });
});
