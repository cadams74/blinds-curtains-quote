"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteLineItem, moveLineItem } from "@/lib/actions";
import { getLineItemFields } from "@/lib/lineItemFields";
import { DuplicateLineItemForm } from "@/components/DuplicateLineItemForm";
import { MoveToPositionForm } from "@/components/MoveToPositionForm";
import { PriceOverrideForm } from "@/components/PriceOverrideForm";

// The quote page's line-item table -- a client component (not the quote
// page itself, which stays a Server Component that just fetches and hands
// this its data) specifically so a set of ticked row checkboxes can be
// shared client-side state across rows, feeding the "duplicate several
// selected lines together" bar above the table. Everything that used to
// be inline in quotes/[id]/page.tsx (the incomplete-pricing banner, the
// table itself, the total row) moved here as one unit since they all read
// the same lineItems/total/incompleteCount.

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
// isn't part of this row -- see moveButtonStyle below.
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

export interface LineItemRow {
  id: number;
  lineNumber: number;
  room: string | null;
  familySlug: string;
  attributes: unknown;
  priceBreakdown: unknown;
  calculatedPrice: string | null;
  priceOverride: string | null;
  priceOverrideReason: string | null;
  finalPrice: string | null;
}

interface Props {
  quoteId: number;
  lineItems: LineItemRow[];
}

export function LineItemsTable({ quoteId, lineItems }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const total = lineItems.reduce((sum, li) => sum + (li.finalPrice !== null ? Number(li.finalPrice) : 0), 0);
  const incompleteCount = lineItems.filter((li) => li.finalPrice === null).length;

  const selectedItems = lineItems.filter((li) => selected.has(li.id));
  const selectedFamilies = Array.from(new Set(selectedItems.map((li) => li.familySlug)));
  const mixedFamilies = selectedFamilies.length > 1;

  function toggleSelected(id: number, checked: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <>
      {incompleteCount > 0 && (
        <p className="error" style={{ marginBottom: 12 }}>
          {incompleteCount} line item{incompleteCount === 1 ? "" : "s"} still need{incompleteCount === 1 ? "s" : ""}{" "}
          pricing -- open Edit on each to fill in the missing fields. The total below doesn&apos;t include them.
        </p>
      )}

      {selected.size > 0 && (
        <div
          className="card"
          style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}
        >
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {selected.size} line item{selected.size === 1 ? "" : "s"} selected
              </span>
            </div>
            {selected.size === 1 ? (
              (() => {
                const only = selectedItems[0];
                const currentPosition = lineItems.findIndex((li) => li.id === only.id) + 1;
                return (
                  <MoveToPositionForm
                    key={only.id}
                    quoteId={quoteId}
                    lineItemId={only.id}
                    currentPosition={currentPosition}
                    totalCount={lineItems.length}
                    onSuccess={() => setSelected(new Set())}
                  />
                );
              })()
            ) : mixedFamilies ? (
              <p className="error" style={{ margin: 0, fontSize: 13 }}>
                Select line items of the same type to duplicate them together (currently mixed:{" "}
                {selectedFamilies.map((f) => FAMILY_LABELS[f] ?? f).join(", ")}) -- their fields differ by type.
              </p>
            ) : (
              <DuplicateLineItemForm
                key={selectedFamilies[0]}
                quoteId={quoteId}
                lineItemIds={Array.from(selected)}
                fields={getLineItemFields(selectedFamilies[0])}
                anchor="bar"
                triggerLabel={`Duplicate selected (${selected.size})`}
                onSuccess={() => setSelected(new Set())}
              />
            )}
          </div>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: "2px 8px", flexShrink: 0 }}
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="card">
        {lineItems.length === 0 ? (
          <p className="muted">No line items yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
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
                    <td style={{ padding: 0, width: 1, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selected.has(li.id)}
                        onChange={(e) => toggleSelected(li.id, e.target.checked)}
                        aria-label={`Select line ${li.lineNumber}`}
                        style={{ width: "auto", margin: 0 }}
                      />
                    </td>
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
                        <DuplicateLineItemForm
                          quoteId={quoteId}
                          lineItemId={li.id}
                          fields={getLineItemFields(li.familySlug)}
                          anchor="row"
                        />
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
    </>
  );
}
