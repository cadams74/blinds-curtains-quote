import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { EDITABLE_BLIND_CONSTANTS, EDITABLE_CURTAIN_CONSTANTS } from "@/lib/pricingConstantsConfig";
import { getPricingConstantsHistory } from "@/lib/adminActions";
import { PricingConstantsForm } from "@/components/admin/PricingConstantsForm";

// This page has no dynamic route segment or searchParams -- the two signals
// Next.js otherwise uses to opt a page out of build-time static prerendering
// -- so without this, `next build` tries to prerender it once and bakes in
// whatever the active pricing constants happen to be at build time (and, as
// found while building this, fails outright if the database isn't reachable
// during the build). Live, admin-only, mutable data must never be served
// from a stale static snapshot, so this forces per-request rendering
// explicitly rather than relying on Next's implicit detection.
export const dynamic = "force-dynamic";

export default async function AdminPricingConstantsPage() {
  const [active] = await db
    .select()
    .from(schema.pricingConstantsVersions)
    .where(eq(schema.pricingConstantsVersions.isActive, true))
    .limit(1);
  const constants = (active?.constants as Record<string, unknown>) ?? {};
  const history = await getPricingConstantsHistory();

  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 720 }}>
        <h1>Pricing Constants</h1>
        <p className="muted">
          Shared $ constants that feed every quote's price at once -- change one of these and it
          applies immediately, no redeploy.
        </p>

        <div className="card">
          <PricingConstantsForm
            blindFields={EDITABLE_BLIND_CONSTANTS}
            curtainFields={EDITABLE_CURTAIN_CONSTANTS}
            constants={constants}
          />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Version history</h3>
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((v) => (
                <tr key={v.id}>
                  <td>{v.label}</td>
                  <td className="muted">{new Date(v.createdAt).toLocaleString()}</td>
                  <td>{v.isActive && <span className="badge">active</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
