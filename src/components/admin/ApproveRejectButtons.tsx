"use client";

import { useActionState } from "react";
import { approveFabricImport, rejectFabricImport, type ActionState } from "@/lib/adminActions";

const initialState: ActionState = { error: null, successAt: null };

/** Approve/Reject buttons for a pending fabric import batch, as a client
 * component so useActionState can surface a real message (e.g. "this batch
 * is already approved" if two tabs race) instead of a blank crash page in
 * production -- see UserRow.tsx/adminActions.ts's ActionState comment for
 * the full story. Two independent useActionState hooks, one per action, so
 * either button's pending/error state is its own. */
export function ApproveRejectButtons({
  batchId,
  approveLabel,
}: {
  batchId: number;
  approveLabel: string;
}) {
  const boundApprove = approveFabricImport.bind(null, batchId);
  const boundReject = rejectFabricImport.bind(null, batchId);
  const [approveState, approveAction, approvePending] = useActionState(boundApprove, initialState);
  const [rejectState, rejectAction, rejectPending] = useActionState(boundReject, initialState);

  return (
    <div>
      <div style={{ display: "flex", gap: 12 }}>
        <form action={approveAction}>
          <button className="btn" type="submit" disabled={approvePending || rejectPending}>
            {approvePending ? "Approving..." : approveLabel}
          </button>
        </form>
        <form action={rejectAction}>
          <button className="btn secondary" type="submit" disabled={approvePending || rejectPending}>
            {rejectPending ? "Rejecting..." : "Reject"}
          </button>
        </form>
      </div>
      {(approveState.error || rejectState.error) && (
        <p className="error" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
          {approveState.error ?? rejectState.error}
        </p>
      )}
    </div>
  );
}
