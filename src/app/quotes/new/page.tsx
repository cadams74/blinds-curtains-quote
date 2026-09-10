import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { NewQuoteForm } from "@/components/NewQuoteForm";

export const dynamic = "force-dynamic";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { customerId } = await searchParams;

  // Arriving from a customer's own page (their "New quote" button) links
  // here with ?customerId= -- skip the picker and go straight to a
  // confirmation for that one customer, the "add a new quote directly from
  // there" flow. A bad/stale id just falls back to the normal picker rather
  // than erroring, since nothing was lost by not finding it.
  let presetCustomer: { id: number; name: string } | null = null;
  if (customerId) {
    const parsedId = Number(customerId);
    if (Number.isInteger(parsedId)) {
      const [found] = await db
        .select({ id: schema.customers.id, name: schema.customers.name })
        .from(schema.customers)
        .where(eq(schema.customers.id, parsedId));
      if (found) presetCustomer = found;
    }
  }

  const customers = presetCustomer
    ? []
    : await db
        .select({ id: schema.customers.id, name: schema.customers.name })
        .from(schema.customers)
        .orderBy(asc(schema.customers.name));

  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 480 }}>
        <h1>New quote</h1>
        <div className="card">
          <NewQuoteForm customers={customers} presetCustomer={presetCustomer} />
        </div>
      </div>
    </>
  );
}
