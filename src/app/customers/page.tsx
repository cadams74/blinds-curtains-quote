import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await db
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      suburb: schema.customers.suburb,
      state: schema.customers.state,
      mobile: schema.customers.mobile,
      email: schema.customers.email,
      quoteCount: sql<number>`count(${schema.quotes.id})`,
    })
    .from(schema.customers)
    .leftJoin(schema.quotes, eq(schema.quotes.customerId, schema.customers.id))
    .groupBy(schema.customers.id)
    .orderBy(asc(schema.customers.name));

  return (
    <>
      <Topbar />
      <div className="page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1>Customers</h1>
          <Link href="/customers/new" className="btn">
            New customer
          </Link>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {customers.length === 0 ? (
            <p className="muted" style={{ padding: 20 }}>
              No customers yet -- add your first one.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Suburb</th>
                  <th>State</th>
                  <th>Mobile</th>
                  <th>Email</th>
                  <th>Quotes</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/customers/${c.id}`}>{c.name}</Link>
                    </td>
                    <td>{c.suburb ?? "--"}</td>
                    <td>{c.state ?? "--"}</td>
                    <td>{c.mobile ?? "--"}</td>
                    <td>{c.email ?? "--"}</td>
                    <td>{c.quoteCount}</td>
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
