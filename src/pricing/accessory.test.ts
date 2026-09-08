import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { priceAccessory, type AccessoryOption } from "./accessory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadCatalog(file: string): AccessoryOption[] {
  const { accessories } = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "data", "extraction_output", "price_grids", file), "utf-8")
  ) as { accessories: [string, number][] };
  return accessories.map(([name, price]) => ({ name, price }));
}

const curtainCatalog = loadCatalog("curtain_accessories.json");
const blindCatalog = loadCatalog("blind_accessories.json");

describe("priceAccessory — a plain VLOOKUP(name, catalog, 2, 0) against the real extracted catalogs", () => {
  it("has the real 24-row curtain Accessories catalog", () => {
    expect(curtainCatalog.length).toBe(24);
  });

  it("has the real 11-row blind BlindAccessories catalog", () => {
    expect(blindCatalog.length).toBe(11);
  });

  it("prices a real curtain accessory correctly (Oslo Remote, 2 channel = $140)", () => {
    const result = priceAccessory({ name: "Oslo Remote, 2 channel" }, curtainCatalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakdown).toEqual({ name: "Oslo Remote, 2 channel", calculatedPrice: 140 });
  });

  it("prices a real blind accessory correctly (16 Channel Remote (Situo) = $525)", () => {
    const result = priceAccessory({ name: "16 Channel Remote (Situo)" }, blindCatalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakdown).toEqual({ name: "16 Channel Remote (Situo)", calculatedPrice: 525 });
  });

  it("the catalog's own $0 escape hatch for one-off items prices as $0, not an error", () => {
    const result = priceAccessory({ name: "Special Remote (See notes)" }, curtainCatalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakdown.calculatedPrice).toBe(0);
  });

  it("an unrecognized name falls back to $0, mirroring the source formula's IFERROR(...,0)", () => {
    const result = priceAccessory({ name: "Something not in the catalog" }, blindCatalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakdown.calculatedPrice).toBe(0);
  });

  it("rejects a missing name", () => {
    const result = priceAccessory({ name: "" }, curtainCatalog);
    expect(result).toEqual({ ok: false, reason: "missing_name" });
  });

  it("rejects a whitespace-only name", () => {
    const result = priceAccessory({ name: "   " }, blindCatalog);
    expect(result).toEqual({ ok: false, reason: "missing_name" });
  });
});
