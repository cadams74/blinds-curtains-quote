"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createQuote } from "@/lib/actions";
import type { ActionState } from "@/lib/actionState";

const initialState: ActionState = { error: null, successAt: null };

/**
 * New-quote form, in two shapes. Arriving from a customer's own page
 * (presetCustomer set, via /quotes/new?customerId=) skips the picker
 * entirely -- just a confirmation and a Create button, as close to
 * "directly from there" as a quote-creation flow that still needs a quote
 * number generated server-side can get. Arriving from the dashboard's
 * plain "New quote" button (presetCustomer null) shows the full picker:
 * an existing customer, or a one-off typed name for a quick quote that
 * doesn't need a saved Customers record.
 *
 * useActionState-driven like the rest of this app's forms -- see
 * createQuote's comment in actions.ts.
 */
export function NewQuoteForm({
  customers,
  presetCustomer,
}: {
  customers: { id: number; name: string }[];
  presetCustomer: { id: number; name: string } | null;
}) {
  const [selection, setSelection] = useState("");
  const [state, formAction, isPending] = useActionState(createQuote, initialState);

  if (presetCustomer) {
    return (
      <form action={formAction}>
        <input type="hidden" name="customerId" value={presetCustomer.id} />
        <p style={{ marginTop: 0 }}>
          Creating a new quote for <strong>{presetCustomer.name}</strong>.
        </p>
        {state.error && <p className="error">{state.error}</p>}
        <button className="btn" type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create quote"}
        </button>
      </form>
    );
  }

  return (
    <form action={formAction}>
      <div className="field">
        <label htmlFor="customerId">Customer</label>
        <select
          id="customerId"
          name="customerId"
          required
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
        >
          <option value="" disabled>
            Select a customer...
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="manual">One-off (not in Customers list)</option>
        </select>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Don&apos;t see them? <Link href="/customers/new">Add a new customer</Link> first.
        </p>
      </div>
      {selection === "manual" && (
        <div className="field">
          <label htmlFor="customerName">Customer name</label>
          <input id="customerName" name="customerName" required autoFocus />
        </div>
      )}
      {state.error && <p className="error">{state.error}</p>}
      <button className="btn" type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create quote"}
      </button>
    </form>
  );
}
