"use client";

import { useState, useTransition } from "react";
import { moveLineItemToPosition } from "@/lib/actions";

// The bulk-selection toolbar's "move to position" control (LineItemsTable.tsx)
// -- only shown when exactly one line item is selected, per Clive's request,
// as a faster alternative to clicking the per-row up/down arrows repeatedly.
// Unlike DuplicateLineItemForm's actions, moveLineItemToPosition doesn't
// redirect (same as the existing moveLineItem up/down action it's modeled
// on) -- it just revalidates the quote page in place, so a normal
// await/catch is enough; there's no NEXT_REDIRECT to special-case.
interface Props {
  quoteId: number;
  lineItemId: number;
  currentPosition: number; // 1-based
  totalCount: number;
  onSuccess?: () => void;
}

export function MoveToPositionForm({ quoteId, lineItemId, currentPosition, totalCount, onSuccess }: Props) {
  const [position, setPosition] = useState(String(currentPosition));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  function handleSubmit(formData: FormData) {
    setSubmitError(null);
    startSubmit(async () => {
      try {
        await moveLineItemToPosition(quoteId, lineItemId, formData);
        onSuccess?.();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Couldn't move the line item -- please try again.");
      }
    });
  }

  return (
    <form action={handleSubmit} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <label htmlFor={`move-to-position-${lineItemId}`} style={{ fontSize: 13, fontWeight: 400, color: "inherit" }}>
        Move to position
      </label>
      <input
        id={`move-to-position-${lineItemId}`}
        name="position"
        type="number"
        min={1}
        max={totalCount}
        value={position}
        onChange={(e) => setPosition(e.target.value)}
        style={{ width: 64 }}
      />
      <button className="btn secondary" type="submit" disabled={isSubmitting} style={{ fontSize: 13, padding: "4px 10px" }}>
        {isSubmitting ? "Moving..." : "Move"}
      </button>
      {submitError && (
        <p className="error" style={{ margin: 0, fontSize: 13, width: "100%" }}>
          {submitError}
        </p>
      )}
    </form>
  );
}
