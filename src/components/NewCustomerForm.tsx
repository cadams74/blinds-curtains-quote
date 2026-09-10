"use client";

import { useActionState } from "react";
import { createCustomer } from "@/lib/customerActions";
import type { ActionState } from "@/lib/actionState";
import { CustomerFieldset } from "./CustomerFieldset";

const initialState: ActionState = { error: null, successAt: null };

/**
 * useActionState-driven like the rest of this app's forms (see
 * customerActions.ts's comment on createCustomer) -- redirects to the new
 * customer's page on success, or re-renders with state.error on a
 * validation failure.
 */
export function NewCustomerForm() {
  const [state, formAction, isPending] = useActionState(createCustomer, initialState);

  return (
    <form action={formAction}>
      <CustomerFieldset />
      {state.error && <p className="error">{state.error}</p>}
      <button className="btn" type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create customer"}
      </button>
    </form>
  );
}
