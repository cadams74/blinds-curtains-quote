import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { requireUser } from "@/lib/session";
import { QuotePdfDocument } from "@/lib/QuotePdfDocument";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();

  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) {
    return NextResponse.json({ error: "Invalid quote id" }, { status: 400 });
  }

  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const lineItems = await db
    .select()
    .from(schema.quoteLineItems)
    .where(eq(schema.quoteLineItems.quoteId, quoteId))
    .orderBy(asc(schema.quoteLineItems.lineNumber));

  const buffer = await renderToBuffer(QuotePdfDocument({ quote, lineItems }));

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.quoteNumber}.pdf"`,
    },
  });
}
