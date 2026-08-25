/**
 * Which blind families a blind_fabric_options.source value can be used by,
 * and whether that family has a live quoting route in the app today.
 *
 * blind_fabric_options isn't itself keyed by family (see pricingDataSource.
 * ts's comment on loadBlindDataSource -- family_slug on that table is
 * literally always the constant "blind"; the real per-source -> per-family
 * mapping lives only in each family's Fabric Source option list). Cross-
 * referencing RollerSources/RomanSources/PanelSources/VenetianSources/
 * VerishadeSources/VerticalSources against blind_fabric_options.source
 * (checked directly against the seeded database while building this page)
 * found exactly two shapes:
 *
 * - Nine generic supplier sources (Blindware, Four_Families, Hunter_Douglas,
 *   Louvolite, Mermet, Shaw, Texstyle, Uniline, Wilson) are shared identically
 *   across Roller, Roman, and Panel -- the same fabric/group pairing is used
 *   by whichever of those three families the estimator is quoting.
 * - Five self-named sources (Venetian, Verishade, Vertical, Roller, Honeycomb)
 *   each belong to exactly one family, matching genericBlind.ts's own
 *   single-option-source design (see blindFamilies.ts).
 *
 * The "Roller" source here is the self-named one Roller's *own* dedicated
 * form uses in addition to the 9 shared suppliers -- Roller alone can use
 * all 10.
 *
 * IMPORTANT, found while building this page: Honeycomb has a pricing engine
 * (honeycomb.ts, Phase 3) and 217 real blind_fabric_options rows include 3
 * genuine "Honeycomb"-source fabrics, but there is no live quoting route for
 * Honeycomb anywhere in the app -- it's missing from blindFamilies.ts and
 * from seed.ts's `families` catalog. Editing a Honeycomb fabric's price
 * group here has no effect on any quote an estimator can actually create
 * today. Flagged honestly rather than hidden, same as the option-lists
 * live/not-wired badging -- see liveOptionLists.ts.
 */

export interface BlindSourceFamilyInfo {
  /** The price-grid family name(s) this source's fabrics can price against
   * (matches price_grid_groups.family_slug / genericBlind.ts's BlindFamily). */
  priceGridFamilies: string[];
  /** True if at least one of those families has a live quoting route today. */
  live: boolean;
  note?: string;
}

const SHARED_ROLLER_ROMAN_PANEL: BlindSourceFamilyInfo = {
  priceGridFamilies: ["Roller", "Roman", "Panel"],
  live: true,
};

export const BLIND_SOURCE_FAMILY_INFO: Record<string, BlindSourceFamilyInfo> = {
  Blindware: SHARED_ROLLER_ROMAN_PANEL,
  Four_Families: SHARED_ROLLER_ROMAN_PANEL,
  Hunter_Douglas: SHARED_ROLLER_ROMAN_PANEL,
  Louvolite: SHARED_ROLLER_ROMAN_PANEL,
  Mermet: SHARED_ROLLER_ROMAN_PANEL,
  Shaw: SHARED_ROLLER_ROMAN_PANEL,
  Texstyle: SHARED_ROLLER_ROMAN_PANEL,
  Uniline: SHARED_ROLLER_ROMAN_PANEL,
  Wilson: SHARED_ROLLER_ROMAN_PANEL,
  Roller: { priceGridFamilies: ["Roller"], live: true },
  Venetian: { priceGridFamilies: ["Venetian"], live: true },
  Verishade: { priceGridFamilies: ["Verishade"], live: true },
  Vertical: { priceGridFamilies: ["Vertical"], live: true },
  Honeycomb: {
    priceGridFamilies: ["HoneycombClassic", "HoneycombEasy_Rise", "HoneycombCordless"],
    live: false,
    note: "No live quoting route for Honeycomb yet -- see this file's header comment.",
  },
};

export function getBlindSourceFamilyInfo(source: string): BlindSourceFamilyInfo {
  return (
    BLIND_SOURCE_FAMILY_INFO[source] ?? {
      priceGridFamilies: [],
      live: false,
      note: "Unrecognized source -- not seen in any family's Fabric Source list while building this page.",
    }
  );
}
