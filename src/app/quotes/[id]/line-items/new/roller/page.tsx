import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { RollerLineItemForm } from "@/components/RollerLineItemForm";
import { getOptionListValues } from "@/lib/pricingDataSource";

export const dynamic = "force-dynamic";

export default async function NewRollerLineItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) notFound();

  const [
    sources,
    brackets,
    cassettes,
    channels,
    links,
    controlTypes,
    controlSides,
    chainLengths,
    fittings,
    componentColours,
    baseStyles,
    rolls,
  ] = await Promise.all([
    getOptionListValues(db, "RollerSources"),
    getOptionListValues(db, "RollerBrackets"),
    getOptionListValues(db, "RollerCassettes"),
    getOptionListValues(db, "RollerChannels"),
    getOptionListValues(db, "RollerLinks"),
    getOptionListValues(db, "RollerControlTypes"),
    getOptionListValues(db, "RollerControlSides"),
    getOptionListValues(db, "RollerChainLengths"),
    getOptionListValues(db, "BlindFittings"),
    getOptionListValues(db, "ComponentColours"),
    getOptionListValues(db, "RollerBaseStyles"),
    getOptionListValues(db, "RollerRolls"),
  ]);

  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 640 }}>
        <h1>Add Roller Blind</h1>
        <p className="muted">
          {quote.quoteNumber} -- {quote.customerName}
        </p>
        <div className="card">
          <RollerLineItemForm
            quoteId={quoteId}
            sources={sources as string[]}
            brackets={brackets as string[]}
            cassettes={cassettes as string[]}
            channels={channels as string[]}
            links={links as string[]}
            controlTypes={controlTypes as string[]}
            controlSides={controlSides as string[]}
            chainLengths={chainLengths as string[]}
            fittings={fittings as string[]}
            componentColours={componentColours as string[]}
            baseStyles={baseStyles as string[]}
            rolls={rolls as string[]}
          />
        </div>
      </div>
    </>
  );
}
