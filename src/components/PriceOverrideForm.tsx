"use client";

import { useState, useTransition } from "react";
import { setPriceOverride } from "@/lib/actions";

// The Override accordion on the quote page (quotes/[id]/page.tsx) used to
// bind setPriceOverride directly as the <form>'s action, with no client-
// side validation at all. setPriceOverride throws a plain Error when an
// override price is entered without a reason (a deliberate rule -- a
// manual override needs an audit trail) -- fine in local dev, where Next
// shows that message verbatim, but in a production build (Vercel, i.e.
// what Clive actually uses) Next redacts every Server Action error's real
// message before it reaches the client, replacing it with a generic
// "An error occurred in the Server Components render" + digest. That's
// what made the missing-reason case look like a bare crash with no way
// back to the quote screen -- confirmed live against a production build,
// not assumed.
//
// The fix mirrors MiscLineItemForm's own approach to this same class of
// problem: MiscLineItemForm computes its validation client-side (its
// `preview` via priceMisc()) and disables Submit until it passes, so its
// own server-side throw is unreachable in normal use -- just defense in
// depth. Same idea here: `needsReason` reruns setPriceOverride's exact
// rule ("a reason is required only when actually setting a non-blank
// override price, not when clearing one") client-side, so Save is
// disabled and an inline hint shown *before* the server action ever runs,
// rather than round-tripping to the server and hitting the production
// redaction. The try/catch stays as a defense-in-depth fallback for any
// other, genuinely unexpected failure (e.g. the line item having been
// removed by someone else in the meantime).
interface Props {
  quoteId: number;
  lineItemId: number;
  priceOverride: string | null;
  priceOverrideReason: string | null;
}

export function PriceOverrideForm({ quoteId, lineItemId, priceOverride, priceOverrideReason }: Props) {
  const [override, setOverride] = useState(priceOverride ?? "");
  const [reason, setReason] = useState(priceOverrideReason ?? "");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const needsReason = override.trim() !== "" && reason.trim() === "";

  function handleSubmit(formData: FormData) {
    setSubmitError(null);
    startSubmit(async () => {
      try {
        await setPriceOverride(quoteId, lineItemId, formData);
      } catch {
        setSubmitError("Couldn't save that override -- please try again.");
      }
    });
  }

  return (
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
  );
}
