import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { BlindOrderForm } from "@/components/BlindOrderForm";

export const dynamic = "force-dynamic";

// Mirrors the source workbook's "Roman Order Form" sheet -- a single-
// family filter, same shape as Venetian Order Form:
//   FILTER('Blind Quote'!C3:W44, 'Blind Quote'!D3:D44="Roman")
export default async function BlindRomanOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) notFound();

  const lineItems = await db
    .select()
    .from(schema.quoteLineItems)
    .where(and(eq(schema.quoteLineItems.quoteId, quoteId), eq(schema.quoteLineItems.familySlug, "roman")))
    .orderBy(asc(schema.quoteLineItems.lineNumber));

  return (
    <BlindOrderForm
      quoteId={quoteId}
      quoteNumber={quote.quoteNumber}
      customerName={quote.customerName}
      title="Roman Order Form"
      lineItems={lineItems}
      emptyMessage="This quote has no Roman blind line items -- nothing to order for this form."
    />
  );
}
