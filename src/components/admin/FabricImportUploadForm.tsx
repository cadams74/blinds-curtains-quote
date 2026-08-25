"use client";

import { useActionState } from "react";
import { startFabricImport, type ActionState } from "@/lib/adminActions";

const initialState: ActionState = { error: null, successAt: null };

/** The Fabric Import upload form as a client component so useActionState
 * can surface a real validation message (wrong file type, unreadable
 * workbook, no supplier chosen) instead of a blank crash page in
 * production -- see UserRow.tsx/adminActions.ts's ActionState comment for
 * the full story. On success, startFabricImport calls redirect() to the
 * new batch's review page -- that's a framework-recognized signal, not a
 * regular thrown error, so it still works normally here. */
export function FabricImportUploadForm({ suppliers }: { suppliers: { id: number; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(startFabricImport, initialState);

  return (
    <form action={formAction} className="field-row" style={{ alignItems: "end" }}>
      <div className="field">
        <label htmlFor="supplierId">Supplier</label>
        <select id="supplierId" name="supplierId" required defaultValue="">
          <option value="" disabled>
            Choose a supplier
          </option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="file">Price list (.xlsx or .pdf)</label>
        <input id="file" name="file" type="file" accept=".xlsx,.pdf" required />
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <button className="btn" type="submit" disabled={isPending}>
          {isPending ? "Uploading..." : "Upload & preview"}
        </button>
      </div>
      {state.error && (
        <div className="field" style={{ marginBottom: 14, flexBasis: "100%" }}>
          <p className="error" style={{ margin: 0, fontSize: 13 }}>
            {state.error}
          </p>
        </div>
      )}
    </form>
  );
}
