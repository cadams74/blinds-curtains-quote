"use server";

/**
 * Admin-only Server Actions. Split from lib/actions.ts (which every signed-in
 * estimator can call) so the admin-vs-estimator boundary is visible at a
 * glance in the file layout, not just enforced by a runtime check buried in
 * each function -- though requireAdmin() is still the actual enforcement
 * (see session.ts's comment on why the middleware.ts role gate alone isn't
 * enough).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, desc, eq, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { requireAdmin } from "./session.js";
import { EDITABLE_BLIND_CONSTANTS, EDITABLE_CURTAIN_CONSTANTS } from "./pricingConstantsConfig.js";
import {
  buildParsedRows,
  detectColumns,
  diffAgainstExisting,
  parsePdfBuffer,
  parseWorkbookBuffer,
  type DiffedFabricRow,
} from "./fabricImport.js";

/**
 * Shared return shape for every action in this file -- returned instead of
 * thrown so a useActionState-backed form (every admin page's forms, as of
 * this rewrite) can show the real validation message. Next.js redacts a
 * thrown Server Action error's message by default in a production build
 * (`next build && next start`), replacing it with a generic "Application
 * error"/digest the user never sees the content of -- confirmed by actually
 * building and running this app in production while verifying Staff
 * Logins' self-demote guard, not assumed; every action in this file threw
 * before that was found, and every one of them was silently showing a
 * blank crash screen for a validation mistake in production. useActionState
 * is the officially-supported way around it: the redaction applies to
 * thrown errors specifically, not to a value an action returns normally.
 * requireAdmin()'s own failure (not signed in, not an admin) is the one
 * thing still allowed to throw in each action below -- that's a genuine
 * defense-in-depth security check, not user-facing input validation, and
 * middleware.ts already stops a non-admin from reaching any of these pages
 * in the first place.
 */
export interface ActionState {
  error: string | null;
  successAt: number | null;
}

/**
 * Edits the curtain fabric library ($/metre -- see schema.ts's comment on
 * fabrics.pricePerMetre). This is deliberately NOT the same thing as a blind
 * fabric's "price group" (blind_fabric_options.price_group): that's an index
 * into a width x height price grid, not a dollar figure, and editing it
 * would change which grid a fabric prices against rather than what anything
 * costs -- a materially different, riskier kind of edit that lives in its
 * own admin section, updateBlindFabricGroup below, not folded in here under
 * the same "fabric price" label.
 */
export async function updateFabricPrice(
  fabricId: number,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const priceRaw = String(formData.get("pricePerMetre") ?? "").trim();
  const active = formData.get("active") === "on";

  if (active && priceRaw === "") {
    return {
      error: "Can't mark a fabric active with no price -- enter a price, or leave it inactive.",
      successAt: null,
    };
  }
  let pricePerMetre: string | null = null;
  if (priceRaw !== "") {
    const n = Number(priceRaw);
    if (!Number.isFinite(n) || n < 0) {
      return { error: "Price must be a non-negative number.", successAt: null };
    }
    pricePerMetre = String(n);
  }

  await db
    .update(schema.fabrics)
    .set({ pricePerMetre, active })
    .where(eq(schema.fabrics.id, fabricId));

  revalidatePath("/admin/fabrics");
  return { error: null, successAt: Date.now() };
}

/**
 * Saves an edited set of blind pricing constants as a NEW active version,
 * rather than mutating the current row in place -- pricing_constants_
 * versions was clearly designed for this (label + createdAt + isActive
 * columns), and a "what changed, and when" audit trail is worth the small
 * extra complexity for numbers that affect every quote at once. Only
 * touches the keys in EDITABLE_BLIND_CONSTANTS and EDITABLE_CURTAIN_
 * CONSTANTS (see pricingConstantsConfig.ts for why the rest of the stored
 * blob -- extraction-artifact scale values, single-value option-list
 * duplicates -- isn't editable through this action); everything else in the
 * previous version's `constants`/`formulaLiteralConstants` carries over
 * unchanged. Both families' fields come from the same admin page form and
 * save together as one version bump, since they really do live in the same
 * JSON blob -- saving them separately would just mean two version rows for
 * what's conceptually one edit.
 */
export async function updatePricingConstants(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const [active] = await db
    .select()
    .from(schema.pricingConstantsVersions)
    .where(eq(schema.pricingConstantsVersions.isActive, true))
    .limit(1);
  if (!active) {
    return { error: "No active pricing constants version -- run the seed script first.", successAt: null };
  }

  const currentConstants = active.constants as Record<string, unknown>;
  const updated: Record<string, unknown> = { ...currentConstants };

  for (const field of [...EDITABLE_BLIND_CONSTANTS, ...EDITABLE_CURTAIN_CONSTANTS]) {
    const raw = formData.get(field.key);
    if (raw === null) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      return { error: `"${field.label}" must be a non-negative number.`, successAt: null };
    }
    updated[field.key] = n;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.pricingConstantsVersions)
      .set({ isActive: false })
      .where(eq(schema.pricingConstantsVersions.isActive, true));
    await tx.insert(schema.pricingConstantsVersions).values({
      label: `admin-edit-${new Date().toISOString()}`,
      constants: updated,
      formulaLiteralConstants: active.formulaLiteralConstants,
      isActive: true,
    });
  });

  revalidatePath("/admin/pricing-constants");
  return { error: null, successAt: Date.now() };
}

/** Read-only version history for the admin page -- newest first. */
export async function getPricingConstantsHistory(limit = 10) {
  await requireAdmin();
  return db
    .select({
      id: schema.pricingConstantsVersions.id,
      label: schema.pricingConstantsVersions.label,
      createdAt: schema.pricingConstantsVersions.createdAt,
      isActive: schema.pricingConstantsVersions.isActive,
    })
    .from(schema.pricingConstantsVersions)
    .orderBy(desc(schema.pricingConstantsVersions.createdAt))
    .limit(limit);
}

/**
 * Edits one option_lists row's stored values -- either the friendly
 * one-item-per-line form (for a flat list of strings, the common case: real
 * dropdown lists like RollerSources/Styles/Tracks) or a raw JSON textarea
 * (for anything else: single values, or the paired-data tables like
 * Fullnesses/LayoutBends -- see liveOptionLists.ts). The admin page decides
 * which editor to show per row based on the CURRENT shape; this action just
 * validates and saves whatever comes back rather than re-deriving that,
 * since deriving it from `mode` (which editor was actually shown) is both
 * simpler and avoids a mismatch if the shape check and the submitted mode
 * ever disagree.
 */
export async function updateOptionListValues(
  id: number,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const mode = String(formData.get("mode") ?? "");
  let values: unknown;

  if (mode === "list") {
    const raw = String(formData.get("valuesList") ?? "");
    values = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
  } else if (mode === "json") {
    const raw = String(formData.get("valuesJson") ?? "");
    try {
      values = JSON.parse(raw);
    } catch {
      return { error: "That's not valid JSON -- fix the syntax and try again.", successAt: null };
    }
  } else {
    return { error: "Unknown editor mode.", successAt: null };
  }

  await db.update(schema.optionLists).set({ values }).where(eq(schema.optionLists.id, id));
  revalidatePath("/admin/option-lists");
  return { error: null, successAt: Date.now() };
}

/**
 * Edits one blind_fabric_options row's price group -- the index into a
 * width x height price grid a blind fabric prices against (see schema.ts's
 * comment on this table, and adminActions.ts's earlier note on why this is
 * a materially different kind of edit than fabrics.pricePerMetre). Doesn't
 * validate the new group number against any particular family's known
 * range: the same (source, fabricName) row can be shared across several
 * families with different valid ranges (see blindFabricSourceInfo.ts), so
 * there's no single range to check against here -- the admin page shows
 * each row's applicable families and their live ranges as a reference
 * instead of hard-blocking on it. An out-of-range group still fails loudly
 * at quote time (loadBlindDataSource's "No price grid for..." error) rather
 * than silently mispricing, so this stays a soft guardrail, not a hole.
 */
export async function updateBlindFabricGroup(
  id: number,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const raw = String(formData.get("priceGroup") ?? "").trim();
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    return { error: "Price group must be a whole number of 1 or more.", successAt: null };
  }

  await db.update(schema.blindFabricOptions).set({ priceGroup: n }).where(eq(schema.blindFabricOptions.id, id));

  revalidatePath("/admin/blind-fabrics");
  return { error: null, successAt: Date.now() };
}

/**
 * Uploads a supplier's price list (.xlsx or .pdf) and stages it for review
 * -- see fabricImport.ts's file comment for why this parses synchronously
 * in the request rather than via a background job. Parses (via
 * parseWorkbookBuffer or parsePdfBuffer, chosen by file extension --
 * everything from here on is format-agnostic), auto-detects the name/price
 * columns, diffs against that supplier's current fabrics, and lands the
 * result in a new fabric_import_batches row rather than touching
 * `fabrics` directly -- nothing here writes live pricing data; see
 * approveFabricImport for that.
 */
export async function startFabricImport(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const supplierId = Number(formData.get("supplierId"));
  if (!Number.isInteger(supplierId) || supplierId < 1) {
    return { error: "Choose a supplier before uploading.", successAt: null };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload.", successAt: null };
  }
  const lowerName = file.name.toLowerCase();
  const sourceFormat: "excel" | "pdf" | null = lowerName.endsWith(".xlsx")
    ? "excel"
    : lowerName.endsWith(".pdf")
      ? "pdf"
      : null;
  if (sourceFormat === null) {
    return {
      error: "Only .xlsx or .pdf files are supported.",
      successAt: null,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { headers, rows } =
    sourceFormat === "excel" ? await parseWorkbookBuffer(buffer) : await parsePdfBuffer(buffer);
  if (headers.length === 0) {
    return {
      error:
        sourceFormat === "excel"
          ? "Couldn't find any rows in that file -- is it a real .xlsx export, not a renamed .xls or .csv?"
          : "Couldn't find any table structure in that PDF -- it needs to be a real text-based table (name/price columns with clear spacing between them), not a scanned image or a catalogue-style layout.",
      successAt: null,
    };
  }

  const { nameColIdx, priceColIdx, confident } = detectColumns(headers, rows.slice(0, 20));
  const parsedRows = buildParsedRows(rows, nameColIdx, priceColIdx);

  const existingFabrics = await db
    .select({
      id: schema.fabrics.id,
      name: schema.fabrics.name,
      pricePerMetre: schema.fabrics.pricePerMetre,
      active: schema.fabrics.active,
    })
    .from(schema.fabrics)
    .where(eq(schema.fabrics.supplierId, supplierId));

  const diffed = diffAgainstExisting(
    parsedRows,
    existingFabrics.map((f) => ({
      ...f,
      pricePerMetre: f.pricePerMetre === null ? null : Number(f.pricePerMetre),
    }))
  );

  const [batch] = await db
    .insert(schema.fabricImportBatches)
    .values({
      supplierId,
      sourceFilename: file.name,
      sourceFormat,
      status: "pending_review",
      importedRows: {
        nameHeader: headers[nameColIdx] ?? null,
        priceHeader: headers[priceColIdx] ?? null,
        columnDetectionConfident: confident,
        rows: diffed,
      },
    })
    .returning({ id: schema.fabricImportBatches.id });

  revalidatePath("/admin/fabric-import");
  redirect(`/admin/fabric-import/${batch.id}`);
}

/**
 * Applies a pending_review batch's diffed rows to `fabrics`: inserts "new"
 * rows and updates "price_change" rows (also marking them active -- a price
 * on a fresh supplier list is read as "this is available now", including
 * reactivating a fabric seeded inactive with an unusable price, see
 * schema.ts). "unchanged" rows are true no-ops. "ambiguous" (name matches
 * more than one existing fabric) and "invalid_price" rows are deliberately
 * left untouched -- see fabricImport.ts's DiffedFabricRow comment for why
 * guessing there would be worse than leaving it for a human, same principle
 * as every other admin page in this app.
 */
export async function approveFabricImport(
  batchId: number,
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const user = await requireAdmin();

  const [batch] = await db
    .select()
    .from(schema.fabricImportBatches)
    .where(eq(schema.fabricImportBatches.id, batchId));
  if (!batch) return { error: "Import batch not found.", successAt: null };
  if (batch.status !== "pending_review") {
    return { error: `This batch is already ${batch.status} -- nothing to approve.`, successAt: null };
  }

  const payload = batch.importedRows as { rows: DiffedFabricRow[] };
  const rows = payload.rows ?? [];

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (row.diff === "new" && row.price !== null) {
        await tx
          .insert(schema.fabrics)
          .values({
            supplierId: batch.supplierId,
            name: row.name,
            pricePerMetre: String(row.price),
            active: true,
          })
          .onConflictDoNothing();
      } else if (row.diff === "price_change" && row.matchedFabricId && row.price !== null) {
        await tx
          .update(schema.fabrics)
          .set({ pricePerMetre: String(row.price), active: true })
          .where(eq(schema.fabrics.id, row.matchedFabricId));
      }
    }

    await tx
      .update(schema.fabricImportBatches)
      .set({ status: "approved", reviewedBy: user.email ?? user.name ?? "admin", reviewedAt: new Date() })
      .where(eq(schema.fabricImportBatches.id, batchId));
  });

  revalidatePath("/admin/fabric-import");
  revalidatePath(`/admin/fabric-import/${batchId}`);
  revalidatePath("/admin/fabrics");
  return { error: null, successAt: Date.now() };
}

/** Marks a pending batch rejected without touching `fabrics` at all -- for
 * a wrong file, a bad column-detection guess, or a price list an admin
 * wants to double check before it goes live. */
export async function rejectFabricImport(
  batchId: number,
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const user = await requireAdmin();

  const [batch] = await db
    .select()
    .from(schema.fabricImportBatches)
    .where(eq(schema.fabricImportBatches.id, batchId));
  if (!batch) return { error: "Import batch not found.", successAt: null };
  if (batch.status !== "pending_review") {
    return { error: `This batch is already ${batch.status}.`, successAt: null };
  }

  await db
    .update(schema.fabricImportBatches)
    .set({ status: "rejected", reviewedBy: user.email ?? user.name ?? "admin", reviewedAt: new Date() })
    .where(eq(schema.fabricImportBatches.id, batchId));

  revalidatePath("/admin/fabric-import");
  revalidatePath(`/admin/fabric-import/${batchId}`);
  return { error: null, successAt: Date.now() };
}

/**
 * Creates a new staff login. Before this, the only way to add someone was
 * npm run seed:admin -- a CLI script that needs a terminal and a direct
 * DATABASE_URL connection, meaning only whoever has database access could
 * add a teammate. There's still no self-signup (deliberate -- see auth.ts's
 * file comment): an admin creates the account here and passes the password
 * to the new hire out of band, the same trust model seedAdmin.ts already
 * used, just reachable from the app instead of a script.
 *
 * This was the first action in the file converted to return ActionState
 * instead of throwing (see that type's comment at the top of the file for
 * why) -- self-demote and last-admin here are guards a real admin will hit
 * doing something reasonable-looking, so the message reaching the screen
 * mattered enough to find and fix the redaction bug in the first place.
 * Every other action in this file was converted the same way afterward.
 */
export async function createUser(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "estimator");

  if (!email || !email.includes("@")) return { error: "Enter a valid email address.", successAt: null };
  if (!name) return { error: "Enter a name.", successAt: null };
  if (password.length < 8) return { error: "Password must be at least 8 characters.", successAt: null };
  if (role !== "admin" && role !== "estimator") {
    return { error: "Role must be admin or estimator.", successAt: null };
  }

  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (existing) {
    return {
      error: `${email} already has a login -- edit their existing row below instead of creating a new one.`,
      successAt: null,
    };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(schema.users).values({ email, name, passwordHash, role, active: true });

  revalidatePath("/admin/users");
  return { error: null, successAt: Date.now() };
}

/**
 * Edits an existing user's name/role/active flag, and optionally resets
 * their password -- a blank password field leaves the current one
 * unchanged, so this form doubles as both "edit details" and "reset
 * password" without a separate flow. Guards against the one way this page
 * could brick the whole admin area with no CLI fallback for anyone who
 * isn't comfortable running seedAdmin.ts directly against the production
 * database: an admin can't demote or deactivate themselves, and can't
 * demote/deactivate the last remaining active admin. Both checks run
 * against a fresh read of `target`, not the submitted form values, so a
 * stale form can't be used to sneak past them. See createUser's comment
 * for why this returns { error, successAt } instead of throwing.
 */
export async function updateUser(
  id: number,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const currentUser = await requireAdmin();

  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!target) return { error: "User not found.", successAt: null };

  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "estimator");
  const active = formData.get("active") === "on";
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "Name can't be empty.", successAt: null };
  if (role !== "admin" && role !== "estimator") {
    return { error: "Role must be admin or estimator.", successAt: null };
  }

  const isSelf = currentUser.email === target.email;
  if (isSelf && (role !== "admin" || !active)) {
    return {
      error: "You can't remove your own admin access or deactivate your own account -- have another admin do it.",
      successAt: null,
    };
  }

  const losingAdminAccess = (role !== "admin" || !active) && target.role === "admin" && target.active;
  if (losingAdminAccess) {
    const [{ value: otherActiveAdmins }] = await db
      .select({ value: count() })
      .from(schema.users)
      .where(and(eq(schema.users.role, "admin"), eq(schema.users.active, true), ne(schema.users.id, id)));
    if (otherActiveAdmins === 0) {
      return { error: "Can't remove the last active admin -- promote someone else to admin first.", successAt: null };
    }
  }

  const updates: Partial<typeof schema.users.$inferInsert> = { name, role, active };
  if (password) {
    if (password.length < 8) return { error: "Password must be at least 8 characters.", successAt: null };
    updates.passwordHash = await bcrypt.hash(password, 12);
  }

  await db.update(schema.users).set(updates).where(eq(schema.users.id, id));
  revalidatePath("/admin/users");
  return { error: null, successAt: Date.now() };
}
