import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { deleteLineItem, duplicateLineItem, setPriceOverride } from "@/lib/actions";
import { GENERIC_BLIND_FAMILIES } from "@/lib/blindFamilies";

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
};

function describeLineItemAttrs(familySlug: string, attrs: Record<string, unknown>): string {
  if (familySlug === "misc") {
    return String(attrs.description ?? "");
  }
  if (familySlug === "s_wave_sheer") {
    const parts = [
      attrs.style ? String(attrs.style) : null,
      attrs.heightCm ? `${attrs.heightCm}cm high` : null,
      attrs.fabricName ? String(attrs.fabricName) : null,
    ].filter(Boolean);
    return parts.join(" -- ");
  }
  // Roller + the five genericBlind.ts families all share this attribute shape.
  const parts = [
    attrs.widthMm && attrs.heightMm ? `${attrs.widthMm}mm x ${attrs.heightMm}mm` : null,
    attrs.fabricName ? String(attrs.fabricName) : null,
  ].filter(Boolean);
  return parts.join(" -- ");
}

// Shared sizing for every per-line-item action control (Edit, Duplicate,
// Override, Remove) so they read as one uniform row of buttons -- Override
// used to be a bare "muted" text toggle rather than a button, the one
// visibly inconsistent one; Remove keeps its "btn danger" red, everything
// else uses "btn secondary" with this same size.
const lineItemActionStyle = { fontSize: 13, padding: "4px 10px" } as const;

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

  const total = lineItems.reduce((sum, li) => sum + Number(li.finalPrice), 0);

  return (
    <>
      <Topbar />
      <div className="page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>
              {quote.quoteNumber} <span className="badge">{quote.status}</span>
            </h1>
            <p className="muted">{quote.customerName}</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <a className="btn secondary" href={`/quotes/${quoteId}/pdf`} target="_blank" rel="noreferrer">
              Download PDF
            </a>
            <details style={{ position: "relative" }}>
              <summary className="btn" style={{ cursor: "pointer", listStyle: "none" }}>
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
                <Link href={`/quotes/${quoteId}/line-items/new/curtain`}>Curtain (S Wave Sheer)</Link>
                <Link href={`/quotes/${quoteId}/line-items/new/misc`}>Misc Quote item</Link>
              </div>
            </details>
          </div>
        </div>

        <div className="card">
          {lineItems.length === 0 ? (
            <p className="muted">No line items yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Room</th>
                  <th>Product</th>
                  <th>Details</th>
                  <th>Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li) => {
                  const attrs = li.attributes as Record<string, unknown>;
                  const overridden = li.priceOverride !== null;
                  return (
                    <tr key={li.id}>
                      <td>{li.lineNumber}</td>
                      <td>{li.room ?? <span className="muted">--</span>}</td>
                      <td>{FAMILY_LABELS[li.familySlug] ?? li.familySlug}</td>
                      <td className="muted" style={{ fontSize: 13 }}>
                        {describeLineItemAttrs(li.familySlug, attrs)}
                      </td>
                      <td>
                        {overridden && (
                          <span className="muted" style={{ textDecoration: "line-through", marginRight: 6 }}>
                            ${Number(li.calculatedPrice).toFixed(2)}
                          </span>
                        )}
                        {li.familySlug === "misc" &&
                        !overridden &&
                        (li.priceBreakdown as { priceKind?: string })?.priceKind === "no_charge"
                          ? "N/C" // deliberately not "$0.00" -- see misc.ts
                          : `$${Number(li.finalPrice).toFixed(2)}`}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link
                          href={`/quotes/${quoteId}/line-items/${li.id}/edit`}
                          className="btn secondary"
                          style={{ ...lineItemActionStyle, marginRight: 8 }}
                        >
                          Edit
                        </Link>
                        <form
                          action={duplicateLineItem.bind(null, quoteId, li.id)}
                          style={{ display: "inline-block", marginRight: 8 }}
                        >
                          <button className="btn secondary" type="submit" style={lineItemActionStyle}>
                            Duplicate
                          </button>
                        </form>
                        <details style={{ display: "inline-block", marginRight: 8 }}>
                          <summary
                            className="btn secondary"
                            style={{ ...lineItemActionStyle, listStyle: "none" }}
                          >
                            Override
                          </summary>
                          <form
                            action={setPriceOverride.bind(null, quoteId, li.id)}
                            style={{ marginTop: 8, minWidth: 220 }}
                          >
                            <div className="field">
                              <label>Override price ($)</label>
                              <input
                                name="priceOverride"
                                type="number"
                                step="0.01"
                                defaultValue={li.priceOverride ?? ""}
                              />
                            </div>
                            <div className="field">
                              <label>Reason</label>
                              <input
                                name="priceOverrideReason"
                                defaultValue={li.priceOverrideReason ?? ""}
                              />
                            </div>
                            <button className="btn secondary" type="submit" style={{ fontSize: 13 }}>
                              Save
                            </button>
                          </form>
                        </details>
                        <form action={deleteLineItem.bind(null, quoteId, li.id)} style={{ display: "inline" }}>
                          <button className="btn danger" type="submit" style={lineItemActionStyle}>
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="total-row">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </>
  );
}
