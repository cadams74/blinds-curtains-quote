import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { GENERIC_BLIND_FAMILIES } from "@/lib/blindFamilies";
import { QUOTE_VIEWS } from "@/lib/quoteViews";
import { LineItemsTable } from "@/components/LineItemsTable";

export const dynamic = "force-dynamic";

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) notFound();

  const lineItems = await db
    .select()
    .from(schema.quoteLineItems)
    .where(eq(schema.quoteLineItems.quoteId, quoteId))
    .orderBy(asc(schema.quoteLineItems.lineNumber));

  // Which document/grid view buttons (Curtain Install, Curtain Grid, Blind
  // Grid, and whatever joins them later -- Blind Install etc.) apply to
  // this quote's actual line items -- see quoteViews.ts. These used to sit
  // on the dashboard under each quote; Clive asked for them here instead,
  // at the top of the quote they belong to.
  const applicableViews = QUOTE_VIEWS.filter((v) => v.appliesTo(lineItems));

  return (
    <>
      <Topbar />
      <div className="page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div style={{ minWidth: 0 }}>
            <h1>
              {quote.quoteNumber} <span className="badge">{quote.status}</span>
            </h1>
            <p className="muted">{quote.customerName}</p>
            {applicableViews.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {applicableViews.map((v) => (
                  <Link
                    key={v.key}
                    href={`/quotes/${quoteId}/${v.path}`}
                    className="btn secondary"
                    style={{ fontSize: 13, padding: "4px 10px" }}
                  >
                    {v.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexShrink: 0 }}>
            <a
              className="btn secondary"
              href={`/quotes/${quoteId}/pdf`}
              target="_blank"
              rel="noreferrer"
              style={{ whiteSpace: "nowrap" }}
            >
              Download PDF
            </a>
            <details style={{ position: "relative", flexShrink: 0 }}>
              <summary className="btn" style={{ cursor: "pointer", listStyle: "none", whiteSpace: "nowrap" }}>
                Add line item
              </summary>
              <div
                className="card"
                style={{
                  position: "absolute",
                  right: 0,
                  marginTop: 4,
                  minWidth: 200,
                  zIndex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <Link href={`/quotes/${quoteId}/line-items/new/roller`}>Roller Blind</Link>
                {GENERIC_BLIND_FAMILIES.map((f) => (
                  <Link key={f.slug} href={`/quotes/${quoteId}/line-items/new/${f.slug}`}>
                    {f.label}
                  </Link>
                ))}
                <Link href={`/quotes/${quoteId}/line-items/new/blind-accessory`}>Blind Accessory</Link>
                <Link href={`/quotes/${quoteId}/line-items/new/curtain`}>Curtain (S Wave Sheer)</Link>
                <Link href={`/quotes/${quoteId}/line-items/new/curtain-accessory`}>Curtain Accessory</Link>
                <Link href={`/quotes/${quoteId}/line-items/new/misc`}>Misc Quote item</Link>
              </div>
            </details>
          </div>
        </div>

        <LineItemsTable quoteId={quoteId} lineItems={lineItems} />
      </div>
    </>
  );
}
