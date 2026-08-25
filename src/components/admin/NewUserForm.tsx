"use client";

import { useActionState, useEffect, useRef } from "react";
import { createUser, type ActionState } from "@/lib/adminActions";

const initialState: ActionState = { error: null, successAt: null };

/** Client component so useActionState can hand the real validation message
 * back from createUser -- see that function's comment in adminActions.ts
 * for why a plain thrown error wouldn't reach the screen in production. */
export function NewUserForm() {
  const [state, formAction, isPending] = useActionState(createUser, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the form after a successful create -- otherwise the just-used
  // email/password would sit in the fields looking like they're still
  // pending, even though the new row already appeared in the table below.
  useEffect(() => {
    if (state.successAt) formRef.current?.reset();
  }, [state.successAt]);

  return (
    <form ref={formRef} action={formAction}>
      <div className="field-row">
        <div className="field">
          <label htmlFor="new-email">Email</label>
          <input id="new-email" name="email" type="email" required />
        </div>
        <div className="field">
          <label htmlFor="new-name">Name</label>
          <input id="new-name" name="name" required />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="new-password">Password</label>
          <input id="new-password" name="password" type="password" required minLength={8} />
        </div>
        <div className="field">
          <label htmlFor="new-role">Role</label>
          <select id="new-role" name="role" defaultValue="estimator">
            <option value="estimator">Estimator</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      {state.error && <p className="error">{state.error}</p>}
      <button className="btn" type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create login"}
      </button>
    </form>
  );
}
