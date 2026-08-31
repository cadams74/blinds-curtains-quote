import Link from "next/link";
import { Fragment } from "react";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { GENERIC_BLIND_FAMILIES } from "@/lib/blindFamilies";

// Every family slug that shares the Blind Quote grid (Roller + the five
// genericBlind.ts families) -- see blind-grid/page.tsx. Honeycomb excluded,
// same reason as everywhere else it's excluded: no live quoting route yet.
const BLIND_FAMILY_SLUGS = ["roller", ...GENERIC_BLIND_FAMILIES.map((f) => f.slug)];
const BLIND_SLUGS_SQL = sql.raw(
  `array[${BLIND_FAMILY_SLUGS.map((s) => `'${s}'`).join(",")}]`
);

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const quotes = await db
    .select({
      id: schema.quotes.id,
      quoteNumber: schema.quotes.quoteNumber,
      customerName: schema.quotes.customerName,
      status: schema.quotes.status,
      createdAt: schema.quotes.createdAt,
      total: sql<string>`coalesce(sum(${schema.quoteLineItems.finalPrice}), 0)`,
      lineCount: sql<number>`count(${schema.quoteLineItems.id})`,
      // Drives which per-quote document/grid buttons show below the row --
      // each button only makes sense for a quote that actually has line
      // items of the relevant family. Whatever comes next (Blind Install
      // etc.) gets its own count the same way.
      curtainCount: sql<number>`count(*) filter (where ${schema.quoteLineItems.familySlug} = 's_wave_sheer')`,
      blindCount: sql<number>`count(*) filter (where ${schema.quoteLineItems.familySlug} = any(${BLIND_SLUGS_SQL}))`,
    })
    .from(schema.quotes)
    .leftJoin(schema.quoteLineItems, eq(schema.quoteLineItems.quoteId, schema.quotes.id))
    .groupBy(schema.quotes.id)
    .orderBy(desc(schema.quotes.createdAt));

  return (
    <>
      <Topbar />
      <div className="page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1>Quotes</h1>
          <Link href="/quotes/new" className="btn">
            New quote
          </Link>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {quotes.length === 0 ? (
            <p className="muted" style={{ padding: 20 }}>
              No quotes yet -- create your first one.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Quote #</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Line items</th>
                  <th>Total</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const hasCurtains = Number(q.curtainCount) > 0;
                  const hasBlinds = Number(q.blindCount) > 0;
                  // More install-document/grid buttons join this row the
                  // same way -- one more `has...` flag above, one more
                  // conditional Link below. The row itself is skipped
                  // entirely when a quote qualifies for none of them,
                  // rather than rendering an empty strip under every quote.
                  const hasInstallDocs = hasCurtains || hasBlinds;
                  return (
                    <Fragment key={q.id}>
                      <tr>
                        <td>
                          <Link href={`/quotes/${q.id}`}>{q.quoteNumber}</Link>
                        </td>
                        <td>{q.customerName}</td>
                        <td>
                          <span className="badge">{q.status}</span>
                        </td>
                        <td>{q.lineCount}</td>
                        <td>${Number(q.total).toFixed(2)}</td>
                        <td className="muted">{new Date(q.createdAt).toLocaleDateString()}</td>
                      </tr>
                      {hasInstallDocs && (
                        <tr>
                          <td colSpan={6} style={{ paddingTop: 0, paddingBottom: 10 }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              {hasCurtains && (
                                <Link
                                  href={`/quotes/${q.id}/curtain-install`}
                                  className="btn secondary"
                                  style={{ fontSize: 13, padding: "4px 10px" }}
                                >
                                  Curtain Install
                                </Link>
                              )}
                              {hasCurtains && (
                                <Link
                                  href={`/quotes/${q.id}/curtain-grid`}
                                  className="btn secondary"
                                  style={{ fontSize: 13, padding: "4px 10px" }}
                                >
                                  Curtain Grid
                                </Link>
                              )}
                              {hasBlinds && (
                                <Link
                                  href={`/quotes/${q.id}/blind-grid`}
                                  className="btn secondary"
                                  style={{ fontSize: 13, padding: "4px 10px" }}
                                >
                                  Blind Grid
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
