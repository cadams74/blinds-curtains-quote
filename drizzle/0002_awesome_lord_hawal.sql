ALTER TABLE "quote_line_items" ALTER COLUMN "calculated_price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_line_items" ALTER COLUMN "final_price" DROP NOT NULL;