import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";

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
                {quotes.map((q) => (
                  <tr key={q.id}>
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
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
