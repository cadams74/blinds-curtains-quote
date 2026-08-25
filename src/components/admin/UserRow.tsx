"use client";

import { Fragment, useActionState } from "react";
import * as schema from "@/db/schema";
import { updateUser, type ActionState } from "@/lib/adminActions";

const initialState: ActionState = { error: null, successAt: null };

/** One row of the Staff Logins table, as its own client component (rather
 * than a plain <tr> in the server-rendered table like the other admin
 * pages' rows) so useActionState can surface updateUser's real validation
 * message -- see that function's comment in adminActions.ts. Every field
 * lives inside this row's own <form> now instead of the out-of-table
 * form="" pattern used elsewhere, since useActionState needs the <form>
 * and its action wired together directly. */
export function UserRow({
  user,
  isSelf,
}: {
  user: typeof schema.users.$inferSelect;
  isSelf: boolean;
}) {
  const boundUpdateUser = updateUser.bind(null, user.id);
  const [state, formAction, isPending] = useActionState(boundUpdateUser, initialState);

  return (
    <Fragment>
      <tr>
        <td>
          {user.email}
          {isSelf && (
            <span className="badge" style={{ marginLeft: 8 }}>
              you
            </span>
          )}
          {!user.active && (
            <span className="badge" style={{ marginLeft: 8, background: "#fbe9e7", color: "var(--danger)" }}>
              inactive
            </span>
          )}
        </td>
        <td style={{ width: 160 }}>
          <input
            form={`user-form-${user.id}`}
            name="name"
            defaultValue={user.name}
            style={{ padding: "4px 8px", fontSize: 13 }}
          />
        </td>
        <td style={{ width: 110 }}>
          <select
            form={`user-form-${user.id}`}
            name="role"
            defaultValue={user.role}
            style={{ padding: "4px 8px", fontSize: 13 }}
          >
            <option value="estimator">Estimator</option>
            <option value="admin">Admin</option>
          </select>
        </td>
        <td style={{ width: 60 }}>
          <input
            form={`user-form-${user.id}`}
            type="checkbox"
            name="active"
            defaultChecked={user.active}
            style={{ width: "auto" }}
          />
        </td>
        <td style={{ width: 150 }}>
          <input
            form={`user-form-${user.id}`}
            name="password"
            type="password"
            placeholder="leave blank to keep"
            minLength={8}
            style={{ padding: "4px 8px", fontSize: 13 }}
          />
        </td>
        <td>
          <form id={`user-form-${user.id}`} action={formAction} style={{ display: "inline" }}>
            <button
              className="btn secondary"
              type="submit"
              disabled={isPending}
              style={{ fontSize: 13, padding: "4px 10px" }}
            >
              {isPending ? "Saving..." : "Save"}
            </button>
          </form>
        </td>
      </tr>
      {state.error && (
        <tr>
          <td colSpan={6} style={{ paddingTop: 0, paddingBottom: 12 }}>
            <p className="error" style={{ margin: 0, fontSize: 13 }}>
              {state.error}
            </p>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
