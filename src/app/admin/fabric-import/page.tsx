import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { FabricImportUploadForm } from "@/components/admin/FabricImportUploadForm";

// See the fuller comment on this same export in admin/pricing-constants/
// page.tsx -- kept explicit here too rather than relying on Next's implicit
// static/dynamic detection for an admin-only page that queries the database.
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
};

export default async function AdminFabricImportPage() {
  const suppliers = await db.select().from(schema.suppliers).orderBy(asc(schema.suppliers.name));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const batches = await db
    .select()
    .from(schema.fabricImportBatches)
    .orderBy(desc(schema.fabricImportBatches.createdAt))
    .limit(30);

  return (
    <>
      <Topbar />
      <div className="page">
        <h1>Fabric Import</h1>
        <p className="muted">
          Upload a supplier's updated price list (.xlsx) instead of hand-editing every fabric on{" "}
          <Link href="/admin/fabrics">Fabric Prices</Link>. Nothing changes live pricing until you
          review the parsed rows and approve the batch -- an upload only stages a diff.
        </p>

        <div className="card">
          <FabricImportUploadForm suppliers={suppliers} />
          <p className="muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
            .xlsx or .pdf. Either way, the first row/line is read as the header and name/price
            columns are auto-detected from it -- you'll see a warning on the review page if that
            detection wasn't confident. A PDF needs to be a real text-based table with clear
            spacing between columns (a price-list export, not a scanned image or a catalogue-style
            layout) -- see the file's own docs for exactly what that means if a page comes back
            with nothing parsed correctly.
          </p>
        </div>

        <div className="card">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Recent batches ({batches.length}):
          </p>
          {batches.length === 0 ? (
            <p className="muted">No imports yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>File</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>{supplierName.get(b.supplierId) ?? "--"}</td>
                    <td>{b.sourceFilename}</td>
                    <td>
                      <span
                        className="badge"
                        style={
                          b.status === "pending_review"
                            ? { background: "#fff4e0", color: "#8a5a00" }
                            : b.status === "rejected"
                              ? { background: "#f1f2f4", color: "var(--muted)" }
                              : undefined
                        }
                      >
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>{new Date(b.createdAt).toLocaleString()}</td>
                    <td>
                      <Link href={`/admin/fabric-import/${b.id}`}>Review</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
