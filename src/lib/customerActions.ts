"use server";

/**
 * Server Actions for the Customers section (customers.ts / /customers/*).
 * Any signed-in staff member can create/edit a customer -- not admin-only,
 * same access level as creating a quote -- so these use requireUser(), not
 * requireAdmin(). requireUser()'s own failure is the one thing still
 * allowed to throw here.
 *
 * Both createCustomer and updateCustomer are useActionState-driven, like
 * the rest of this app's forms (Phase 13/14/37/38) -- a validation error
 * surfaces as a real message via ActionState instead of Next's generic
 * production-redacted crash screen. createCustomer redirects to the new
 * customer's page on success, same as updateCustomer's caller navigating
 * away is not needed since it stays put.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { requireUser } from "./session.js";
import type { ActionState } from "./actionState.js";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function readCustomerFields(formData: FormData) {
  const trim = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    name: trim("name"),
    address: trim("address") || null,
    suburb: trim("suburb") || null,
    state: trim("state") || null,
    postcode: trim("postcode") || null,
    mobile: trim("mobile") || null,
    email: trim("email") || null,
    alternateEmail: trim("alternateEmail") || null,
    notes: trim("notes") || null,
  };
}

/** Returns an error message if either email field is non-blank and doesn't
 * look like an email address, otherwise null. A loose sanity check (this
 * app generally prefers flagging an obvious data-entry slip over either
 * silently accepting or being strict enough to reject a real edge-case
 * address), not full RFC validation. */
function invalidEmailError(fields: ReturnType<typeof readCustomerFields>): string | null {
  if (fields.email && !EMAIL_RE.test(fields.email)) {
    return "Email address doesn't look valid.";
  }
  if (fields.alternateEmail && !EMAIL_RE.test(fields.alternateEmail)) {
    return "Alternate email address doesn't look valid.";
  }
  return null;
}

export async function createCustomer(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();

  const fields = readCustomerFields(formData);
  if (!fields.name) {
    return { error: "Customer name is required.", successAt: null };
  }
  const emailError = invalidEmailError(fields);
  if (emailError) {
    return { error: emailError, successAt: null };
  }

  const [created] = await db.insert(schema.customers).values(fields).returning({ id: schema.customers.id });

  revalidatePath("/customers");
  redirect(`/customers/${created.id}`);
}

export async function updateCustomer(
  customerId: number,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireUser();

  const fields = readCustomerFields(formData);
  if (!fields.name) {
    return { error: "Customer name is required.", successAt: null };
  }
  const emailError = invalidEmailError(fields);
  if (emailError) return { error: emailError, successAt: null };

  await db
    .update(schema.customers)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(schema.customers.id, customerId));

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { error: null, successAt: Date.now() };
}
