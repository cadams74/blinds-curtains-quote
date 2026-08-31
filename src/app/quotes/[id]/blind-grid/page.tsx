import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { PrintButton } from "@/components/PrintButton";
import { GENERIC_BLIND_FAMILIES } from "@/lib/blindFamilies";

export const dynamic = "force-dynamic";

// Mirrors the source workbook's "Blind Quote" sheet -- specifically its
// row-1 data-entry columns (Blind Quote!C1:Y1), the columns an estimator
// actually fills in per line, not the "OFFICE USE ONLY"/"CALCS AND SETTINGS"
// section further right. One row per blind line item across every family
// that shares this sheet (Roller + the five genericBlind.ts families --
// Honeycomb excluded, see app README: it has no live quoting route yet).
//
// Not every field applies to every family in the source workbook itself --
// see blindFamilies.ts and actions.ts's comments on which named ranges
// exist per family. Chain Length, Linked, Roll, Cassette, and Side Channels
// only ever have a source-data dropdown for Roller; Base Style only for
// Roller and Panel. Those cells render "--" for families the workbook
// itself has no such field for, same treatment as a field that's simply
// not been filled in -- there's no meaningful way to tell them apart from
// stored attributes alone, and neither case should look like missing data
// entry.
const BLIND_FAMILY_SLUGS = ["roller", ...GENERIC_BLIND_FAMILIES.map((f) => f.slug)];

const BLIND_TYPE_LABELS: Record<string, string> = {
  roller: "Roller",
  ...Object.fromEntries(GENERIC_BLIND_FAMILIES.map((f) => [f.slug, f.pricingFamily])),
};

interface BlindAttrs {
  fabricSource?: string;
  fabricName?: string;
  widthMm?: string | number;
  heightMm?: string | number;
  controlType?: string;
  bracketTrack?: string;
  cassette?: string;
  sideChannels?: boolean;
  linkChoice?: string;
  lhCutOut?: string | number;
  rhCutOut?: string | number;
  controlSide?: string;
  chainLength?: string;
  fitting?: string;
  componentColour?: string;
  fabricColour?: string;
  baseStyle?: string;
  roll?: string;
}

interface BlindBreakdown {
  fabricGroup?: number;
}

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === "") return "--";
  return String(v);
}

export default async function BlindGridPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) notFound();

  const lineItems = await db
    .select()
    .from(schema.quoteLineItems)
    .where(and(eq(schema.quoteLineItems.quoteId, quoteId), inArray(schema.quoteLineItems.familySlug, BLIND_FAMILY_SLUGS)))
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
            <h1 style={{ marginBottom: 2 }}>Blind Quote Grid</h1>
            <p className="muted" style={{ margin: 0 }}>
              {quote.quoteNumber} -- {quote.customerName}
            </p>
          </div>
          <PrintButton />
        </div>

        {lineItems.length === 0 ? (
          <div className="card" style={{ marginTop: 20 }}>
            <p className="muted" style={{ margin: 0 }}>
              This quote has no blind line items.
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
                    <th>Blind Type</th>
                    <th>Width</th>
                    <th>Height</th>
                    <th>LH Cut Out</th>
                    <th>RH Cut Out</th>
                    <th>Control Side</th>
                    <th>Control Type</th>
                    <th>Chain Length</th>
                    <th>Linked</th>
                    <th>Fitting</th>
                    <th>Component Colour</th>
                    <th>Fabric Source</th>
                    <th>Fabric Name</th>
                    <th>Grp</th>
                    <th>Fabric Colour</th>
                    <th>Base Style</th>
                    <th>Roll</th>
                    <th>Bracket/Track</th>
                    <th>Cassette</th>
                    <th>Side Channels</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li) => {
                    const attrs = li.attributes as BlindAttrs;
                    const breakdown = li.priceBreakdown as BlindBreakdown;
                    const isRoller = li.familySlug === "roller";
                    return (
                      <tr key={li.id}>
                        <td>
                          <Link href={`/quotes/${quoteId}/line-items/${li.id}/edit`}>{li.lineNumber}</Link>
                        </td>
                        <td>{fmt(li.room)}</td>
                        <td>{BLIND_TYPE_LABELS[li.familySlug] ?? li.familySlug}</td>
                        <td>{fmt(attrs.widthMm)}</td>
                        <td>{fmt(attrs.heightMm)}</td>
                        <td>{fmt(attrs.lhCutOut)}</td>
                        <td>{fmt(attrs.rhCutOut)}</td>
                        <td>{fmt(attrs.controlSide)}</td>
                        <td>{fmt(attrs.controlType)}</td>
                        <td className={isRoller ? undefined : "muted"}>
                          {isRoller ? fmt(attrs.chainLength) : "--"}
                        </td>
                        <td className={isRoller ? undefined : "muted"}>
                          {isRoller ? fmt(attrs.linkChoice) : "--"}
                        </td>
                        <td>{fmt(attrs.fitting)}</td>
                        <td>{fmt(attrs.componentColour)}</td>
                        <td>{fmt(attrs.fabricSource)}</td>
                        <td>{fmt(attrs.fabricName)}</td>
                        <td>{fmt(breakdown.fabricGroup)}</td>
                        <td>{fmt(attrs.fabricColour)}</td>
                        <td>{fmt(attrs.baseStyle)}</td>
                        <td className={isRoller ? undefined : "muted"}>{isRoller ? fmt(attrs.roll) : "--"}</td>
                        <td>{fmt(attrs.bracketTrack)}</td>
                        <td className={isRoller ? undefined : "muted"}>
                          {isRoller ? fmt(attrs.cassette) : "--"}
                        </td>
                        <td className={isRoller ? undefined : "muted"}>
                          {isRoller ? (attrs.sideChannels ? "Yes" : "No") : "--"}
                        </td>
                        <td>${Number(li.finalPrice).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="muted no-print" style={{ marginTop: 12, fontSize: 13 }}>
              Chain Length, Linked, Roll, Cassette, and Side Channels only exist as fields in the source
              workbook for Roller blinds -- other blind types show &ldquo;--&rdquo; because the sheet itself has
              no such column for them, not because data is missing.
            </p>
          </>
        )}
      </div>
    </>
  );
}
