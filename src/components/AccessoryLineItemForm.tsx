"use client";

import { useMemo, useState, useTransition } from "react";
import { addAccessoryLineItem, updateAccessoryLineItem } from "@/lib/actions";
import { priceAccessory, type AccessoryOption } from "@/pricing/accessory";

// Shared by both Curtain Accessory and Blind Accessory (see
// accessoryFamilies.ts) -- Clive asked for these "in a similar way to
// Miscellaneous items", so this mirrors MiscLineItemForm's own shape
// (client-side preview computed by a pure pricing function, useTransition +
// try/catch around the server action so a validation failure shows inline
// instead of round-tripping to a production build's redacted error page --
// see PriceOverrideForm.tsx for why that matters), just with a single
// dropdown instead of free-text description/price fields: unlike Misc,
// which is genuinely unstructured manual entry, an Accessory's name and
// price both come straight from the source workbook's own fixed catalog
// (`catalog`, passed down already loaded -- see accessoryFamilies.ts), so
// there's nothing to type, only to pick.
export interface AccessoryLineItemInitial {
  room: string;
  name: string;
}

interface Props {
  quoteId: number;
  familySlug: "curtain_accessory" | "blind_accessory";
  label: string; // "Curtain Accessory" / "Blind Accessory"
  catalog: AccessoryOption[];
  // When set, the form edits this existing line item (via
  // updateAccessoryLineItem) instead of creating a new one -- see
  // /quotes/[id]/line-items/[lineItemId]/edit/page.tsx.
  lineItemId?: number;
  initial?: AccessoryLineItemInitial;
}

export function AccessoryLineItemForm({ quoteId, familySlug, label, catalog, lineItemId, initial }: Props) {
  const isEdit = lineItemId !== undefined;
  const [room, setRoom] = useState(initial?.room ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  // priceAccessory() is a pure, synchronous catalog lookup -- the catalog
  // itself was already fetched once, at page load, so no server round trip
  // is needed to preview it, same as priceMisc().
  const preview = useMemo(() => priceAccessory({ name }, catalog), [name, catalog]);

  function handleSubmit(formData: FormData) {
    setSubmitError(null);
    startSubmit(async () => {
      try {
        if (isEdit) {
          await updateAccessoryLineItem(quoteId, lineItemId, familySlug, formData);
        } else {
          await addAccessoryLineItem(quoteId, familySlug, formData);
        }
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
        <label htmlFor="name">{label}</label>
        <select id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required>
          <option value="">-- select --</option>
          {catalog.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      {name && (
        <div className="price-preview">
          {preview.ok ? (
            <div className="total-row" style={{ fontSize: 16, borderTop: "none", marginTop: 0, paddingTop: 0 }}>
              <span>Price</span>
              <span>${preview.breakdown.calculatedPrice.toFixed(2)}</span>
            </div>
          ) : (
            <p className="error" style={{ margin: 0 }}>
              Pick a {label.toLowerCase()} from the list.
            </p>
          )}
        </div>
      )}

      {submitError && <p className="error">{submitError}</p>}

      <button className="btn" type="submit" disabled={isSubmitting || !preview.ok}>
        {isSubmitting ? "Saving..." : isEdit ? "Save changes" : "Add line item"}
      </button>
    </form>
  );
}
