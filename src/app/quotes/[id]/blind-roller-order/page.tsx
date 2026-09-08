import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { BlindOrderForm } from "@/components/BlindOrderForm";

export const dynamic = "force-dynamic";

// Mirrors the source workbook's "Roller Order Form" sheet. Its own printed
// title (cell B1) reads "Roller/Panel Order Form" -- not just "Roller" --
// because its FILTER() formula is a boolean-OR-via-addition combining FOUR
// Blind Type values:
//   FILTER('Blind Quote'!C3:W44,
//     (D3:D44="Roller") + (D3:D44="Panel") + (D3:D44="Vertical") + (D3:D44="Accessory"))
// "Accessory" has no equivalent family in this app (there's no
// family_slug for a standalone accessory line), so it's simply omitted
// from the query below -- it can never match a real row here, the same
// way Track Order Form's always-true Track/Accessory filter was reproduced
// as a plain family check rather than a literal no-op condition.
const ROLLER_ORDER_FAMILY_SLUGS = ["roller", "panel", "vertical"];

export default async function BlindRollerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) notFound();

  const lineItems = await db
    .select()
    .from(schema.quoteLineItems)
    .where(
      and(
        eq(schema.quoteLineItems.quoteId, quoteId),
        inArray(schema.quoteLineItems.familySlug, ROLLER_ORDER_FAMILY_SLUGS)
      )
    )
    .orderBy(asc(schema.quoteLineItems.lineNumber));

  return (
    <BlindOrderForm
      quoteId={quoteId}
      quoteNumber={quote.quoteNumber}
      customerName={quote.customerName}
      title="Roller/Panel Order Form"
      lineItems={lineItems}
      emptyMessage="This quote has no Roller, Panel, or Vertical blind line items -- nothing to order for this form."
    />
  );
}
