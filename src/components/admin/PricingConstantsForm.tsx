"use client";

import { useActionState } from "react";
import { updatePricingConstants, type ActionState } from "@/lib/adminActions";
import type { ConstantField } from "@/lib/pricingConstantsConfig";

const initialState: ActionState = { error: null, successAt: null };

/** The Pricing Constants form as a client component so useActionState can
 * surface a real validation message (e.g. a negative number) instead of a
 * blank crash page in production -- see UserRow.tsx/adminActions.ts's
 * ActionState comment for the full story. */
export function PricingConstantsForm({
  blindFields,
  curtainFields,
  constants,
}: {
  blindFields: ConstantField[];
  curtainFields: ConstantField[];
  constants: Record<string, unknown>;
}) {
  const [state, formAction, isPending] = useActionState(updatePricingConstants, initialState);

  return (
    <form action={formAction}>
      <h3 style={{ marginTop: 0 }}>Blind pricing constants</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        Affects Roller and the five shared-engine families (Venetian, Roman, Panel, Verishade,
        Vertical) -- read straight from the active version below by every quote's price calculation.
      </p>
      {blindFields.map((field) => (
        <div className="field" key={field.key}>
          <label htmlFor={field.key}>
            {field.label} <span className="muted">-- {field.appliesTo}</span>
          </label>
          <input
            id={field.key}
            name={field.key}
            type="number"
            step="0.01"
            min="0"
            defaultValue={typeof constants[field.key] === "number" ? (constants[field.key] as number) : ""}
            required
          />
        </div>
      ))}

      <h3>Curtain pricing constants</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        Affects every curtain quote's price calculation. Saved together with the blind constants
        above as one version, since they live in the same versioned record.
      </p>
      {curtainFields.map((field) => (
        <div className="field" key={field.key}>
          <label htmlFor={field.key}>
            {field.label} <span className="muted">-- {field.appliesTo}</span>
          </label>
          <input
            id={field.key}
            name={field.key}
            type="number"
            step="0.01"
            min="0"
            defaultValue={typeof constants[field.key] === "number" ? (constants[field.key] as number) : ""}
            required
          />
        </div>
      ))}

      {state.error && <p className="error">{state.error}</p>}
      <button className="btn" type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save as new active version"}
      </button>
    </form>
  );
}
