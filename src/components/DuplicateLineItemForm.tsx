"use client";

import { useState, useTransition } from "react";
import { duplicateLineItemWithOptions, duplicateLineItemsWithOptions } from "@/lib/actions";

// The redesigned Duplicate control on a quote's line items (quotes/[id]/page.tsx
// via LineItemsTable.tsx), replacing the old one-click "copy everything"
// button. Clive's ask: a checklist of the line item's fields (all selected
// by default, with a deselect-all option), plus an N-count to create
// several duplicates in one go -- built to emulate the drag-down/
// copy-quickly workflow the main spreadsheet user relies on in Excel.
//
// Handles both the single-line-item case (a "Duplicate" button on one row,
// pass `lineItemId`) and the multi-select case (a "Duplicate selected"
// button in LineItemsTable's selection bar once one or more checkboxes are
// ticked, pass `lineItemIds`) -- exactly one of the two must be given. Same
// field checklist, same count input, same two-mode server behaviour either
// way (see actions.ts's shared buildDuplicateRows), so it's one component
// rather than two near-identical copies that could drift apart.
//
// Owns its own <details> disclosure, same pattern as PriceOverrideForm.tsx,
// so it can collapse itself again after a successful submit rather than
// staying open through the following re-render.
//
// Both duplicateLineItemWithOptions and duplicateLineItemsWithOptions
// always redirect back to the quote page on success (same as every other
// add-line-item action), which means the awaited call never resolves
// normally -- it always throws Next's internal NEXT_REDIRECT signal.
// That's not a bug to work around with try/catch suppression only (as
// MiscLineItemForm does, since it has no local state to reset); here the
// NEXT_REDIRECT branch IS the success path, so the panel is explicitly
// collapsed there, and `onSuccess` (used by the bulk case to clear the
// LineItemsTable's selection) is called there too.
const summaryButtonStyle = { fontSize: 13, padding: "4px 10px", listStyle: "none" } as const;

interface Props {
  quoteId: number;
  fields: { key: string; label: string }[];
  // Exactly one of these two -- lineItemId for the per-row control,
  // lineItemIds for the multi-select bulk control.
  lineItemId?: number;
  lineItemIds?: number[];
  // The per-row control anchors its panel under the row's right-aligned
  // action buttons (position: absolute, the table's own overflow makes
  // static flow awkward there); the bulk control sits in its own
  // full-width selection bar above the table, where a normal static panel
  // reads better and doesn't risk overlapping the table underneath it.
  anchor?: "row" | "bar";
  triggerLabel?: string;
  onSuccess?: () => void;
}

export function DuplicateLineItemForm({
  quoteId,
  fields,
  lineItemId,
  lineItemIds,
  anchor = "row",
  triggerLabel = "Duplicate",
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, true]))
  );
  const [count, setCount] = useState("1");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const allChecked = fields.every((f) => selected[f.key]);
  const panelId = lineItemId !== undefined ? String(lineItemId) : (lineItemIds ?? []).join("-") || "bulk";

  function toggleAll() {
    setSelected(Object.fromEntries(fields.map((f) => [f.key, !allChecked])));
  }

  function handleSubmit(formData: FormData) {
    setSubmitError(null);
    startSubmit(async () => {
      try {
        if (lineItemIds) {
          await duplicateLineItemsWithOptions(quoteId, lineItemIds, formData);
        } else if (lineItemId !== undefined) {
          await duplicateLineItemWithOptions(quoteId, lineItemId, formData);
        } else {
          throw new Error("No line item(s) to duplicate.");
        }
      } catch (err) {
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          setOpen(false);
          onSuccess?.();
          return;
        }
        setSubmitError(err instanceof Error ? err.message : "Couldn't create the duplicate -- please try again.");
      }
    });
  }

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="btn secondary" style={summaryButtonStyle}>
        {triggerLabel}
      </summary>
      <form
        action={handleSubmit}
        className="card"
        style={
          anchor === "row"
            ? { position: "absolute", marginTop: 4, minWidth: 240, zIndex: 1, textAlign: "left" }
            : { marginTop: 8, maxWidth: 320, textAlign: "left" }
        }
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Fields to copy</span>
          <button type="button" className="btn secondary" style={{ fontSize: 12, padding: "2px 8px" }} onClick={toggleAll}>
            {allChecked ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 8 }}>
          {fields.map((f) => (
            <label
              key={f.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 400,
                color: "inherit",
                padding: "3px 0",
                whiteSpace: "nowrap",
              }}
            >
              <input
                type="checkbox"
                name={`field_${f.key}`}
                checked={selected[f.key] ?? false}
                onChange={(e) => setSelected((s) => ({ ...s, [f.key]: e.target.checked }))}
                style={{ width: "auto", flexShrink: 0, margin: 0 }}
              />
              <span>{f.label}</span>
            </label>
          ))}
        </div>

        {!allChecked && (
          <p className="muted" style={{ marginTop: 0, marginBottom: 8, fontSize: 12 }}>
            Any unchecked field is left blank on the duplicate(s), including price -- it's genuinely blank until
            you fill in the missing details via Edit, not recalculated from a guess.
          </p>
        )}

        <div className="field" style={{ marginBottom: 8 }}>
          <label htmlFor={`count-${panelId}`} style={{ fontSize: 13 }}>
            Number of duplicates {lineItemIds && lineItemIds.length > 1 ? "of each selected line" : ""}
          </label>
          <input
            id={`count-${panelId}`}
            name="count"
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            style={{ maxWidth: 80 }}
          />
        </div>

        {submitError && (
          <p className="error" style={{ marginTop: 0, marginBottom: 8, fontSize: 13 }}>
            {submitError}
          </p>
        )}

        <button className="btn secondary" type="submit" disabled={isSubmitting} style={{ fontSize: 13 }}>
          {isSubmitting ? "Creating..." : "Create duplicate(s)"}
        </button>
      </form>
    </details>
  );
}
