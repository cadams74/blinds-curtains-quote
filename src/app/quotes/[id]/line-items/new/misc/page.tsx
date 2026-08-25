import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { MiscLineItemForm } from "@/components/MiscLineItemForm";

export const dynamic = "force-dynamic";

export default async function NewMiscLineItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) notFound();

  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 560 }}>
        <h1>Add Misc Quote item</h1>
        <p className="muted">
          {quote.quoteNumber} -- {quote.customerName}
        </p>
        <div className="card">
          <MiscLineItemForm quoteId={quoteId} />
        </div>
      </div>
    </>
  );
}
