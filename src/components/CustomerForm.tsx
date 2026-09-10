"use client";

import { useActionState } from "react";
import { updateCustomer } from "@/lib/customerActions";
import type { ActionState } from "@/lib/actionState";
import { CustomerFieldset, type CustomerFormValues } from "./CustomerFieldset";

const initialState: ActionState = { error: null, successAt: null };

/**
 * Editing an existing customer stays on customers/[id] (no redirect), so
 * it's unaffected by the routing quirk documented on NewCustomerForm.tsx
 * -- confirmed separately, not assumed just because it looks similar.
 * Client component so useActionState can surface a real validation
 * message instead of Next's generic production-redacted crash screen.
 */
export function EditCustomerForm({ customer }: { customer: CustomerFormValues }) {
  const boundUpdate = updateCustomer.bind(null, customer.id);
  const [state, formAction, isPending] = useActionState(boundUpdate, initialState);

  return (
    <form action={formAction}>
      <CustomerFieldset customer={customer} />
      {state.error && <p className="error">{state.error}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn" type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save changes"}
        </button>
        {state.successAt && !state.error && <span className="muted">Saved.</span>}
      </div>
    </form>
  );
}

export type { CustomerFormValues };
