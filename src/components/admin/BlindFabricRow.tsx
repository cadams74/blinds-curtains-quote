"use client";

import { Fragment, useActionState } from "react";
import * as schema from "@/db/schema";
import { updateBlindFabricGroup, type ActionState } from "@/lib/adminActions";
import { getBlindSourceFamilyInfo } from "@/lib/blindFabricSourceInfo";

const initialState: ActionState = { error: null, successAt: null };

/** One row of the Blind Fabric Groups table -- see UserRow.tsx/FabricRow.tsx
 * for why this is a client component (useActionState) rather than the
 * plain <tr> + out-of-table form="" pattern this page used before: an
 * invalid price group (e.g. 0) now shows its real message instead of a
 * blank crash page. */
export function BlindFabricRow({
  row,
  rangeByFamily,
}: {
  row: typeof schema.blindFabricOptions.$inferSelect;
  rangeByFamily: Map<string, { min: number; max: number }>;
}) {
  const boundAction = updateBlindFabricGroup.bind(null, row.id);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);
  const formId = `blind-fabric-form-${row.id}`;

  const info = getBlindSourceFamilyInfo(row.source);
  const familySummary = info.priceGridFamilies.length
    ? info.priceGridFamilies
        .map((f) => {
          const r = rangeByFamily.get(f);
          return r ? `${f} (${r.min}–${r.max})` : f;
        })
        .join(", ")
    : "unknown";
  const outOfRange = info.priceGridFamilies.some((f) => {
    const r = rangeByFamily.get(f);
    return r && (row.priceGroup < r.min || row.priceGroup > r.max);
  });

  return (
    <Fragment>
      <tr>
        <td>{row.source}</td>
        <td>{row.fabricName}</td>
        <td style={{ width: 100 }}>
          <input
            form={formId}
            name="priceGroup"
            type="number"
            step="1"
            min="1"
            defaultValue={row.priceGroup}
            style={{ padding: "4px 8px", fontSize: 13, width: 70 }}
          />
        </td>
        <td style={{ fontSize: 13 }}>
          {familySummary}
          {!info.live && (
            <span className="badge" style={{ marginLeft: 8, background: "#f1f2f4", color: "var(--muted)" }}>
              not wired to a form
            </span>
          )}
          {outOfRange && (
            <span className="badge" style={{ marginLeft: 8, background: "#fbe9e7", color: "var(--danger)" }}>
              outside a used family's range
            </span>
          )}
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
