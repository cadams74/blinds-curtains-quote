/**
 * Venetian / Roman / Panel / Verishade / Vertical have zero real historical
 * line items in the sample workbook to validate against (only Roller and
 * Honeycomb appear in the sample quote -- see roller.test.ts and
 * honeycomb.test.ts). These tests are therefore independent hand-computed
 * cross-checks: each expected value is computed here directly from the raw
 * extracted price-grid JSON (a different code path than genericBlind.ts
 * itself uses), not copied from the engine's own output. That catches
 * band-lookup/indexing bugs but is NOT the same strength of evidence as
 * roller.test.ts's real-quote validation -- flag any of these families for
 * a real-data check as soon as historical quotes are available.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { priceGenericBlind, type BlindFamily } from "./genericBlind.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface PriceGridGroup {
  family: string;
  group: number;
  width_bands_mm: number[];
  height_bands_mm: number[];
  price_matrix: number[][];
  width_scale_mm: number;
  height_scale_mm: number;
}

const grids: PriceGridGroup[] = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", "data", "extraction_output", "price_grids", "blind_price_grids.json"),
    "utf-8"
  )
).groups;

function grid(family: string, group: number): PriceGridGroup {
  const g = grids.find((x) => x.family === family && x.group === group);
  if (!g) throw new Error(`no grid for ${family} group ${group}`);
  return g;
}

/** Independent re-implementation of the band lookup, used only to derive
 * expected values for these tests -- deliberately not shared code with
 * bandLookup.ts, so a bug in one is unlikely to be mirrored in the other. */
function expectedRawPrice(g: PriceGridGroup, widthMm: number, heightMm: number): number {
  const floor = Math.min(...g.width_bands_mm);
  const wTarget = Math.max(floor, Math.ceil(widthMm / g.width_scale_mm) * g.width_scale_mm);
  const hTarget = Math.max(floor, Math.ceil(heightMm / g.height_scale_mm) * g.height_scale_mm);
  const wIdx = g.width_bands_mm.indexOf(wTarget);
  const hIdx = g.height_bands_mm.indexOf(hTarget);
  if (wIdx === -1 || hIdx === -1) throw new Error("out of band range -- pick a smaller test case");
  return g.price_matrix[hIdx][wIdx];
}

// One representative fabric per family, resolved from the settings dump so
// the fabric-group lookup itself is exercised too, not hardcoded around.
import settingsData from "../../data/extraction_output/settings/blind_settings_named_ranges.json" with { type: "json" };

function firstFabric(family: BlindFamily): { source: string; name: string; group: number } {
  const sourcesKey = `${family}Sources`;
  // A family with only one valid fabric source (e.g. Venetian, Verishade,
  // Vertical) has a single-cell named range, which the extraction leaves as
  // a plain string rather than a one-element array (see extract_settings.py
  // flatten()) -- handle both shapes rather than assuming an array.
  const raw = (settingsData.ranges as any)[sourcesKey];
  const source: string = Array.isArray(raw) ? raw[0] : raw;
  const priceRows: [string, number][] = (settingsData.ranges as any)[`${source}FabricPrices`];
  const [name, group] = priceRows[0];
  return { source, name, group };
}

const CASES: { family: BlindFamily; widthMm: number; heightMm: number }[] = [
  { family: "Venetian", widthMm: 1200, heightMm: 1400 },
  { family: "Roman", widthMm: 900, heightMm: 1600 },
  { family: "Panel", widthMm: 1800, heightMm: 2000 },
  { family: "Verishade", widthMm: 1000, heightMm: 1200 },
  { family: "Vertical", widthMm: 1500, heightMm: 1800 },
];

describe("priceGenericBlind — hand-computed cross-checks (no real historical data available)", () => {
  for (const { family, widthMm, heightMm } of CASES) {
    it(`${family} ${widthMm}x${heightMm}mm: raw grid lookup + 1.88 markup matches an independent computation`, () => {
      const fabric = firstFabric(family);
      const g = grid(family, fabric.group);
      const expectedRaw = expectedRawPrice(g, widthMm, heightMm);

      const result = priceGenericBlind({
        family,
        widthMm,
        heightMm,
        fabricSource: fabric.source,
        fabricName: fabric.name,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.breakdown.fabricGroup).toBe(fabric.group);
      expect(result.breakdown.blindPricing).toBeCloseTo(expectedRaw * 1.88, 6);
      // booster is Roller-only (none of these CASES are Roller -- that's covered in roller.test.ts)
      expect(result.breakdown.booster).toBe(0);
      expect(result.breakdown.tracksCost).toBe(0); // no bracketTrack supplied in this case
      expect(result.breakdown.calculatedPrice).toBeGreaterThan(0);
    });
  }

  it("oversized measurements fall back to 'requires manual price', matching the source spreadsheet's #N/A behaviour", () => {
    const fabric = firstFabric("Venetian");
    const g = grid("Venetian", fabric.group);
    const hugeWidth = Math.max(...g.width_bands_mm) + 5000;
    const result = priceGenericBlind({
      family: "Venetian",
      widthMm: hugeWidth,
      heightMm: 1000,
      fabricSource: fabric.source,
      fabricName: fabric.name,
    });
    expect(result).toEqual({ ok: false, reason: "width_or_height_exceeds_price_bands" });
  });

  it("unknown fabric name is reported distinctly from an oversized measurement", () => {
    const result = priceGenericBlind({
      family: "Venetian",
      widthMm: 1000,
      heightMm: 1000,
      fabricSource: "Venetian",
      fabricName: "Not A Real Fabric",
    });
    expect(result).toEqual({ ok: false, reason: "fabric_not_found" });
  });
});
