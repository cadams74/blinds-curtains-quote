import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { EditCustomerForm } from "@/components/CustomerForm";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) notFound();

  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId));
  if (!customer) notFound();

  // Order/quote history for this customer -- only quotes actually linked
  // via customerId show up here, which for quotes created before Customer
  // Tracking existed (or a one-off quote typed without picking a customer)
  // is correctly none, not a bug -- see schema.ts's comment on quotes.customerId.
  const quotes = await db
    .select({
      id: schema.quotes.id,
      quoteNumber: schema.quotes.quoteNumber,
      status: schema.quotes.status,
      createdAt: schema.quotes.createdAt,
      total: sql<string>`coalesce(sum(${schema.quoteLineItems.finalPrice}), 0)`,
      lineCount: sql<number>`count(${schema.quoteLineItems.id})`,
    })
    .from(schema.quotes)
    .leftJoin(schema.quoteLineItems, eq(schema.quoteLineItems.quoteId, schema.quotes.id))
    .where(eq(schema.quotes.customerId, customerId))
    .groupBy(schema.quotes.id)
    .orderBy(desc(schema.quotes.createdAt));

  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1>{customer.name}</h1>
          <Link href={`/quotes/new?customerId=${customer.id}`} className="btn">
            New quote
          </Link>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 16 }}>Customer details</h2>
          <EditCustomerForm customer={customer} />
        </div>

        <h2 style={{ fontSize: 16 }}>Quotes</h2>
        <div className="card" style={{ padding: 0 }}>
          {quotes.length === 0 ? (
            <p className="muted" style={{ padding: 20 }}>
              No quotes for this customer yet.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Quote #</th>
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
