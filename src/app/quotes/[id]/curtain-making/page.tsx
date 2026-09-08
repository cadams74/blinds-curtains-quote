import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// Mirrors the source workbook's "Curtain Making" sheet -- a 10-row repeating
// card per curtain line item (Curtain Making!B3:L12, repeated every 10 rows,
// confirmed against the sheet's own formulas), distinct from Curtain
// Install: this one is the workroom's cutting/making docket (fabric
// quantity, lining, the Drop/CHK gate), not the on-site fitter's sheet.
// Every value here is a VLOOKUP into 'Curtain Quote'!$A$3:$AV$42, the same
// range Curtain Install reads -- see that page's header comment for the
// full column trace; only the additions specific to this sheet are called
// out below.
interface CurtainAttrs {
  style?: string; // "Making" -- also what the Notes lining-tape check reads
  fabricName?: string;
  trackName?: string; // feeds the Track tile's dynamic "(Stack)" suffix label
  stack?: string;
  leftReturnCm?: string | number;
  rightReturnCm?: string | number;
  overlapCm?: string | number;
  hooks?: string;
  // CM ("Curtain Quote"!AA, Y/D/N -- see CurtainLineItemForm) gates the
  // Drop tile exactly as the source formula does:
  // =IF(VLOOKUP(...,27,0)<>"D","CHK",VLOOKUP(...,40,0)). Only quotes saved
  // since this field was added will have it; older line items read as ""
  // here, which (correctly, per that same formula) shows "CHK" rather than
  // a guessed Drop value.
  cm?: string;
}

interface CurtainBreakdown {
  trackLengthCm?: number;
  makeHeightCm?: number; // the "Drop" value, shown only when CM = "D"
  fabricQuantityM?: number;
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

function fmtM(v: unknown): string {
  if (v === undefined || v === null || v === "") return "--";
  return `${v}m`;
}

// Curtain Making!E3's header text embeds Stack directly into the "Track"
// label itself (=("Track"&CHAR(10)&"(" & VLOOKUP(...,8,0) & ")"), e.g.
// "Track\n(2W)") rather than showing Stack as its own tile -- reproduced
// here as a dynamic tile label instead of a fixed one.
function trackLabel(stack: string | undefined): string {
  return stack ? `Track (${stack})` : "Track";
}

// Curtain Making!C9 (merged C9:L9, "Notes"):
//   =IFERROR(IF(ISNUMBER(SEARCH("Lining",VLOOKUP(...,4,0))),
//     IF(VLOOKUP(...,14,0)="  TW Series 74 Venice","9cm heading tape required",""),""),0)
// i.e. only ever shows anything for a Style containing "Lining" paired with
// the "TW Series 74 Venice" track. Reproduced faithfully, but it can never
// actually appear on a real saved quote: addCurtainLineItem() only ever
// saves a "sheer, non-OH" style (every other style throws
// unvalidated_style_variant -- see src/lib/actions.ts), and none of those
// style names contain "Lining". Documented rather than hidden, the same
// "flag the unreachable branch" treatment as Curtain Install/Curtain Grid
// give their own not-yet-real-data fields.
function liningTapeNote(style: string | undefined, trackName: string | undefined): string | null {
  if (!style || !/lining/i.test(style)) return null;
  if (trackName !== "  TW Series 74 Venice") return null;
  return "9cm heading tape required";
}

export default async function CurtainMakingPage({ params }: { params: Promise<{ id: string }> }) {
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
            {/* eslint-disable-next-line @next/next/no-img-element -- same
                static /public asset Topbar.tsx uses; a letterhead on a
                printed page, not an optimizable content image. */}
            <img
              src="/logo.png"
              alt="Unique Curtains + Blinds"
              style={{ height: 36, display: "block", marginBottom: 12 }}
            />
            <h1 style={{ marginBottom: 2 }}>Curtain Making Sheet</h1>
            <p className="muted" style={{ margin: 0 }}>
              {quote.quoteNumber} -- {quote.customerName}
            </p>
          </div>
          <PrintButton />
        </div>

        {lineItems.length === 0 ? (
          <div className="card" style={{ marginTop: 20 }}>
            <p className="muted" style={{ margin: 0 }}>
              This quote has no curtain line items -- nothing to make.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            {lineItems.map((li) => {
              const attrs = li.attributes as CurtainAttrs;
              const breakdown = li.priceBreakdown as CurtainBreakdown;
              const note = liningTapeNote(attrs.style, attrs.trackName);

              return (
                <div className="install-card" key={li.id}>
                  <div className="install-card-header">
                    <span>
                      <strong>#{li.lineNumber}</strong>{" "}
                      <span style={{ fontSize: 16 }}>{li.room || <span className="muted">(no room set)</span>}</span>
                    </span>
                  </div>

                  <dl className="install-details">
                    <dt>Fabric Qty</dt>
                    <dd>{fmtM(breakdown.fabricQuantityM)}</dd>
                    <dt>Making</dt>
                    <dd>{fmt(attrs.style)}</dd>
                    <dt>Fabric</dt>
                    <dd>{fmt(attrs.fabricName)}</dd>
                    <dt>Colour</dt>
                    <dd className="muted">--</dd>
                    <dt>Lining</dt>
                    <dd className="muted">--</dd>
                  </dl>

                  <div className="install-stats">
                    <div className="install-stat">
                      <div className="install-stat-label">No./W</div>
                      <div className="install-stat-value">{fmt(breakdown.widthDefinition)}</div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">{trackLabel(attrs.stack)}</div>
                      <div className="install-stat-value">{fmtCm(breakdown.trackLengthCm)}</div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">LH Head Size</div>
                      <div className="install-stat-value muted">--</div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">RH Head Size</div>
                      <div className="install-stat-value muted">--</div>
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
                      <div className="install-stat-value">
                        {attrs.cm === "D" ? fmtCm(breakdown.makeHeightCm) : "CHK"}
                      </div>
                    </div>
                    <div className="install-stat">
                      <div className="install-stat-label">Hooks</div>
                      <div className="install-stat-value">{fmt(attrs.hooks)}</div>
                    </div>
                  </div>

                  {note && (
                    <div className="install-notes">
                      <div className="install-stat-label" style={{ marginBottom: 4 }}>
                        Notes
                      </div>
                      <p style={{ margin: 0 }}>{note}</p>
                    </div>
                  )}
                </div>
              );
            })}

            <p className="muted no-print" style={{ marginTop: 12, fontSize: 13 }}>
              Colour and Lining are real columns on the source workbook&apos;s Curtain Making sheet that
              this app doesn&apos;t capture -- they show as &ldquo;--&rdquo; rather than a guess. LH/RH Head
              Size are blank here for the same reason they&apos;d be blank on the source sheet itself: its own
              formula clears both whenever Style contains &ldquo;Upleat&rdquo; or &ldquo;S wave&rdquo;, and S
              Wave Sheer -- this app&apos;s only supported style -- always matches that. Drop shows
              &ldquo;CHK&rdquo; unless CM is set to &ldquo;D&rdquo;, matching the source sheet&apos;s own
              gate.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
