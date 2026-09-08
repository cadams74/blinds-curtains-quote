import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { PrintButton } from "@/components/PrintButton";
import { GridPrintFit } from "@/components/GridPrintFit";

export const dynamic = "force-dynamic";

// Mirrors the source workbook's "Track Order Form" -- a FILTER() over the
// exact same 'Curtain Quote'!C3:Y42 range Curtain Grid reads (Room through
// Track Length), restricted to rows where Track/Accessory is non-blank.
// That filter is always true in practice: trackName is a required field on
// this app's curtain form, so every real saved s_wave_sheer line already
// qualifies -- reproduced here as the same family filter every other
// curtain document uses (curtain-grid, curtain-install, etc.) rather than
// a separate trackName<>"" check that could never actually exclude a row.
//
// Same column set as Curtain Grid, minus the two columns that belong to a
// pricing/install review (Height, Price) rather than a track order, plus
// one the source sheet adds specifically for this form: a free-text Notes
// column (Track Order Form!X, no formula behind it at all -- confirmed by
// reading the sheet's own cells -- for whoever places the order to jot
// something down by hand). This app has no per-line free-text notes field
// today, so Notes shows "--" the same honest way every other uncaptured
// column already does; the source sheet's own Notes column is blank on
// every real quote in the workbook too.
//
// Requested to print in the same landscape/shrink-to-fit style as Curtain
// Grid and Blind Grid -- reuses the exact same pieces: GridPrintFit (the
// beforeprint zoom-shrink), the .grid-print-page class (the named
// grid-landscape @page), and the .grid-table/.grid-scroll styling, all
// already shared via globals.css/GridPrintFit.tsx rather than duplicated.
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
}

interface CurtainBreakdown {
  trackLengthCm?: number;
}

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === "") return "--";
  return String(v);
}

export default async function CurtainTrackOrderPage({ params }: { params: Promise<{ id: string }> }) {
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
      <GridPrintFit />
      <div className="page grid-print-page" style={{ maxWidth: 1400 }}>
        <div className="no-print" style={{ marginBottom: 16 }}>
          <Link href={`/quotes/${quoteId}`}>&larr; Back to {quote.quoteNumber}</Link>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element -- same
                static /public asset Topbar.tsx uses; a letterhead on a
                printed page, not an optimizable content image. */}
            <img
              src="/logo.png"
              alt="Unique Curtains + Blinds"
              style={{ height: 36, display: "block", marginBottom: 12 }}
            />
            <h1 style={{ marginBottom: 2 }}>Track Order Form</h1>
            <p className="muted" style={{ margin: 0 }}>
              {quote.quoteNumber} -- {quote.customerName}
            </p>
          </div>
          <PrintButton />
        </div>

        {lineItems.length === 0 ? (
          <div className="card" style={{ marginTop: 20 }}>
            <p className="muted" style={{ margin: 0 }}>
              This quote has no curtain line items -- nothing to order tracks for.
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
                    <th>Track/Accessory</th>
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
                    <th>Notes</th>
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
                        <td className="muted">--</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="muted no-print" style={{ marginTop: 12, fontSize: 13 }}>
              Fabric Code, Colour, Track Colour, and Wall are real columns on the source workbook&apos;s
              Track Order Form that this app doesn&apos;t yet capture -- they show as &ldquo;--&rdquo;
              rather than a guess, the same known gaps Curtain Grid already flags. Notes is a free-text
              column on the source sheet with no formula behind it at all -- it&apos;s blank on every real
              quote in the workbook, and this app has no equivalent per-line notes field to fill it from.
            </p>
          </>
        )}
      </div>
    </>
  );
}
