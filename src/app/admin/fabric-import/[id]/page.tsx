import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { ApproveRejectButtons } from "@/components/admin/ApproveRejectButtons";
import { summarizeDiff, type DiffedFabricRow, type FabricImportDiffKind } from "@/lib/fabricImport";

// See the fuller comment on this same export in admin/pricing-constants/
// page.tsx. This page reads searchParams, which already forces dynamic
// rendering -- declared explicitly anyway for consistency with the rest of
// the admin section.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

const DIFF_LABEL: Record<FabricImportDiffKind, string> = {
  new: "New fabric",
  price_change: "Price change",
  unchanged: "Unchanged",
  ambiguous: "Ambiguous (name matches 2+ existing fabrics)",
  invalid_price: "Invalid price -- couldn't parse",
};

const DIFF_STYLE: Partial<Record<FabricImportDiffKind, CSSProperties>> = {
  new: { background: "#e6f4ea", color: "#1e7a34" },
  price_change: { background: "#e8f0fe", color: "#1a56db" },
  ambiguous: { background: "#fbe9e7", color: "var(--danger)" },
  invalid_price: { background: "#fbe9e7", color: "var(--danger)" },
  unchanged: { background: "#f1f2f4", color: "var(--muted)" },
};

export default async function AdminFabricImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const { id } = await params;
  const batchId = Number(id);
  if (!Number.isInteger(batchId)) notFound();

  const [batch] = await db.select().from(schema.fabricImportBatches).where(eq(schema.fabricImportBatches.id, batchId));
  if (!batch) notFound();

  const [supplier] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, batch.supplierId));

  const payload = batch.importedRows as {
    nameHeader: string | null;
    priceHeader: string | null;
    columnDetectionConfident: boolean;
    rows: DiffedFabricRow[];
  };
  const allRows = payload.rows ?? [];
  const counts = summarizeDiff(allRows);

  const sp = await searchParams;
  const filter = sp.filter as FabricImportDiffKind | undefined;
  const filtered = filter ? allRows.filter((r) => r.diff === filter) : allRows;
  const page = Math.max(1, Number(sp.page) || 1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filterHref = (f?: FabricImportDiffKind) => (f ? `?filter=${f}` : `/admin/fabric-import/${batchId}`);

  return (
    <>
      <Topbar />
      <div className="page">
        <p>
          <Link href="/admin/fabric-import" className="muted">
            &larr; Fabric Import
          </Link>
        </p>
        <h1>{supplier?.name ?? "Unknown supplier"} -- {batch.sourceFilename}</h1>
        <p className="muted">
          Uploaded {new Date(batch.createdAt).toLocaleString()}
          {batch.reviewedAt && (
            <>
              {" "}
              -- {batch.status} by {batch.reviewedBy} at {new Date(batch.reviewedAt).toLocaleString()}
            </>
          )}
        </p>

        {!payload.columnDetectionConfident && (
          <div className="card" style={{ borderColor: "var(--danger)" }}>
            <p style={{ margin: 0 }}>
              <strong>Couldn&apos;t confidently detect the name/price columns from the header row</strong> --
              guessed <code>{payload.nameHeader}</code> as the name column and{" "}
              <code>{payload.priceHeader}</code> as the price column based on which one looked
              numeric. Check a sample of rows below carefully before approving; reject and
              re-upload with clearer headers (containing "name"/"fabric" and "price"/"cost") if
              this guessed wrong.
            </p>
          </div>
        )}
        {payload.columnDetectionConfident && (
          <p className="muted" style={{ fontSize: 13 }}>
            Detected columns: <strong>{payload.nameHeader}</strong> (name),{" "}
            <strong>{payload.priceHeader}</strong> (price).
          </p>
        )}

        <div className="card">
          <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 8 }}>
            {allRows.length} row{allRows.length === 1 ? "" : "s"} parsed. Click a count to filter the
            table below.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", fontSize: 13 }}>
            <Link href={filterHref()}>All ({allRows.length})</Link>
            {(Object.keys(DIFF_LABEL) as FabricImportDiffKind[]).map((k) => (
              <Link key={k} href={filterHref(k)}>
                {DIFF_LABEL[k]} ({counts[k]})
              </Link>
            ))}
          </div>
          {(counts.ambiguous > 0 || counts.invalid_price > 0) && (
            <p className="muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
              Approving still applies every "New fabric" and "Price change" row -- ambiguous and
              invalid-price rows are always skipped and left for manual resolution on{" "}
              <Link href="/admin/fabrics">Fabric Prices</Link>, whether or not you review them here
              first.
            </p>
          )}
        </div>

        <div className="card">
          {pageRows.length === 0 ? (
            <p className="muted">No rows match this filter.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Fabric</th>
                  <th>New price</th>
                  <th>Previous price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.rowNumber}>
                    <td>{r.name}</td>
                    <td>{r.price !== null ? `$${r.price.toFixed(2)}` : <span className="muted">{r.rawPrice || "(blank)"}</span>}</td>
                    <td>{r.previousPrice !== null ? `$${r.previousPrice.toFixed(2)}` : <span className="muted">--</span>}</td>
                    <td>
                      <span className="badge" style={DIFF_STYLE[r.diff]}>
                        {DIFF_LABEL[r.diff]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13 }}>
              {page > 1 ? (
                <Link href={`${filterHref(filter)}${filter ? "&" : "?"}page=${page - 1}`}>&larr; Previous</Link>
              ) : (
                <span />
              )}
              <span className="muted">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={`${filterHref(filter)}${filter ? "&" : "?"}page=${page + 1}`}>Next &rarr;</Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </div>

        {batch.status === "pending_review" ? (
          <div className="card">
            <ApproveRejectButtons
              batchId={batchId}
              approveLabel={`Approve -- apply ${counts.new} new and ${counts.price_change} price change${
                counts.price_change === 1 ? "" : "s"
              }`}
            />
          </div>
        ) : (
          <p className="muted">
            This batch is {batch.status} -- {batch.status === "approved" ? "its rows have been applied to" : "no rows were applied to"} Fabric Prices.
          </p>
        )}
      </div>
    </>
  );
}
