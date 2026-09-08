import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { PrintButton } from "@/components/PrintButton";
import { ALL_BLIND_FAMILY_SLUGS, BLIND_TYPE_LABELS } from "@/lib/blindFamilies";

export const dynamic = "force-dynamic";

// Mirrors the source workbook's "Blind Install" sheet -- a 6-row repeating
// card (Blind Install!B3:L7, repeated every 6 rows), each field pulled by
// VLOOKUP(line_number, 'Blind Quote'!$A$3:$AY$44, col, 0). Reconstructed by
// reading the first five cards' formulas: Room (col 3), Type (4), Width
// (5), Drop (6 -- the raw Height column, NOT a computed make-height the
// way Curtain Install's Drop is; the source sheet has no such adjustment
// for blinds), Cut LH (7), Cut RH (8), Side (9), Control Type (10), Length
// (11), Fitting (13), Rolled (20), Bracket Type (21). Everything else on
// Blind Quote (Linked, Component Colour, Fabric Source/Name, Grp, Fabric
// Colour, Base Style, Cassette, Side Channels, CM, Price) is deliberately
// left off this card in the source workbook too -- an installer needs
// dimensions and hardware, not fabric/pricing detail.
//
// One row per blind line item across every family that shares this sheet
// (Roller + the five genericBlind.ts families -- Honeycomb excluded, see
// app README: no live quoting route yet). Not every field applies to
// every family in the source data -- Length (Chain Length) and Rolled
// (Roll) only ever have a value for Roller, same finding as blind-grid's
// -- shown as "--" for other families rather than looking like a blank
// data-entry mistake.
interface BlindAttrs {
  widthMm?: string | number;
  heightMm?: string | number;
  lhCutOut?: string | number;
  rhCutOut?: string | number;
  controlSide?: string;
  controlType?: string;
  chainLength?: string;
  fitting?: string;
  roll?: string;
  bracketTrack?: string;
}

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === "") return "--";
  return String(v);
}

function fmtMm(v: unknown): string {
  if (v === undefined || v === null || v === "") return "--";
  const n = Number(v);
  return Number.isFinite(n) ? `${n}mm` : String(v);
}

export default async function BlindInstallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) notFound();

  const lineItems = await db
    .select()
    .from(schema.quoteLineItems)
    .where(and(eq(schema.quoteLineItems.quoteId, quoteId), inArray(schema.quoteLineItems.familySlug, ALL_BLIND_FAMILY_SLUGS)))
    .orderBy(asc(schema.quoteLineItems.lineNumber));

  return (
    <>
      <Topbar />
      <div className="page install-sheet" style={{ maxWidth: 900 }}>
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
            <h1 style={{ marginBottom: 2 }}>Blind Installation Sheet</h1>
            <p className="muted" style={{ margin: 0 }}>
              {quote.quoteNumber} -- {quote.customerName}
            </p>
          </div>
          <PrintButton />
        </div>

        {lineItems.length === 0 ? (
          <div className="card" style={{ marginTop: 20 }}>
            <p className="muted" style={{ margin: 0 }}>
              This quote has no blind line items -- nothing to install.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            {lineItems.map((li) => {
              const attrs = li.attributes as BlindAttrs;
              const isRoller = li.familySlug === "roller";

              return (
                <div className="install-card" key={li.id}>
                  <div className="install-card-header">
                    <span>
                      <strong>#{li.lineNumber}</strong>{" "}
                      <span style={{ fontSize: 16 }}>{li.room || <span className="muted">(no room set)</span>}</span>
                    </span>
                  </div>

                  <div className="install-stats">
                    <div className="install-stat">
                      <div className="install-stat-label">Width</div>
                      <div className="install-stat-value">{fmtMm(attrs.widthMm)}</div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">Drop</div>
                      <div className="install-stat-value">{fmtMm(attrs.heightMm)}</div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">Cut LH</div>
                      <div className="install-stat-value">{fmtMm(attrs.lhCutOut)}</div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">Cut RH</div>
                      <div className="install-stat-value">{fmtMm(attrs.rhCutOut)}</div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">Rolled</div>
                      <div className="install-stat-value">{isRoller ? fmt(attrs.roll) : "--"}</div>
                    </div>
                  </div>

                  <dl className="install-details">
                    <dt>Type</dt>
                    <dd>{BLIND_TYPE_LABELS[li.familySlug] ?? li.familySlug}</dd>
                    <dt>Control Type</dt>
                    <dd>{fmt(attrs.controlType)}</dd>
                    <dt>Bracket Type</dt>
                    <dd>{fmt(attrs.bracketTrack)}</dd>
                    <dt>Fitting</dt>
                    <dd>{fmt(attrs.fitting)}</dd>
                    <dt>Side</dt>
                    <dd>{fmt(attrs.controlSide)}</dd>
                    <dt>Length</dt>
                    <dd>{isRoller ? fmt(attrs.chainLength) : "--"}</dd>
                  </dl>

                  <div className="install-notes">
                    <div className="install-stat-label" style={{ marginBottom: 4 }}>
                      Notes
                    </div>
                    <div className="install-notes-line" />
                    <div className="install-notes-line" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
