/**
 * Misc Quote items -- structurally the simplest thing in the workbook, and
 * the only one that ISN'T a pricing engine. Verified by extraction (see
 * extraction/extract_misc_quote.py): the source sheet's Price and Install
 * Time columns contain zero formulas across all 42 usable rows -- both are
 * 100% manual entry. There is no formula chain to port, so this module is a
 * normalizer/validator for that free-text entry, not a calculator.
 *
 * Real sample data has three distinct price states, all of which need to
 * survive into the new system rather than being collapsed together:
 *   - a plain number (e.g. 2200)
 *   - the literal text "N/C" ("no charge" -- deliberately entered instead
 *     of 0, because it should print as "N/C" on the quote/invoice, not
 *     "$0.00" -- those read very differently to a customer)
 *   - blank (a pure note/logistics line with no price at all, e.g. "client's
 *     floor plans are at Unique bay 13" -- not every Misc Quote row is a
 *     billable item)
 * priceMisc() normalizes all three into a consistent shape rather than
 * guessing which the estimator meant.
 */

export interface MiscInput {
  description: string;
  additionalDetails?: string;
  /** Number, the literal "N/C", blank/undefined for a note-only line, or
   * any other string is rejected -- see MiscResult's "unparseable_price". */
  price?: number | string | null;
  installTimeMinutes?: number | null;
}

export interface MiscBreakdown {
  /** true for both "N/C" and blank -- the distinction between "explicitly
   * no charge" and "just a note, no price" is kept in `priceKind`, not here,
   * since every billing calculation downstream treats them identically. */
  noCharge: boolean;
  /** "amount" | "no_charge" | "note_only" -- what the source cell actually
   * contained, for display: an "N/C" quote line and a bare note line look
   * different to a customer even though both total $0. */
  priceKind: "amount" | "no_charge" | "note_only";
  calculatedPrice: number;
  installTimeMinutes: number;
}

export type MiscResult =
  | { ok: true; breakdown: MiscBreakdown }
  | { ok: false; reason: "missing_description" | "unparseable_price" };

export function priceMisc(input: MiscInput): MiscResult {
  if (!input.description || input.description.trim() === "") {
    return { ok: false, reason: "missing_description" };
  }

  const raw = input.price;
  let priceKind: MiscBreakdown["priceKind"];
  let calculatedPrice: number;

  if (raw === undefined || raw === null || raw === "") {
    priceKind = "note_only";
    calculatedPrice = 0;
  } else if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return { ok: false, reason: "unparseable_price" };
    priceKind = "amount";
    calculatedPrice = raw;
  } else if (typeof raw === "string" && raw.trim().toUpperCase() === "N/C") {
    priceKind = "no_charge";
    calculatedPrice = 0;
  } else {
    // The source workbook has no validation on this cell either -- any other
    // free text is a data-entry mistake, not a price. Report it rather than
    // silently treating it as $0.
    return { ok: false, reason: "unparseable_price" };
  }

  return {
    ok: true,
    breakdown: {
      noCharge: priceKind !== "amount",
      priceKind,
      calculatedPrice,
      installTimeMinutes: input.installTimeMinutes ?? 0,
    },
  };
}
