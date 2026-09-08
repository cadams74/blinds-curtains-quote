/**
 * Config for the two Accessory line-item types -- Curtain Accessory and
 * Blind Accessory, kept as two separate types (rather than one generic
 * "Accessory" the way Misc is generic) because Clive specifically asked
 * to "maintain the category": the source workbook prices them from two
 * entirely separate catalogs (Curtain_Pricing's Accessories vs
 * Blind_Pricing's BlindAccessories -- see src/pricing/accessory.ts), so
 * keeping that split visible in the UI (two "Add line item" entries, two
 * family slugs) matches both the source data and what he asked for.
 *
 * Same shape/purpose as blindFamilies.ts's GENERIC_BLIND_FAMILIES: one
 * place mapping a family slug to its own catalog table, reused by the
 * "new" route, the edit route, and actions.ts rather than each
 * re-implementing the same curtain-vs-blind branch.
 */
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";

export interface AccessoryFamilyConfig {
  slug: "curtain_accessory" | "blind_accessory";
  label: string; // "Curtain Accessory" / "Blind Accessory"
  catalogTable: typeof schema.curtainAccessories | typeof schema.blindAccessories;
}

export const ACCESSORY_FAMILIES: AccessoryFamilyConfig[] = [
  { slug: "curtain_accessory", label: "Curtain Accessory", catalogTable: schema.curtainAccessories },
  { slug: "blind_accessory", label: "Blind Accessory", catalogTable: schema.blindAccessories },
];

export function getAccessoryFamilyConfig(slug: string): AccessoryFamilyConfig | undefined {
  return ACCESSORY_FAMILIES.find((f) => f.slug === slug);
}

// Takes `db` as a parameter rather than importing the singleton, the same
// convention loadBlindDataSource() (pricingDataSource.ts) uses -- the
// caller (a Server Component page, or a server action) already has it in
// scope. Both catalogs are tiny (11 and 24 rows), so this is a single
// unfiltered select, not worth a dedicated query builder.
export async function getAccessoryCatalog(
  db: Db,
  config: AccessoryFamilyConfig
): Promise<{ name: string; price: number }[]> {
  const rows = await db.select().from(config.catalogTable);
  return rows
    .map((r) => ({ name: r.name, price: Number(r.price) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
