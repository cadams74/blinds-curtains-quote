"use client";

import { useEffect, useState, useTransition } from "react";
import { setPriceOverride } from "@/lib/actions";

// The Override control on a quote's line items (quotes/[id]/page.tsx). Owns
// its own <details>/<summary> disclosure (rather than the page wrapping a
// plain form in one) specifically so it can close itself again after a
// successful save -- a bare <details> is uncontrolled, so once Clive opened
// it, it stayed open through every re-render (including the one right after
// Save) until he manually collapsed it himself. `open` is now real React
// state, flipped back to false only once setPriceOverride has actually
// finished without throwing.
//
// This also used to be bound directly to the server action from a Server
// Component, with no client-side validation at all. setPriceOverride
// deliberately throws when an override price is entered without a reason
// (a reason is the audit trail for a manual override) -- fine in local dev,
// where Next shows that message verbatim, but in a production build
// (Vercel, i.e. what Clive actually uses) Next redacts every Server Action
// error's real message before it reaches the client, replacing it with a
// generic "An error occurred in the Server Components render" + digest.
// That's what made the missing-reason case look like a bare crash with no
// way back to the quote screen -- confirmed live against a production
// build, not assumed. `needsReason` reruns setPriceOverride's exact rule
// ("a reason is required only when actually setting a non-blank override
// price, not when clearing one") client-side, the same pattern
// MiscLineItemForm already uses for its own validation, so Save is disabled
// and an inline hint shown before the server action -- and the production
// redaction that mangles its message -- is ever reached.
const summaryButtonStyle = { fontSize: 13, padding: "4px 10px", listStyle: "none" } as const;

interface Props {
  quoteId: number;
  lineItemId: number;
  priceOverride: string | null;
  priceOverrideReason: string | null;
}

export function PriceOverrideForm({ quoteId, lineItemId, priceOverride, priceOverrideReason }: Props) {
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState(priceOverride ?? "");
  const [reason, setReason] = useState(priceOverrideReason ?? "");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  // Keep the fields in sync with the current saved values whenever they
  // change from outside (a fresh save, another tab) while the disclosure
  // is closed -- so reopening it always starts from what's actually saved,
  // not a stale value left over from before.
  useEffect(() => {
    if (!open) {
      setOverride(priceOverride ?? "");
      setReason(priceOverrideReason ?? "");
    }
  }, [open, priceOverride, priceOverrideReason]);

  const needsReason = override.trim() !== "" && reason.trim() === "";

  function handleSubmit(formData: FormData) {
    setSubmitError(null);
    startSubmit(async () => {
      try {
        await setPriceOverride(quoteId, lineItemId, formData);
        setOpen(false);
      } catch {
        setSubmitError("Couldn't save that override -- please try again.");
      }
    });
  }

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="btn secondary" style={summaryButtonStyle}>
        Override
      </summary>
      <form action={handleSubmit} style={{ marginTop: 8, minWidth: 220, textAlign: "left" }}>
        <div className="field">
          <label>Override price ($)</label>
          <input
            name="priceOverride"
            type="number"
            step="0.01"
            value={override}
            onChange={(e) => setOverride(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Reason</label>
          <input name="priceOverrideReason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {needsReason && (
          <p className="muted" style={{ marginTop: 0, marginBottom: 8, fontSize: 13 }}>
            A reason is required to override the price.
          </p>
        )}
        {submitError && (
          <p className="error" style={{ marginTop: 0, marginBottom: 8, fontSize: 13 }}>
            {submitError}
          </p>
        )}
        <button
          className="btn secondary"
          type="submit"
          disabled={isSubmitting || needsReason}
          style={{ fontSize: 13 }}
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
      </form>
    </details>
  );
}
