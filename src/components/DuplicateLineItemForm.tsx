"use client";

import { useState, useTransition } from "react";
import { duplicateLineItemWithOptions } from "@/lib/actions";

// The redesigned Duplicate control on a quote's line items (quotes/[id]/page.tsx),
// replacing the old one-click "copy everything" button. Clive's ask: a
// checklist of the line item's fields (all selected by default, with a
// deselect-all option), plus an N-count to create several duplicates in one
// go -- built to emulate the drag-down/copy-quickly workflow the main
// spreadsheet user relies on in Excel.
//
// Owns its own <details> disclosure, same pattern as PriceOverrideForm.tsx,
// so it can collapse itself again after a successful submit rather than
// staying open through the following re-render.
//
// duplicateLineItemWithOptions always redirects back to the quote page on
// success (same as every other add-line-item action), which means the
// awaited call never resolves normally -- it always throws Next's internal
// NEXT_REDIRECT signal. That's not a bug to work around with try/catch
// suppression only (as MiscLineItemForm does, since it has no local state
// to reset); here the NEXT_REDIRECT branch IS the success path, so the
// panel is explicitly collapsed there.
const summaryButtonStyle = { fontSize: 13, padding: "4px 10px", listStyle: "none" } as const;

interface Props {
  quoteId: number;
  lineItemId: number;
  fields: { key: string; label: string }[];
}

export function DuplicateLineItemForm({ quoteId, lineItemId, fields }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, true]))
  );
  const [count, setCount] = useState("1");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const allChecked = fields.every((f) => selected[f.key]);

  function toggleAll() {
    setSelected(Object.fromEntries(fields.map((f) => [f.key, !allChecked])));
  }

  function handleSubmit(formData: FormData) {
    setSubmitError(null);
    startSubmit(async () => {
      try {
        await duplicateLineItemWithOptions(quoteId, lineItemId, formData);
      } catch (err) {
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          setOpen(false);
          return;
        }
        setSubmitError(err instanceof Error ? err.message : "Couldn't create the duplicate -- please try again.");
      }
    });
  }

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="btn secondary" style={summaryButtonStyle}>
        Duplicate
      </summary>
      <form
        action={handleSubmit}
        className="card"
        style={{
          position: "absolute",
          marginTop: 4,
          minWidth: 240,
          zIndex: 1,
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Fields to copy</span>
          <button type="button" className="btn secondary" style={{ fontSize: 12, padding: "2px 8px" }} onClick={toggleAll}>
            {allChecked ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 8 }}>
          {fields.map((f) => (
            <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "2px 0" }}>
              <input
                type="checkbox"
                name={`field_${f.key}`}
                checked={selected[f.key] ?? false}
                onChange={(e) => setSelected((s) => ({ ...s, [f.key]: e.target.checked }))}
              />
              {f.label}
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
          <label htmlFor={`count-${lineItemId}`} style={{ fontSize: 13 }}>
            Number of duplicates
          </label>
          <input
            id={`count-${lineItemId}`}
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
