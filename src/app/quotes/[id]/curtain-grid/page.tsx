import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// Mirrors the source workbook's "Curtain Quote" sheet -- specifically its
// row-1 data-entry columns (Curtain Quote!C1:AB1), the columns an estimator
// actually fills in per line, not the "OFFICE USE ONLY"/"CALCS AND SETTINGS"
// section further right (Fullness, Install Type, Make Height, etc.) which
// belongs to the Curtain Installation document (see curtain-install/page.tsx)
// rather than a full-quote review grid. One row per curtain line item, as
// many columns across the screen as the sheet itself shows.
interface CurtainAttrs {
  style?: string;
  liningInput?: "U" | "L";
  finish?: string;
  ctrlSide?: string;
  stack?: string;
  fabricSupplier?: string;
  fabricName?: string;
  pricePerMetre?: string | number;
  trackName?: string;
  leftReturnCm?: string | number;
  rightReturnCm?: string | number;
  overlapCm?: string | number;
  fitting?: string;
  layout?: string;
  lpwCm?: string | number;
  wwCm?: string | number;
  rpwCm?: string | number;
  heightCm?: string | number;
}

interface CurtainBreakdown {
  trackLengthCm?: number;
}

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === "") return "--";
  return String(v);
}

export default async function CurtainGridPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) notFound();

  const lineItems = await db
    .select()
    .from(schema.quoteLineItems)
    .where(and(eq(schema.quoteLineItems.quoteId, quoteId), eq(schema.quoteLineItems.familySlug, "s_wave_sheer")))
    .orderBy(asc(schema.quoteLineItems.lineNumber));

  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 1400 }}>
        <div className="no-print" style={{ marginBottom: 16 }}>
          <Link href={`/quotes/${quoteId}`}>&larr; Back to {quote.quoteNumber}</Link>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ marginBottom: 2 }}>Curtain Quote Grid</h1>
            <p className="muted" style={{ margin: 0 }}>
              {quote.quoteNumber} -- {quote.customerName}
            </p>
          </div>
          <PrintButton />
        </div>

        {lineItems.length === 0 ? (
          <div className="card" style={{ marginTop: 20 }}>
            <p className="muted" style={{ margin: 0 }}>
              This quote has no curtain line items.
            </p>
          </div>
        ) : (
          <>
            <div className="grid-scroll" style={{ marginTop: 20 }}>
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Room</th>
                    <th>Style</th>
                    <th>U/L</th>
                    <th>Finish</th>
                    <th>Ctrl Side</th>
                    <th>Stack</th>
                    <th>Fabric Co.</th>
                    <th>Fabric Code</th>
                    <th>Fabric Name</th>
                    <th>Colour</th>
                    <th>$/M</th>
                    <th>Track</th>
                    <th>Track Colour</th>
                    <th>Left</th>
                    <th>Right</th>
                    <th>O/L</th>
                    <th>Fitting</th>
                    <th>Wall</th>
                    <th>Layout</th>
                    <th>LPW</th>
                    <th>WW</th>
                    <th>RPW</th>
                    <th>Track Length</th>
                    <th>Height</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li) => {
                    const attrs = li.attributes as CurtainAttrs;
                    const breakdown = li.priceBreakdown as CurtainBreakdown;
                    return (
                      <tr key={li.id}>
                        <td>
                          <Link href={`/quotes/${quoteId}/line-items/${li.id}/edit`}>{li.lineNumber}</Link>
                        </td>
                        <td>{fmt(li.room)}</td>
                        <td>{fmt(attrs.style)}</td>
                        <td>{fmt(attrs.liningInput)}</td>
                        <td>{fmt(attrs.finish)}</td>
                        <td>{fmt(attrs.ctrlSide)}</td>
                        <td>{fmt(attrs.stack)}</td>
                        <td>{fmt(attrs.fabricSupplier)}</td>
                        <td className="muted">--</td>
                        <td>{fmt(attrs.fabricName)}</td>
                        <td className="muted">--</td>
                        <td>{fmt(attrs.pricePerMetre)}</td>
                        <td>{fmt(attrs.trackName)}</td>
                        <td className="muted">--</td>
                        <td>{fmt(attrs.leftReturnCm)}</td>
                        <td>{fmt(attrs.rightReturnCm)}</td>
                        <td>{fmt(attrs.overlapCm)}</td>
                        <td>{fmt(attrs.fitting)}</td>
                        <td className="muted">--</td>
                        <td>{fmt(attrs.layout)}</td>
                        <td>{fmt(attrs.lpwCm)}</td>
                        <td>{fmt(attrs.wwCm)}</td>
                        <td>{fmt(attrs.rpwCm)}</td>
                        <td>{fmt(breakdown.trackLengthCm)}</td>
                        <td>{fmt(attrs.heightCm)}</td>
                        <td>${Number(li.finalPrice).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="muted no-print" style={{ marginTop: 12, fontSize: 13 }}>
              Fabric Code, Colour, Track Colour, and Wall are real columns on the source workbook&apos;s Curtain
              Quote sheet that this app doesn&apos;t yet capture -- they show as &ldquo;--&rdquo; rather than a
              guess. Fabric Code&apos;s source list in the workbook is Clive&apos;s own placeholder favourites
              data, not real fabric codes (see Phase 1); Wall is blank on every real quote line in the source
              workbook too.
            </p>
          </>
        )}
      </div>
    </>
  );
}
