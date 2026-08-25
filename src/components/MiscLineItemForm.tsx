"use client";

import { useMemo, useState, useTransition } from "react";
import { addMiscLineItem } from "@/lib/actions";
import { priceMisc } from "@/pricing/misc";

interface Props {
  quoteId: number;
}

const PRICE_KIND_LABELS: Record<string, string> = {
  amount: "Priced item",
  no_charge: 'No charge ("N/C" -- prints as "N/C", not "$0.00")',
  note_only: "Note only -- no price line",
};

export function MiscLineItemForm({ quoteId }: Props) {
  const [room, setRoom] = useState("");
  const [description, setDescription] = useState("");
  const [additionalDetails, setAdditionalDetails] = useState("");
  const [price, setPrice] = useState("");
  const [installTimeMinutes, setInstallTimeMinutes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  // priceMisc() is a pure, synchronous normalizer with no DB dependency --
  // no server round trip needed to preview it, unlike the blind/curtain
  // families' pricing engines.
  const preview = useMemo(
    () =>
      priceMisc({
        description,
        price: price.trim() === "" ? undefined : Number.isNaN(Number(price)) ? price : Number(price),
        installTimeMinutes: installTimeMinutes ? Number(installTimeMinutes) : undefined,
      }),
    [description, price, installTimeMinutes]
  );

  function handleSubmit(formData: FormData) {
    setSubmitError(null);
    startSubmit(async () => {
      try {
        await addMiscLineItem(quoteId, formData);
      } catch (err) {
        if (err instanceof Error && err.message !== "NEXT_REDIRECT") {
          setSubmitError(err.message);
        }
      }
    });
  }

  return (
    <form action={handleSubmit}>
      <div className="field">
        <label htmlFor="room">Room</label>
        <input id="room" name="room" value={room} onChange={(e) => setRoom(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <input
          id="description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="additionalDetails">Additional details</label>
        <input
          id="additionalDetails"
          name="additionalDetails"
          value={additionalDetails}
          onChange={(e) => setAdditionalDetails(e.target.value)}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="price">Price</label>
          <input
            id="price"
            name="price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder='A number, "N/C", or leave blank for a note-only line'
          />
        </div>
        <div className="field">
          <label htmlFor="installTimeMinutes">Install time (minutes)</label>
          <input
            id="installTimeMinutes"
            name="installTimeMinutes"
            type="number"
            value={installTimeMinutes}
            onChange={(e) => setInstallTimeMinutes(e.target.value)}
          />
        </div>
      </div>

      {description && (
        <div className="price-preview">
          {preview.ok ? (
            <>
              <div className="total-row" style={{ fontSize: 16, borderTop: "none", marginTop: 0, paddingTop: 0 }}>
                <span>Price</span>
                <span>{preview.breakdown.priceKind === "amount" ? `$${preview.breakdown.calculatedPrice.toFixed(2)}` : "N/C"}</span>
              </div>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                {PRICE_KIND_LABELS[preview.breakdown.priceKind]}
              </p>
            </>
          ) : (
            <p className="error" style={{ margin: 0 }}>
              {preview.reason === "missing_description"
                ? "A description is required."
                : 'Price must be a number, "N/C", or left blank -- that text isn\'t recognized.'}
            </p>
          )}
        </div>
      )}

      {submitError && <p className="error">{submitError}</p>}

      <button className="btn" type="submit" disabled={isSubmitting || !preview.ok}>
        {isSubmitting ? "Saving..." : "Add line item"}
      </button>
    </form>
  );
}
