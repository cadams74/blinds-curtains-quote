import Link from "next/link";
import { and, asc, count, eq, ilike } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { FabricRow } from "@/components/admin/FabricRow";

// See the fuller comment on this same export in
// admin/pricing-constants/page.tsx. This page reads `searchParams`, which
// already opts it out of static prerendering on its own -- declared
// explicitly anyway so that stays true even if the filter UI here ever
// changes to not need searchParams.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  supplierId?: string;
  q?: string;
  onlyInactive?: string;
  page?: string;
}

/** Builds a query string preserving the current filters, for pagination
 * links and the "Needs review" quick filter -- keeps them independent of
 * whichever filters are already applied rather than resetting them. */
function withParams(current: SearchParams, overrides: Partial<SearchParams>): string {
  const merged = { ...current, ...overrides };
  const qs = new URLSearchParams();
  if (merged.supplierId) qs.set("supplierId", merged.supplierId);
  if (merged.q) qs.set("q", merged.q);
  if (merged.onlyInactive) qs.set("onlyInactive", merged.onlyInactive);
  if (merged.page && merged.page !== "1") qs.set("page", merged.page);
  const s = qs.toString();
  return s ? `/admin/fabrics?${s}` : "/admin/fabrics";
}

export default async function AdminFabricsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supplierId = sp.supplierId ? Number(sp.supplierId) : undefined;
  const q = sp.q?.trim();
  const onlyInactive = sp.onlyInactive === "1";

  const suppliers = await db.select().from(schema.suppliers).orderBy(asc(schema.suppliers.name));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const conditions = [
    supplierId ? eq(schema.fabrics.supplierId, supplierId) : undefined,
    q ? ilike(schema.fabrics.name, `%${q}%`) : undefined,
    onlyInactive ? eq(schema.fabrics.active, false) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [[{ value: total }], fabricRows] = await Promise.all([
    db.select({ value: count() }).from(schema.fabrics).where(where),
    db
      .select()
      .from(schema.fabrics)
      .where(where)
      .orderBy(asc(schema.fabrics.name))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <Topbar />
      <div className="page">
        <h1>Fabric Prices</h1>
        <p className="muted">
          The curtain fabric library's $/metre prices -- this is what the curtain line item form's
          fabric picker auto-fills from. Editing a blind fabric's price-grid group isn't here yet
          (see Admin index).
        </p>

        <div className="card">
          <form action="/admin/fabrics" method="get" className="field-row" style={{ alignItems: "end" }}>
            <div className="field">
              <label htmlFor="supplierId">Supplier</label>
              <select id="supplierId" name="supplierId" defaultValue={sp.supplierId ?? ""}>
                <option value="">All suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="q">Search name</label>
              <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="e.g. Dadaism" />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <button className="btn" type="submit">
                Filter
              </button>
            </div>
          </form>
          <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
            <Link href={withParams(sp, { onlyInactive: "1", page: undefined })}>
              Needs review (inactive/no price)
            </Link>
            {(sp.supplierId || sp.q || sp.onlyInactive) && (
              <Link href="/admin/fabrics" className="muted">
                Clear filters
              </Link>
            )}
          </div>
        </div>

        <div className="card">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            {total} fabric{total === 1 ? "" : "s"} match
            {supplierId || q || onlyInactive ? " these filters" : ""} -- page {page} of {totalPages}.
          </p>
          {fabricRows.length === 0 ? (
            <p className="muted">No fabrics match.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Name</th>
                  <th>Price ($/m)</th>
                  <th>Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fabricRows.map((f) => (
                  <FabricRow key={f.id} fabric={f} supplierName={supplierName.get(f.supplierId) ?? "--"} />
                ))}
              </tbody>
            </table>
          )}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13 }}>
              {page > 1 ? (
                <Link href={withParams(sp, { page: String(page - 1) })}>&larr; Previous</Link>
              ) : (
                <span />
              )}
              {page < totalPages ? (
                <Link href={withParams(sp, { page: String(page + 1) })}>Next &rarr;</Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
