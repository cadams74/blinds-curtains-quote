import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { AccessoryLineItemForm } from "@/components/AccessoryLineItemForm";
import { getAccessoryFamilyConfig, getAccessoryCatalog } from "@/lib/accessoryFamilies";

export const dynamic = "force-dynamic";

export default async function NewBlindAccessoryLineItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const config = getAccessoryFamilyConfig("blind_accessory");
  if (!config) notFound();

  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) notFound();

  const catalog = await getAccessoryCatalog(db, config);

  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 560 }}>
        <h1>Add Blind Accessory</h1>
        <p className="muted">
          {quote.quoteNumber} -- {quote.customerName}
        </p>
        <div className="card">
          <AccessoryLineItemForm quoteId={quoteId} familySlug={config.slug} label={config.label} catalog={catalog} />
        </div>
      </div>
    </>
  );
}
