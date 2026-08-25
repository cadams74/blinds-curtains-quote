/**
 * Postgres schema (Drizzle ORM, targets Neon) for the blinds & curtains
 * quoting application. Mirrors the entities described in the project's
 * architecture-proposal.md, built directly from the workbook extraction
 * under extraction/output/.
 */
import { sql } from "drizzle-orm";
import {
  pgTable, serial, text, integer, numeric, boolean, timestamp, jsonb,
  uniqueIndex, index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Users (Auth.js credentials login -- internal staff only, no self-signup)

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("estimator"), // "estimator" | "admin"
  // Soft-disable rather than delete -- lets an admin cut off a former
  // teammate's login without losing the row (auth.ts's authorize() checks
  // this and refuses to sign an inactive user in, same as a wrong password).
  // Added in Phase 13 alongside the Staff Logins admin page; every row
  // seeded before that (including seedAdmin.ts's) defaults to true.
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Product catalog

export const families = pgTable("families", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(), // e.g. "roller", "venetian", "s_wave_sheer"
  name: text("name").notNull(),
  category: text("category").notNull(), // "blind" | "curtain" | "misc"
  // ordered cascade of dependent option fields, mirroring the workbook's
  // data-validation chain (see settings/data_validation_cascades.json)
  optionCascade: jsonb("option_cascade").notNull(),
});

// One row per Blind_Pricing width x height banded grid (40 total).
export const priceGridGroups = pgTable("price_grid_groups", {
  id: serial("id").primaryKey(),
  familySlug: text("family_slug").notNull(), // e.g. "roller", "honeycomb_classic"
  groupNumber: integer("group_number").notNull(),
  widthBandsMm: jsonb("width_bands_mm").notNull(), // number[]
  heightBandsMm: jsonb("height_bands_mm").notNull(), // number[]
  priceMatrix: jsonb("price_matrix").notNull(), // number[height_idx][width_idx]
  widthScaleMm: integer("width_scale_mm").notNull(),
  heightScaleMm: integer("height_scale_mm").notNull(),
  // Panel blinds only: nested track hardware sub-table
  track: jsonb("track"),
}, (t) => ({
  familyGroupIdx: uniqueIndex("price_grid_family_group_idx").on(t.familySlug, t.groupNumber),
}));

// Maps a blind fabric's display name -> its pricing group number, per
// fabric source/manufacturer (e.g. Blind_Settings "TexstyleFabricNames").
// NOTE: distinct from the curtain fabric price library below -- for blinds
// the fabric determines a *group index* into price_grid_groups, not a
// standalone $/metre.
export const blindFabricOptions = pgTable("blind_fabric_options", {
  id: serial("id").primaryKey(),
  familySlug: text("family_slug").notNull(),
  source: text("source").notNull(), // e.g. "Texstyle"
  fabricName: text("fabric_name").notNull(),
  priceGroup: integer("price_group").notNull(),
}, (t) => ({
  // Unique (not just indexed) so re-running the seed script is idempotent
  // rather than silently duplicating all 223 rows on every run -- caught by
  // actually re-running the seed against a real database.
  lookupIdx: uniqueIndex("blind_fabric_lookup_idx").on(t.familySlug, t.source, t.fabricName),
}));

// Control type -> $ cost, per blind family (e.g. RollerControlPrices).
export const controlPrices = pgTable("control_prices", {
  id: serial("id").primaryKey(),
  familySlug: text("family_slug").notNull(),
  controlType: text("control_type").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
}, (t) => ({
  lookupIdx: uniqueIndex("control_price_lookup_idx").on(t.familySlug, t.controlType),
}));

export const blindAccessories = pgTable("blind_accessories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
});

// Curtain track/motor price-by-length tables (146 named ranges in the
// source, kept close to their raw shape -- see extraction README).
export const curtainPriceLists = pgTable("curtain_price_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // original named-range name, e.g. OtherWSTWMotorAcmedaPrices
  trackLengthsMm: jsonb("track_lengths_mm").notNull(), // number[]
  prices: jsonb("prices").notNull(), // number[] parallel to trackLengthsMm
});

// Generic dropdown/option lists that don't need their own pricing table
// (fittings, colours, layouts, chain lengths, etc.) -- see
// settings/blind_settings_named_ranges.json / curtain_settings_named_ranges.json
export const optionLists = pgTable("option_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // original named-range name, e.g. "BlindFittings"
  values: jsonb("values").notNull(),
});

// ---------------------------------------------------------------------------
// Fabric library (curtains + any $/metre-priced blind fabrics)

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const fabrics = pgTable("fabrics", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  name: text("name").notNull(),
  // Nullable: a handful of real fabrics in the source workbook have an
  // unusable cached price (a literal "#N/A" formula error, or genuinely
  // blank) -- see seed.ts. Those rows are kept (so the fabric name still
  // matches historical quotes) but marked inactive with a null price rather
  // than silently coerced to 0 or dropped.
  pricePerMetre: numeric("price_per_metre", { precision: 10, scale: 2 }),
  active: boolean("active").notNull().default(true),
  importBatchId: integer("import_batch_id").references(() => fabricImportBatches.id),
}, (t) => ({
  // Unique on (supplier, name, price) rather than just (supplier, name):
  // the source data has a couple of real same-name fabrics within one
  // supplier at two different prices (e.g. Zepel "Dadaism" at both $70 and
  // $95/m -- likely two colourways/widths sharing a name in the sheet, not
  // an extraction error, confirmed while seeding). A (supplier, name)-only
  // constraint would silently drop the second one on conflict; this keeps
  // both rather than losing real pricing data.
  supplierNamePriceIdx: uniqueIndex("fabric_supplier_name_price_idx").on(
    t.supplierId, t.name, t.pricePerMetre
  ),
  // Postgres treats every NULL as distinct in a unique index, so the index
  // above alone doesn't stop the small number of null-price fabrics (see
  // comment on pricePerMetre) from being re-inserted as duplicates every
  // time the seed script runs -- caught by actually re-running the seed
  // against a real database rather than assuming idempotency. This partial
  // index covers that case specifically.
  supplierNameNullPriceIdx: uniqueIndex("fabric_supplier_name_null_price_idx")
    .on(t.supplierId, t.name)
    .where(sql`${t.pricePerMetre} is null`),
}));

export const fabricImportBatches = pgTable("fabric_import_batches", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  sourceFilename: text("source_filename").notNull(),
  sourceFormat: text("source_format").notNull(), // "excel" | "pdf"
  status: text("status").notNull().default("pending_review"), // pending_review | approved | rejected
  importedRows: jsonb("imported_rows").notNull(), // staged rows before approval
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
});

// ---------------------------------------------------------------------------
// Pricing constants (versioned)

export const pricingConstantsVersions = pgTable("pricing_constants_versions", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(), // e.g. "2026-08-20"
  constants: jsonb("constants").notNull(), // { MitreCost: 22, BendCost: 28, ... }
  formulaLiteralConstants: jsonb("formula_literal_constants").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(false),
});

// ---------------------------------------------------------------------------
// Quotes

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  status: text("status").notNull().default("draft"), // draft | issued | accepted | declined
  pricingConstantsVersionId: integer("pricing_constants_version_id")
    .references(() => pricingConstantsVersions.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const quoteLineItems = pgTable("quote_line_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => quotes.id),
  lineNumber: integer("line_number").notNull(),
  room: text("room"),
  familySlug: text("family_slug").notNull(),
  // every entered attribute (width/height/fabric/control/etc), shape varies by family
  attributes: jsonb("attributes").notNull(),
  // full computed price breakdown -- mirrors the workbook's "office use only" columns
  priceBreakdown: jsonb("price_breakdown").notNull(),
  calculatedPrice: numeric("calculated_price", { precision: 10, scale: 2 }).notNull(),
  priceOverride: numeric("price_override", { precision: 10, scale: 2 }),
  priceOverrideReason: text("price_override_reason"),
  finalPrice: numeric("final_price", { precision: 10, scale: 2 }).notNull(),
});

// ---------------------------------------------------------------------------
// Invoices & payments (recording only -- no payment processing)

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  quoteId: integer("quote_id").notNull().references(() => quotes.id),
  issueDate: timestamp("issue_date").notNull().defaultNow(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("unpaid"), // unpaid | partially_paid | paid
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: timestamp("payment_date").notNull().defaultNow(),
  method: text("method").notNull(), // free-text label: cash | eft | card | cheque | ...
  reference: text("reference"),
  recordedBy: text("recorded_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
