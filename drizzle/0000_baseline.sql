CREATE TABLE IF NOT EXISTS "blind_accessories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	CONSTRAINT "blind_accessories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blind_fabric_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"family_slug" text NOT NULL,
	"source" text NOT NULL,
	"fabric_name" text NOT NULL,
	"price_group" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"family_slug" text NOT NULL,
	"control_type" text NOT NULL,
	"price" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curtain_price_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"track_lengths_mm" jsonb NOT NULL,
	"prices" jsonb NOT NULL,
	CONSTRAINT "curtain_price_lists_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fabric_import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"source_filename" text NOT NULL,
	"source_format" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"imported_rows" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fabrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"name" text NOT NULL,
	"price_per_metre" numeric(10, 2),
	"active" boolean DEFAULT true NOT NULL,
	"import_batch_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "families" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"option_cascade" jsonb NOT NULL,
	CONSTRAINT "families_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"quote_id" integer NOT NULL,
	"issue_date" timestamp DEFAULT now() NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "option_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"values" jsonb NOT NULL,
	CONSTRAINT "option_lists_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"payment_date" timestamp DEFAULT now() NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"recorded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_grid_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"family_slug" text NOT NULL,
	"group_number" integer NOT NULL,
	"width_bands_mm" jsonb NOT NULL,
	"height_bands_mm" jsonb NOT NULL,
	"price_matrix" jsonb NOT NULL,
	"width_scale_mm" integer NOT NULL,
	"height_scale_mm" integer NOT NULL,
	"track" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pricing_constants_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"constants" jsonb NOT NULL,
	"formula_literal_constants" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"line_number" integer NOT NULL,
	"room" text,
	"family_slug" text NOT NULL,
	"attributes" jsonb NOT NULL,
	"price_breakdown" jsonb NOT NULL,
	"calculated_price" numeric(10, 2) NOT NULL,
	"price_override" numeric(10, 2),
	"price_override_reason" text,
	"final_price" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_number" text NOT NULL,
	"customer_name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"pricing_constants_version_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_quote_number_unique" UNIQUE("quote_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "suppliers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'estimator' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fabric_import_batches" ADD CONSTRAINT "fabric_import_batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fabrics" ADD CONSTRAINT "fabrics_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fabrics" ADD CONSTRAINT "fabrics_import_batch_id_fabric_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."fabric_import_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quotes" ADD CONSTRAINT "quotes_pricing_constants_version_id_pricing_constants_versions_id_fk" FOREIGN KEY ("pricing_constants_version_id") REFERENCES "public"."pricing_constants_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blind_fabric_lookup_idx" ON "blind_fabric_options" USING btree ("family_slug","source","fabric_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "control_price_lookup_idx" ON "control_prices" USING btree ("family_slug","control_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fabric_supplier_name_price_idx" ON "fabrics" USING btree ("supplier_id","name","price_per_metre");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fabric_supplier_name_null_price_idx" ON "fabrics" USING btree ("supplier_id","name") WHERE "fabrics"."price_per_metre" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_grid_family_group_idx" ON "price_grid_groups" USING btree ("family_slug","group_number");