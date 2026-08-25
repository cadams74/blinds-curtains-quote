"use client";

import { useActionState } from "react";
import { updateOptionListValues, type ActionState } from "@/lib/adminActions";

const initialState: ActionState = { error: null, successAt: null };

/** The per-row edit form on the Option Lists page, as a client component so
 * useActionState can surface a real validation message (e.g. invalid JSON)
 * instead of a blank crash page in production -- see UserRow.tsx/
 * adminActions.ts's ActionState comment for the full story. */
export function OptionListEditor({
  id,
  flatValues,
  rawValues,
}: {
  id: number;
  flatValues: string[] | null;
  rawValues: unknown;
}) {
  const boundAction = updateOptionListValues.bind(null, id);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction}>
      {flatValues ? (
        <>
          <label htmlFor={`list-${id}`}>One value per line</label>
          <textarea
            id={`list-${id}`}
            name="valuesList"
            rows={Math.min(20, Math.max(4, flatValues.length))}
            defaultValue={flatValues.join("\n")}
            style={{ fontFamily: "monospace", fontSize: 13 }}
          />
          <input type="hidden" name="mode" value="list" />
        </>
      ) : (
        <>
          <label htmlFor={`json-${id}`}>
            Raw JSON <span className="muted">-- not a plain list, see above</span>
          </label>
          <textarea
            id={`json-${id}`}
            name="valuesJson"
            rows={Math.min(20, Math.max(4, JSON.stringify(rawValues, null, 2).split("\n").length))}
            defaultValue={JSON.stringify(rawValues, null, 2)}
            style={{ fontFamily: "monospace", fontSize: 13 }}
          />
          <input type="hidden" name="mode" value="json" />
        </>
      )}
      {state.error && (
        <p className="error" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
          {state.error}
        </p>
      )}
      <button className="btn secondary" type="submit" disabled={isPending} style={{ marginTop: 8 }}>
        {isPending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
