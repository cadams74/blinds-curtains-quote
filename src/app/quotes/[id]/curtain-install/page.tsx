import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// Mirrors the Curtain Quote columns actually shown on the source
// workbook's "Curtain Install" sheet -- see that sheet's per-line card
// (Curtain Install!B3:L12, repeated every 10 rows) and the app README's
// "Curtain Installation document" write-up for the full column-by-column
// trace of which Curtain Quote column feeds which install-card field.
interface CurtainAttrs {
  style?: string; // "Making" on the install sheet
  finish?: string;
  trackName?: string; // "Tracks"
  layout?: string;
  leftReturnCm?: string | number; // "LH Ret"
  rightReturnCm?: string | number; // "RH Ret"
  overlapCm?: string | number; // "O/L"
  lpwCm?: string | number;
  wwCm?: string | number;
  rpwCm?: string | number;
  hooks?: string;
  stack?: string;
  fitting?: string;
  ctrlSide?: string; // "Ctrl"
}

interface CurtainBreakdown {
  trackLengthCm?: number;
  makeHeightCm?: number; // "Drop" on the install sheet -- NOT the raw entered height
  widthDefinition?: string; // "No./W"
}

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === "") return "--";
  return String(v);
}

function fmtCm(v: unknown): string {
  if (v === undefined || v === null || v === "") return "--";
  const n = Number(v);
  return Number.isFinite(n) ? `${n}cm` : String(v);
}

export default async function CurtainInstallPage({ params }: { params: Promise<{ id: string }> }) {
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
      <div className="page install-sheet" style={{ maxWidth: 900 }}>
        <div className="no-print" style={{ marginBottom: 16 }}>
          <Link href={`/quotes/${quoteId}`}>&larr; Back to {quote.quoteNumber}</Link>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ marginBottom: 2 }}>Curtain Installation Sheet</h1>
            <p className="muted" style={{ margin: 0 }}>
              {quote.quoteNumber} -- {quote.customerName}
            </p>
          </div>
          <PrintButton />
        </div>

        {lineItems.length === 0 ? (
          <div className="card" style={{ marginTop: 20 }}>
            <p className="muted" style={{ margin: 0 }}>
              This quote has no curtain line items -- nothing to install.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            {lineItems.map((li) => {
              const attrs = li.attributes as CurtainAttrs;
              const breakdown = li.priceBreakdown as CurtainBreakdown;
              const widthParts = [
                attrs.lpwCm ? `LPW ${fmtCm(attrs.lpwCm)}` : null,
                attrs.wwCm ? `WW ${fmtCm(attrs.wwCm)}` : null,
                attrs.rpwCm ? `RPW ${fmtCm(attrs.rpwCm)}` : null,
              ].filter(Boolean);

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
                      <div className="install-stat-label">No./W</div>
                      <div className="install-stat-value">{fmt(breakdown.widthDefinition)}</div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">Track length</div>
                      <div className="install-stat-value">{fmtCm(breakdown.trackLengthCm)}</div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">LH Ret</div>
                      <div className="install-stat-value">{fmtCm(attrs.leftReturnCm)}</div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">RH Ret</div>
                      <div className="install-stat-value">{fmtCm(attrs.rightReturnCm)}</div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">O/L</div>
                      <div className="install-stat-value">{fmtCm(attrs.overlapCm)}</div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">Drop</div>
                      <div className="install-stat-value">{fmtCm(breakdown.makeHeightCm)}</div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">Hooks</div>
                      <div className="install-stat-value">{fmt(attrs.hooks)}</div>
                    </div>
                  </div>

                  <dl className="install-details">
                    <dt>Making</dt>
                    <dd>{fmt(attrs.style)}</dd>
                    <dt>Finish</dt>
                    <dd>{fmt(attrs.finish)}</dd>
                    <dt>Fitting</dt>
                    <dd>{fmt(attrs.fitting)}</dd>
                    <dt>Layout</dt>
                    <dd>
                      {fmt(attrs.layout)}
                      {widthParts.length > 0 && (
                        <span className="muted"> ({widthParts.join(" / ")})</span>
                      )}
                    </dd>
                    <dt>Tracks</dt>
                    <dd>{fmt(attrs.trackName)}</dd>
                    <dt>Ctrl</dt>
                    <dd>{fmt(attrs.ctrlSide)}</dd>
                    <dt>Stack</dt>
                    <dd>{fmt(attrs.stack)}</dd>
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
