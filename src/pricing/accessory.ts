/**
 * Curtain Accessory and Blind Accessory line items -- the simplest pricing
 * shape in the app, and a genuinely new line-item type rather than a
 * reuse of an existing one (see actions.ts and app/README.md).
 *
 * In the source workbook, "Accessory" isn't its own sheet -- it's a special
 * value of 'Curtain Quote'!D ("Style") / 'Blind Quote'!D ("Blind Type").
 * Setting it repurposes another column's own dropdown (N on the curtain
 * side, J on the blind side -- both otherwise Track/Control Type selects)
 * into an accessory-name picker, and the row's Price formula switches to a
 * plain lookup instead of the family's usual pricing chain:
 *   Curtain Quote!AB3 = IF(D3="Accessory", BF3, <the usual formula>)
 *   Blind Quote!Y3    = IF(D3="Accessory", BB3, <the usual formula>)
 *   BF3 (curtain) = IFERROR(VLOOKUP(N3, Accessories, 2, 0), 0)
 *   BB3 (blind)   = IFERROR(VLOOKUP(J3, BlindAccessories, 2, 0), 0)
 * Accessories/BlindAccessories are the source's own named price lists
 * (Curtain_Pricing!A124:B147, 24 rows; Blind_Pricing!A922:B932, 11 rows),
 * seeded verbatim into curtain_accessories/blind_accessories.
 *
 * Real quotes in the source workbook actually used this awkwardly: rows
 * were added on the Blind Quote sheet with an Accessory name typed in
 * (sometimes not even matching a real BlindAccessoryNames entry -- extra
 * spaces, near-duplicates) and the Price cell manually overridden to the
 * literal text "Misc Page", meaning the real price was tracked as a
 * separate, disconnected line on the Misc Quote sheet instead of computed
 * here at all. Clive asked for a clean replacement instead -- a proper line
 * item, priced directly off the catalog like a normal VLOOKUP, not routed
 * through Misc. This module is that lookup: pure, synchronous, no DB
 * dependency once the catalog's been fetched, same shape as priceMisc().
 */

export interface AccessoryOption {
  name: string;
  price: number;
}

export interface AccessoryInput {
  name: string;
}

export interface AccessoryBreakdown {
  name: string;
  calculatedPrice: number;
}

export type AccessoryResult =
  | { ok: true; breakdown: AccessoryBreakdown }
  | { ok: false; reason: "missing_name" };

export function priceAccessory(input: AccessoryInput, catalog: AccessoryOption[]): AccessoryResult {
  if (!input.name || input.name.trim() === "") {
    return { ok: false, reason: "missing_name" };
  }

  const match = catalog.find((o) => o.name === input.name);
  // Mirrors the source formula's own IFERROR(...,0): an unrecognized name
  // (the catalog changed after this line was saved, say) prices as $0
  // rather than failing outright -- the same fallback the catalog's own
  // "Special Remote (See notes)" $0 entry already relies on for anything
  // genuinely one-off, priced afterwards via the per-line Override control.
  return { ok: true, breakdown: { name: input.name, calculatedPrice: match ? match.price : 0 } };
}
