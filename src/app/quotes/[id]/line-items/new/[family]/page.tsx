import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { GenericBlindLineItemForm } from "@/components/GenericBlindLineItemForm";
import { getOptionListValues } from "@/lib/pricingDataSource";
import { getBlindFamilyConfig } from "@/lib/blindFamilies";

export const dynamic = "force-dynamic";

export default async function NewGenericBlindLineItemPage({
  params,
}: {
  params: Promise<{ id: string; family: string }>;
}) {
  const { id, family } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const config = getBlindFamilyConfig(family);
  if (!config) notFound();

  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) notFound();

  const [sources, controlTypes, bracketTrackOptions] = await Promise.all([
    getOptionListValues(db, config.sourcesList),
    getOptionListValues(db, config.controlTypesList),
    config.bracketTrackList ? getOptionListValues(db, config.bracketTrackList) : Promise.resolve([]),
  ]);

  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 640 }}>
        <h1>Add {config.label}</h1>
        <p className="muted">
          {quote.quoteNumber} -- {quote.customerName}
        </p>
        <div className="card">
          <GenericBlindLineItemForm
            quoteId={quoteId}
            familySlug={config.slug}
            sources={sources as string[]}
            controlTypes={controlTypes as string[]}
            bracketTrackOptions={config.bracketTrackList ? (bracketTrackOptions as string[]) : undefined}
            bracketTrackLabel={config.slug === "panel" ? "Track / panel config" : "Bracket / track"}
          />
        </div>
      </div>
    </>
  );
}
