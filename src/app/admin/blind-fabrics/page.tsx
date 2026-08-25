import Link from "next/link";
import { and, asc, count, eq, ilike } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { BlindFabricRow } from "@/components/admin/BlindFabricRow";

// See the fuller comment on this same export in admin/pricing-constants/
// page.tsx. This page reads searchParams, which already forces dynamic
// rendering -- declared explicitly anyway for consistency with the other
// three admin pages.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  source?: string;
  q?: string;
  page?: string;
}

function withParams(current: SearchParams, overrides: Partial<SearchParams>): string {
  const merged = { ...current, ...overrides };
  const qs = new URLSearchParams();
  if (merged.source) qs.set("source", merged.source);
  if (merged.q) qs.set("q", merged.q);
  if (merged.page && merged.page !== "1") qs.set("page", merged.page);
  const s = qs.toString();
  return s ? `/admin/blind-fabrics?${s}` : "/admin/blind-fabrics";
}

export default async function AdminBlindFabricsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const source = sp.source?.trim();
  const q = sp.q?.trim();

  // Reference panel: each price-grid family's actual valid group-number
  // range, read live from the database rather than hardcoded, so it can't
  // drift out of date after a reseed. See blindFabricSourceInfo.ts for why
  // this can't just be folded into a per-row hard validation.
  const gridRows = await db
    .select({ familySlug: schema.priceGridGroups.familySlug, groupNumber: schema.priceGridGroups.groupNumber })
    .from(schema.priceGridGroups);
  const rangeByFamily = new Map<string, { min: number; max: number }>();
  for (const g of gridRows) {
    const existing = rangeByFamily.get(g.familySlug);
    if (!existing) {
      rangeByFamily.set(g.familySlug, { min: g.groupNumber, max: g.groupNumber });
    } else {
      existing.min = Math.min(existing.min, g.groupNumber);
      existing.max = Math.max(existing.max, g.groupNumber);
    }
  }
  const familyRanges = [...rangeByFamily.entries()].sort(([a], [b]) => a.localeCompare(b));

  const sources = await db
    .selectDistinct({ source: schema.blindFabricOptions.source })
    .from(schema.blindFabricOptions)
    .orderBy(asc(schema.blindFabricOptions.source));

  const conditions = [
    source ? eq(schema.blindFabricOptions.source, source) : undefined,
    q ? ilike(schema.blindFabricOptions.fabricName, `%${q}%`) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [[{ value: total }], rows] = await Promise.all([
    db.select({ value: count() }).from(schema.blindFabricOptions).where(where),
    db
      .select()
      .from(schema.blindFabricOptions)
      .where(where)
      .orderBy(asc(schema.blindFabricOptions.source), asc(schema.blindFabricOptions.fabricName))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <Topbar />
      <div className="page">
        <h1>Blind Fabric Groups</h1>
        <p className="muted">
          Which price-grid group each blind fabric prices against (217 seeded rows) -- not a dollar
          figure, an index into a width x height grid (see{" "}
          <Link href="/admin/fabrics">Fabric Prices</Link> for the curtain $/metre library, which is
          a different kind of edit). A fabric's source can be shared across more than one family
          (e.g. a "Mermet" fabric can be quoted as Roller, Roman, or Panel) -- each row below shows
          which families use it and that family's live valid group range.
        </p>

        <div className="card">
          <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 8 }}>
            Valid group range per price-grid family, read live from the database:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 13 }}>
            {familyRanges.map(([family, r]) => (
              <span key={family}>
                <strong>{family}</strong>: {r.min}&ndash;{r.max}
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <form action="/admin/blind-fabrics" method="get" className="field-row" style={{ alignItems: "end" }}>
            <div className="field">
              <label htmlFor="source">Source</label>
              <select id="source" name="source" defaultValue={sp.source ?? ""}>
                <option value="">All sources</option>
                {sources.map((s) => (
                  <option key={s.source} value={s.source}>
                    {s.source}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="q">Search fabric name</label>
              <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="e.g. Dadaism" />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <button className="btn" type="submit">
                Filter
              </button>
            </div>
          </form>
          {(sp.source || sp.q) && (
            <Link href="/admin/blind-fabrics" className="muted" style={{ fontSize: 13 }}>
              Clear filters
            </Link>
          )}
        </div>

        <div className="card">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            {total} row{total === 1 ? "" : "s"} match{source || q ? " these filters" : ""} -- page{" "}
            {page} of {totalPages}.
          </p>
          {rows.length === 0 ? (
            <p className="muted">No blind fabric options match.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Fabric</th>
                  <th>Price group</th>
                  <th>Used by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <BlindFabricRow key={r.id} row={r} rangeByFamily={rangeByFamily} />
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

