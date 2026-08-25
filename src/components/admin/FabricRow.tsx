"use client";

import { Fragment, useActionState } from "react";
import * as schema from "@/db/schema";
import { updateFabricPrice, type ActionState } from "@/lib/adminActions";

const initialState: ActionState = { error: null, successAt: null };

/** One row of the Fabric Prices table -- see UserRow.tsx for why this is a
 * client component (useActionState) rather than the plain <tr> + out-of-
 * table form="" pattern the rest of this admin page still uses elsewhere;
 * this row needed it so a rejected edit (e.g. marking a fabric active with
 * no price) shows its real message instead of a blank crash page. */
export function FabricRow({
  fabric,
  supplierName,
}: {
  fabric: typeof schema.fabrics.$inferSelect;
  supplierName: string;
}) {
  const boundAction = updateFabricPrice.bind(null, fabric.id);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);
  const formId = `fabric-form-${fabric.id}`;

  return (
    <Fragment>
      <tr>
        <td>{supplierName}</td>
        <td>
          {fabric.name}
          {!fabric.active && (
            <span className="badge" style={{ marginLeft: 8, background: "#fbe9e7", color: "var(--danger)" }}>
              inactive
            </span>
          )}
        </td>
        <td style={{ width: 130 }}>
          <input
            form={formId}
            name="pricePerMetre"
            type="number"
            step="0.01"
            min="0"
            defaultValue={fabric.pricePerMetre ?? ""}
            style={{ padding: "4px 8px", fontSize: 13 }}
          />
        </td>
        <td style={{ width: 70 }}>
          <input form={formId} type="checkbox" name="active" defaultChecked={fabric.active} style={{ width: "auto" }} />
        </td>
        <td>
          <form id={formId} action={formAction} style={{ display: "inline" }}>
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
          <td colSpan={5} style={{ paddingTop: 0, paddingBottom: 12 }}>
            <p className="error" style={{ margin: 0, fontSize: 13 }}>
              {state.error}
            </p>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
