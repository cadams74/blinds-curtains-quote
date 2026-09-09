import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { deleteLineItem, moveLineItem } from "@/lib/actions";
import { GENERIC_BLIND_FAMILIES } from "@/lib/blindFamilies";
import { QUOTE_VIEWS } from "@/lib/quoteViews";
import { PriceOverrideForm } from "@/components/PriceOverrideForm";
import { DuplicateLineItemForm } from "@/components/DuplicateLineItemForm";
import { getLineItemFields } from "@/lib/lineItemFields";

export const dynamic = "force-dynamic";

const FAMILY_LABELS: Record<string, string> = {
  roller: "Roller Blind",
  venetian: "Venetian Blind",
  roman: "Roman Blind",
  panel: "Panel Glide",
  verishade: "Verishade",
  vertical: "Vertical Blind",
  s_wave_sheer: "Curtain (S Wave Sheer)",
  misc: "Misc Quote item",
  curtain_accessory: "Curtain Accessory",
  blind_accessory: "Blind Accessory",
};

function describeLineItemAttrs(familySlug: string, attrs: Record<string, unknown>): string {
  let text: string;
  if (familySlug === "misc") {
    text = String(attrs.description ?? "");
  } else if (familySlug === "curtain_accessory" || familySlug === "blind_accessory") {
    text = String(attrs.name ?? "");
  } else if (familySlug === "s_wave_sheer") {
    const parts = [
      attrs.style ? String(attrs.style) : null,
      attrs.heightCm ? `${attrs.heightCm}cm high` : null,
      attrs.fabricName ? String(attrs.fabricName) : null,
    ].filter(Boolean);
    text = parts.join(" -- ");
  } else {
    // Roller + the five genericBlind.ts families all share this attribute shape.
    const parts = [
      attrs.widthMm && attrs.heightMm ? `${attrs.widthMm}mm x ${attrs.heightMm}mm` : null,
      attrs.fabricName ? String(attrs.fabricName) : null,
    ].filter(Boolean);
    text = parts.join(" -- ");
  }
  // A duplicate created with every descriptive field deselected (see
  // DuplicateLineItemForm.tsx) has nothing here to show -- flag it rather
  // than render a confusingly blank Details cell.
  return text || "-- incomplete --";
}

/** A line item's price is null only when it was created by duplicating
 * another with a field deselected and hasn't been re-saved via Edit yet
 * (see actions.ts's duplicateLineItemWithOptions) -- genuinely not priced,
 * never rendered as "$0.00" or omitted silently. */
function formatLineItemPrice(
  li: { familySlug: string; finalPrice: string | null; priceBreakdown: unknown },
  overridden: boolean
): string {
  if (li.finalPrice === null) return "Needs pricing";
  if (
    li.familySlug === "misc" &&
    !overridden &&
    (li.priceBreakdown as { priceKind?: string } | null)?.priceKind === "no_charge"
  ) {
    return "N/C"; // deliberately not "$0.00" -- see misc.ts
  }
  return `$${Number(li.finalPrice).toFixed(2)}`;
}

// Shared sizing for every per-line-item action control (Edit, Duplicate,
// Override, Remove) so they read as one uniform row of buttons -- Override
// used to be a bare "muted" text toggle rather than a button, the one
// visibly inconsistent one; Remove keeps its "btn danger" red, everything
// else uses "btn secondary" with this same size. Move up/down deliberately
// isn't part of this row any more (see moveButtonStyle below) -- with five
// buttons plus the up/down pair all fighting for space in one cell, Remove
// was the one that lost and wrapped onto its own line on most quote lines.

const lineItemActionStyle = { fontSize: 13, padding: "4px 10px" } as const;

// Move up/down -- its own dedicated column at the left of the table (next
// to the line number, per Clive's request), not squeezed in among the
// other per-line-item action buttons on the right. Solid triangles rather
// than thin arrow glyphs so they read unambiguously as "move" controls at
// a small size; the wrapping <div> (see the table body below) centers this
// pair vertically against the row's full height, whatever that ends up
// being once the other columns' content sets it.
const moveButtonStyle = {
  width: 22,
  height: 18,
  padding: 0,
  fontSize: 9,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--border)",
  borderRadius: 4,
  background: "#fff",
  color: "var(--muted)",
  cursor: "pointer",
} as const;

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

  const total = lineItems.reduce((sum, li) => sum + (li.finalPrice !== null ? Number(li.finalPrice) : 0), 0);
  const incompleteCount = lineItems.filter((li) => li.finalPrice === null).length;

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

        {incompleteCount > 0 && (
          <p className="error" style={{ marginBottom: 12 }}>
            {incompleteCount} line item{incompleteCount === 1 ? "" : "s"} still need{incompleteCount === 1 ? "s" : ""}{" "}
            pricing -- open Edit on each to fill in the missing fields. The total below doesn&apos;t include them.
          </p>
        )}

        <div className="card">
          {lineItems.length === 0 ? (
            <p className="muted">No line items yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>#</th>
                  <th>Room</th>
                  <th>Product</th>
                  <th>Details</th>
                  <th>Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, idx) => {
                  const attrs = li.attributes as Record<string, unknown>;
                  const overridden = li.priceOverride !== null;
                  return (
                    <tr key={li.id}>
                      <td style={{ padding: 0, width: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: 3,
                            height: "100%",
                          }}
                        >
                          <form action={moveLineItem.bind(null, quoteId, li.id, "up")}>
                            <button
                              type="submit"
                              className="move-btn"
                              disabled={idx === 0}
                              title="Move up"
                              aria-label="Move up"
                              style={moveButtonStyle}
                            >
                              &#9650;
                            </button>
                          </form>
                          <form action={moveLineItem.bind(null, quoteId, li.id, "down")}>
                            <button
                              type="submit"
                              className="move-btn"
                              disabled={idx === lineItems.length - 1}
                              title="Move down"
                              aria-label="Move down"
                              style={moveButtonStyle}
                            >
                              &#9660;
                            </button>
                          </form>
                        </div>
                      </td>
                      <td>{li.lineNumber}</td>
                      <td>{li.room ?? <span className="muted">--</span>}</td>
                      <td>{FAMILY_LABELS[li.familySlug] ?? li.familySlug}</td>
                      <td className="muted" style={{ fontSize: 13 }}>
                        {describeLineItemAttrs(li.familySlug, attrs)}
                      </td>
                      <td>
                        {overridden && li.calculatedPrice !== null && (
                          <span className="muted" style={{ textDecoration: "line-through", marginRight: 6 }}>
                            ${Number(li.calculatedPrice).toFixed(2)}
                          </span>
                        )}
                        {formatLineItemPrice(li, overridden)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "nowrap",
                            justifyContent: "flex-end",
                            alignItems: "flex-start",
                            gap: 8,
                          }}
                        >
                          <Link
                            href={`/quotes/${quoteId}/line-items/${li.id}/edit`}
                            className="btn secondary"
                            style={lineItemActionStyle}
                          >
                            Edit
                          </Link>
                          <DuplicateLineItemForm quoteId={quoteId} lineItemId={li.id} fields={getLineItemFields(li.familySlug)} />
                          <PriceOverrideForm
                            quoteId={quoteId}
                            lineItemId={li.id}
                            priceOverride={li.priceOverride}
                            priceOverrideReason={li.priceOverrideReason}
                          />
                          <form action={deleteLineItem.bind(null, quoteId, li.id)}>
                            <button className="btn danger" type="submit" style={lineItemActionStyle}>
                              Remove
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="total-row">
            <span>Total{incompleteCount > 0 ? " (excl. unpriced)" : ""}</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </>
  );
}
