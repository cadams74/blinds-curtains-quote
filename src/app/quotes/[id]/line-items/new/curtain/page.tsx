import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { CurtainLineItemForm } from "@/components/CurtainLineItemForm";
import { getOptionListValues } from "@/lib/pricingDataSource";
import { getCurtainFabricSuppliers } from "@/lib/actions";
import { getCurtainHookNames } from "@/lib/curtainDataSource";

export const dynamic = "force-dynamic";

export default async function NewCurtainLineItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) notFound();

  const [styles, finishes, tracks, layouts, suppliers, hooks] = await Promise.all([
    getOptionListValues(db, "Styles"),
    getOptionListValues(db, "Finish"),
    getOptionListValues(db, "Tracks"),
    getOptionListValues(db, "Layouts"),
    getCurtainFabricSuppliers(),
    getCurtainHookNames(db),
  ]);

  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 640 }}>
        <h1>Add Curtain</h1>
        <p className="muted">
          {quote.quoteNumber} -- {quote.customerName}
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          Only "sheer", non-"OH" styles are validated against real historical quotes -- other styles
          are priced from the same formulas but flagged as needing a manual price until real data
          confirms them (see app README).
        </p>
        <div className="card">
          <CurtainLineItemForm
            quoteId={quoteId}
            styles={styles as string[]}
            finishes={finishes as string[]}
            tracks={tracks as string[]}
            layouts={layouts as string[]}
            hooks={hooks}
            suppliers={suppliers}
          />
        </div>
      </div>
    </>
  );
}
