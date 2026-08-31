"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, asc, count, eq, max } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { requireUser } from "./session.js";
import { loadBlindDataSource, getOptionListValues } from "./pricingDataSource.js";
import { loadCurtainDataSource } from "./curtainDataSource.js";
import { priceRollerBlind, type RollerBlindInput, type RollerBlindResult } from "../pricing/roller.js";
import { priceGenericBlind, type GenericBlindInput, type GenericBlindResult } from "../pricing/genericBlind.js";
import { getBlindFamilyConfig } from "./blindFamilies.js";
import { priceCurtain, type CurtainInput, type CurtainResult } from "../pricing/curtain.js";
import { priceMisc, type MiscInput, type MiscResult } from "../pricing/misc.js";
import { computeCurtainFabricSellPrice } from "../pricing/curtainFabricSellPrice.js";

export async function createQuote(formData: FormData) {
  await requireUser();

  const customerName = String(formData.get("customerName") ?? "").trim();
  if (!customerName) throw new Error("Customer name is required.");

  // Simple sequential quote number -- good enough for a single-office
  // internal tool. Not attempting gap-free/concurrency-safe numbering (two
  // people creating a quote in the same instant could in principle race to
  // the same number); a real accounting requirement would want a DB
  // sequence in a transaction instead.
  const year = new Date().getFullYear();
  const [{ value: totalCount }] = await db.select({ value: count() }).from(schema.quotes);
  const quoteNumber = `Q-${year}-${String(totalCount + 1).padStart(4, "0")}`;

  const [created] = await db
    .insert(schema.quotes)
    .values({ customerName, quoteNumber })
    .returning({ id: schema.quotes.id });

  redirect(`/quotes/${created.id}`);
}

/** Live price preview as the estimator fills in the Roller form -- doesn't
 * write anything, just runs the same validated pricing engine used at save
 * time so the number shown while typing is the number that gets saved. */
export async function previewRollerPrice(input: RollerBlindInput): Promise<RollerBlindResult> {
  await requireUser();
  const data = await loadBlindDataSource(db, "Roller");
  return priceRollerBlind(input, data);
}

export async function addRollerLineItem(quoteId: number, formData: FormData) {
  const user = await requireUser();

  const widthMm = Number(formData.get("widthMm"));
  const heightMm = Number(formData.get("heightMm"));
  const fabricSource = String(formData.get("fabricSource") ?? "");
  const fabricName = String(formData.get("fabricName") ?? "");
  const controlType = String(formData.get("controlType") ?? "");
  const bracketTrackRaw = String(formData.get("bracketTrack") ?? "");
  const cassetteRaw = String(formData.get("cassette") ?? "");
  const sideChannels = formData.get("sideChannels") === "on";
  const linkChoice = String(formData.get("linkChoice") ?? "");
  const room = String(formData.get("room") ?? "").trim() || null;
  // Non-pricing fields -- see blindFamilies.ts's comment on
  // controlSidesList/baseStylesList. Carried through as extra attributes
  // only, the same way curtain's fitting/ctrlSide are.
  const lhCutOut = String(formData.get("lhCutOut") ?? "");
  const rhCutOut = String(formData.get("rhCutOut") ?? "");
  const controlSide = String(formData.get("controlSide") ?? "");
  const chainLength = String(formData.get("chainLength") ?? "");
  const fitting = String(formData.get("fitting") ?? "");
  const componentColour = String(formData.get("componentColour") ?? "");
  const fabricColour = String(formData.get("fabricColour") ?? "");
  const baseStyle = String(formData.get("baseStyle") ?? "");
  const roll = String(formData.get("roll") ?? "");

  const input: RollerBlindInput = {
    widthMm,
    heightMm,
    fabricSource,
    fabricName,
    controlType,
    bracketTrack: bracketTrackRaw || undefined,
    cassette: cassetteRaw === "Round" || cassetteRaw === "Square" ? cassetteRaw : undefined,
    sideChannels,
    linked: Boolean(linkChoice && linkChoice !== "None"),
  };

  const data = await loadBlindDataSource(db, "Roller");
  const result = priceRollerBlind(input, data);

  if (!result.ok) {
    throw new Error(
      result.reason === "fabric_not_found"
        ? "That fabric wasn't found in the price list -- pick a fabric source and name from the list."
        : "That width/height is larger than every published price band for this fabric group -- needs a manual price (see app README)."
    );
  }

  const [{ value: maxLine }] = await db
    .select({ value: max(schema.quoteLineItems.lineNumber) })
    .from(schema.quoteLineItems)
    .where(eq(schema.quoteLineItems.quoteId, quoteId));

  await db.insert(schema.quoteLineItems).values({
    quoteId,
    lineNumber: (maxLine ?? 0) + 1,
    room,
    familySlug: "roller",
    attributes: {
      ...input,
      linkChoice,
      lhCutOut,
      rhCutOut,
      controlSide,
      chainLength,
      fitting,
      componentColour,
      fabricColour,
      baseStyle,
      roll,
      enteredBy: user.email,
    },
    priceBreakdown: result.breakdown,
    calculatedPrice: String(result.breakdown.calculatedPrice),
    finalPrice: String(result.breakdown.calculatedPrice),
  });

  revalidatePath(`/quotes/${quoteId}`);
  redirect(`/quotes/${quoteId}`);
}

/** Shared by every family's updateXLineItem action below -- applies a
 * recomputed price/attributes to an existing line item in place (same
 * quoteId + lineNumber, nothing re-ordered) rather than duplicating this
 * update+redirect logic four times.
 *
 * A price override, once set via setPriceOverride, is a deliberate manual
 * decision -- editing the line's underlying attributes (e.g. correcting a
 * mistyped width) recomputes calculatedPrice, but must not silently discard
 * that override. finalPrice only follows the newly recomputed price when no
 * override is currently in effect, mirroring setPriceOverride's own
 * "overrideStr ?? item.calculatedPrice" precedence exactly. */
async function updateLineItemRow(
  quoteId: number,
  lineItemId: number,
  patch: {
    room: string | null;
    familySlug: string;
    attributes: Record<string, unknown>;
    priceBreakdown: object;
    calculatedPrice: number;
  }
) {
  const [existing] = await db
    .select()
    .from(schema.quoteLineItems)
    .where(and(eq(schema.quoteLineItems.id, lineItemId), eq(schema.quoteLineItems.quoteId, quoteId)));
  if (!existing) throw new Error("Line item not found.");

  await db
    .update(schema.quoteLineItems)
    .set({
      room: patch.room,
      familySlug: patch.familySlug,
      attributes: patch.attributes,
      priceBreakdown: patch.priceBreakdown,
      calculatedPrice: String(patch.calculatedPrice),
      finalPrice: existing.priceOverride ?? String(patch.calculatedPrice),
    })
    .where(eq(schema.quoteLineItems.id, lineItemId));

  revalidatePath(`/quotes/${quoteId}`);
  redirect(`/quotes/${quoteId}`);
}

export async function updateRollerLineItem(quoteId: number, lineItemId: number, formData: FormData) {
  const user = await requireUser();

  const widthMm = Number(formData.get("widthMm"));
  const heightMm = Number(formData.get("heightMm"));
  const fabricSource = String(formData.get("fabricSource") ?? "");
  const fabricName = String(formData.get("fabricName") ?? "");
  const controlType = String(formData.get("controlType") ?? "");
  const bracketTrackRaw = String(formData.get("bracketTrack") ?? "");
  const cassetteRaw = String(formData.get("cassette") ?? "");
  const sideChannels = formData.get("sideChannels") === "on";
  const linkChoice = String(formData.get("linkChoice") ?? "");
  const room = String(formData.get("room") ?? "").trim() || null;
  const lhCutOut = String(formData.get("lhCutOut") ?? "");
  const rhCutOut = String(formData.get("rhCutOut") ?? "");
  const controlSide = String(formData.get("controlSide") ?? "");
  const chainLength = String(formData.get("chainLength") ?? "");
  const fitting = String(formData.get("fitting") ?? "");
  const componentColour = String(formData.get("componentColour") ?? "");
  const fabricColour = String(formData.get("fabricColour") ?? "");
  const baseStyle = String(formData.get("baseStyle") ?? "");
  const roll = String(formData.get("roll") ?? "");

  const input: RollerBlindInput = {
    widthMm,
    heightMm,
    fabricSource,
    fabricName,
    controlType,
    bracketTrack: bracketTrackRaw || undefined,
    cassette: cassetteRaw === "Round" || cassetteRaw === "Square" ? cassetteRaw : undefined,
    sideChannels,
    linked: Boolean(linkChoice && linkChoice !== "None"),
  };

  const data = await loadBlindDataSource(db, "Roller");
  const result = priceRollerBlind(input, data);

  if (!result.ok) {
    throw new Error(
      result.reason === "fabric_not_found"
        ? "That fabric wasn't found in the price list -- pick a fabric source and name from the list."
        : "That width/height is larger than every published price band for this fabric group -- needs a manual price (see app README)."
    );
  }

  await updateLineItemRow(quoteId, lineItemId, {
    room,
    familySlug: "roller",
    attributes: {
      ...input,
      linkChoice,
      lhCutOut,
      rhCutOut,
      controlSide,
      chainLength,
      fitting,
      componentColour,
      fabricColour,
      baseStyle,
      roll,
      enteredBy: user.email,
    },
    priceBreakdown: result.breakdown,
    calculatedPrice: result.breakdown.calculatedPrice,
  });
}

export async function deleteLineItem(quoteId: number, lineItemId: number) {
  await requireUser();
  await db
    .delete(schema.quoteLineItems)
    .where(and(eq(schema.quoteLineItems.id, lineItemId), eq(schema.quoteLineItems.quoteId, quoteId)));
  revalidatePath(`/quotes/${quoteId}`);
}

/** Copies an existing line item to a new row at the end of the quote --
 * same room/attributes/price breakdown/override, nothing recomputed. For
 * quoting several near-identical windows (a common real workflow: three
 * roller blinds off the one fabric, just slightly different sizes) this
 * saves re-picking the fabric/source/control from scratch each time --
 * duplicate, then use Edit on the copy to change just what's different.
 * A literal copy, deliberately including any active price override: this
 * is "make another one just like this", not "reprice a similar item" --
 * clearing an override that shouldn't carry over is one click away via the
 * existing Override control on the new row. */
export async function duplicateLineItem(quoteId: number, lineItemId: number) {
  await requireUser();

  const [source] = await db
    .select()
    .from(schema.quoteLineItems)
    .where(and(eq(schema.quoteLineItems.id, lineItemId), eq(schema.quoteLineItems.quoteId, quoteId)));
  if (!source) throw new Error("Line item not found.");

  const [{ value: maxLine }] = await db
    .select({ value: max(schema.quoteLineItems.lineNumber) })
    .from(schema.quoteLineItems)
    .where(eq(schema.quoteLineItems.quoteId, quoteId));

  await db.insert(schema.quoteLineItems).values({
    quoteId,
    lineNumber: (maxLine ?? 0) + 1,
    room: source.room,
    familySlug: source.familySlug,
    attributes: source.attributes,
    priceBreakdown: source.priceBreakdown,
    calculatedPrice: source.calculatedPrice,
    priceOverride: source.priceOverride,
    priceOverrideReason: source.priceOverrideReason,
    finalPrice: source.finalPrice,
  });

  revalidatePath(`/quotes/${quoteId}`);
}

export async function setPriceOverride(quoteId: number, lineItemId: number, formData: FormData) {
  await requireUser();
  const override = formData.get("priceOverride");
  const reason = String(formData.get("priceOverrideReason") ?? "").trim();
  const overrideStr = override && String(override).trim() !== "" ? String(override) : null;

  if (overrideStr && !reason) {
    throw new Error("A reason is required when overriding a price.");
  }

  const [item] = await db
    .select()
    .from(schema.quoteLineItems)
    .where(and(eq(schema.quoteLineItems.id, lineItemId), eq(schema.quoteLineItems.quoteId, quoteId)));
  if (!item) throw new Error("Line item not found.");

  await db
    .update(schema.quoteLineItems)
    .set({
      priceOverride: overrideStr,
      priceOverrideReason: overrideStr ? reason : null,
      finalPrice: overrideStr ?? item.calculatedPrice,
    })
    .where(eq(schema.quoteLineItems.id, lineItemId));

  revalidatePath(`/quotes/${quoteId}`);
}

/** Cascading select: once the estimator picks a Fabric Source, fetch the
 * fabric names valid for it (client-side interaction after initial page
 * load, so this needs to be an action rather than a page-load DB read).
 * Shared by Roller and the five genericBlind.ts families -- fabric group
 * lookup isn't actually keyed by family in the source workbook (see
 * pricingDataSource.ts's comment), so this works unchanged for any of them. */
export async function getFabricNamesForSource(source: string): Promise<string[]> {
  await requireUser();
  if (!source) return [];
  const rows = await db
    .select({ fabricName: schema.blindFabricOptions.fabricName })
    .from(schema.blindFabricOptions)
    .where(eq(schema.blindFabricOptions.source, source));
  return rows.map((r) => r.fabricName).sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Venetian / Roman / Panel / Verishade / Vertical -- share genericBlind.ts's
// pricing engine and this pair of actions, parameterized by family slug
// (see src/lib/blindFamilies.ts). Roller stays on its own dedicated actions
// above since it has extra fields (cassette/side channels/links) none of
// these five have in the source data.

export async function previewGenericBlindPrice(
  familySlug: string,
  input: Omit<GenericBlindInput, "family">
): Promise<GenericBlindResult> {
  await requireUser();
  const config = getBlindFamilyConfig(familySlug);
  if (!config) throw new Error(`Unknown blind family "${familySlug}".`);
  const data = await loadBlindDataSource(db, config.pricingFamily);
  return priceGenericBlind({ family: config.pricingFamily, ...input }, data);
}

export async function addGenericBlindLineItem(quoteId: number, familySlug: string, formData: FormData) {
  const user = await requireUser();
  const config = getBlindFamilyConfig(familySlug);
  if (!config) throw new Error(`Unknown blind family "${familySlug}".`);

  const widthMm = Number(formData.get("widthMm"));
  const heightMm = Number(formData.get("heightMm"));
  const fabricSource = String(formData.get("fabricSource") ?? "");
  const fabricName = String(formData.get("fabricName") ?? "");
  const controlType = String(formData.get("controlType") ?? "");
  const bracketTrackRaw = String(formData.get("bracketTrack") ?? "");
  const room = String(formData.get("room") ?? "").trim() || null;
  // Non-pricing fields -- see blindFamilies.ts's comment on
  // controlSidesList/baseStylesList. Carried through as extra attributes
  // only, the same way curtain's fitting/ctrlSide are.
  const lhCutOut = String(formData.get("lhCutOut") ?? "");
  const rhCutOut = String(formData.get("rhCutOut") ?? "");
  const controlSide = String(formData.get("controlSide") ?? "");
  const fitting = String(formData.get("fitting") ?? "");
  const componentColour = String(formData.get("componentColour") ?? "");
  const fabricColour = String(formData.get("fabricColour") ?? "");
  const baseStyle = String(formData.get("baseStyle") ?? "");

  const input: Omit<GenericBlindInput, "family"> = {
    widthMm,
    heightMm,
    fabricSource,
    fabricName,
    controlType: controlType || undefined,
    bracketTrack: bracketTrackRaw || undefined,
  };

  const data = await loadBlindDataSource(db, config.pricingFamily);
  const result = priceGenericBlind({ family: config.pricingFamily, ...input }, data);

  if (!result.ok) {
    throw new Error(
      result.reason === "fabric_not_found"
        ? "That fabric wasn't found in the price list -- pick a fabric source and name from the list."
        : "That width/height is larger than every published price band for this fabric group -- needs a manual price (see app README)."
    );
  }

  const [{ value: maxLine }] = await db
    .select({ value: max(schema.quoteLineItems.lineNumber) })
    .from(schema.quoteLineItems)
    .where(eq(schema.quoteLineItems.quoteId, quoteId));

  await db.insert(schema.quoteLineItems).values({
    quoteId,
    lineNumber: (maxLine ?? 0) + 1,
    room,
    familySlug: config.slug,
    attributes: {
      ...input,
      lhCutOut,
      rhCutOut,
      controlSide,
      fitting,
      componentColour,
      fabricColour,
      baseStyle,
      enteredBy: user.email,
    },
    priceBreakdown: result.breakdown,
    calculatedPrice: String(result.breakdown.calculatedPrice),
    finalPrice: String(result.breakdown.calculatedPrice),
  });

  revalidatePath(`/quotes/${quoteId}`);
  redirect(`/quotes/${quoteId}`);
}

export async function updateGenericBlindLineItem(
  quoteId: number,
  lineItemId: number,
  familySlug: string,
  formData: FormData
) {
  const user = await requireUser();
  const config = getBlindFamilyConfig(familySlug);
  if (!config) throw new Error(`Unknown blind family "${familySlug}".`);

  const widthMm = Number(formData.get("widthMm"));
  const heightMm = Number(formData.get("heightMm"));
  const fabricSource = String(formData.get("fabricSource") ?? "");
  const fabricName = String(formData.get("fabricName") ?? "");
  const controlType = String(formData.get("controlType") ?? "");
  const bracketTrackRaw = String(formData.get("bracketTrack") ?? "");
  const room = String(formData.get("room") ?? "").trim() || null;
  const lhCutOut = String(formData.get("lhCutOut") ?? "");
  const rhCutOut = String(formData.get("rhCutOut") ?? "");
  const controlSide = String(formData.get("controlSide") ?? "");
  const fitting = String(formData.get("fitting") ?? "");
  const componentColour = String(formData.get("componentColour") ?? "");
  const fabricColour = String(formData.get("fabricColour") ?? "");
  const baseStyle = String(formData.get("baseStyle") ?? "");

  const input: Omit<GenericBlindInput, "family"> = {
    widthMm,
    heightMm,
    fabricSource,
    fabricName,
    controlType: controlType || undefined,
    bracketTrack: bracketTrackRaw || undefined,
  };

  const data = await loadBlindDataSource(db, config.pricingFamily);
  const result = priceGenericBlind({ family: config.pricingFamily, ...input }, data);

  if (!result.ok) {
    throw new Error(
      result.reason === "fabric_not_found"
        ? "That fabric wasn't found in the price list -- pick a fabric source and name from the list."
        : "That width/height is larger than every published price band for this fabric group -- needs a manual price (see app README)."
    );
  }

  await updateLineItemRow(quoteId, lineItemId, {
    room,
    familySlug: config.slug,
    attributes: {
      ...input,
      lhCutOut,
      rhCutOut,
      controlSide,
      fitting,
      componentColour,
      fabricColour,
      baseStyle,
      enteredBy: user.email,
    },
    priceBreakdown: result.breakdown,
    calculatedPrice: result.breakdown.calculatedPrice,
  });
}

// ---------------------------------------------------------------------------
// Sheer curtains -- curtain.ts's pricing engine isn't (yet) DB-backed like
// the blind families (see app/README.md's "What's not here yet"), so these
// actions call it with no injected data source -- same JSON-fixture-backed
// defaults curtain.test.ts's 11 real rows are validated against.

/** Curtain fabric selection is a different table (suppliers/fabrics -- the
 * $/metre library) from the blind families' fabric-group lookup, so it gets
 * its own cascading-select actions rather than reusing getFabricNamesForSource. */
export async function getCurtainFabricSuppliers(): Promise<string[]> {
  await requireUser();
  const rows = await db.select({ name: schema.suppliers.name }).from(schema.suppliers).orderBy(asc(schema.suppliers.name));
  return rows.map((r) => r.name);
}

export async function getCurtainFabricsForSupplier(
  supplierName: string
): Promise<{ name: string; pricePerMetre: number | null }[]> {
  await requireUser();
  if (!supplierName) return [];
  const [rows, sellPricePointsRaw] = await Promise.all([
    db
      .select({ name: schema.fabrics.name, pricePerMetre: schema.fabrics.pricePerMetre })
      .from(schema.fabrics)
      .innerJoin(schema.suppliers, eq(schema.fabrics.supplierId, schema.suppliers.id))
      .where(and(eq(schema.suppliers.name, supplierName), eq(schema.fabrics.active, true))),
    getOptionListValues(db, "SellPricePoints"),
  ]);
  const sellPricePoints = sellPricePointsRaw as number[];
  // active=true already excludes the null-pricePerMetre rows (see schema.ts's
  // comment on fabrics.pricePerMetre), but the DB column type is still
  // nullable, so narrow it here first.
  //
  // `fabrics.pricePerMetre` is the fabric's raw COST price (matches each
  // supplier sheet's own "Price" column exactly) -- Curtain Quote's own
  // "$ P/M" field is a computed SELL price (cost x2, rounded up to the
  // nearest published band), never the cost directly. Bringing the raw cost
  // across here was a real bug (reported by Clive) -- see
  // curtainFabricSellPrice.ts for the formula and why it can return null
  // (a small share of fabrics cost enough that no published band covers
  // them; those need a manually-entered price rather than a guess).
  return rows
    .filter((r): r is { name: string; pricePerMetre: string } => r.pricePerMetre !== null)
    .map((r) => ({
      name: r.name,
      pricePerMetre: computeCurtainFabricSellPrice(Number(r.pricePerMetre), sellPricePoints),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function previewCurtainPrice(input: CurtainInput): Promise<CurtainResult> {
  await requireUser();
  const data = await loadCurtainDataSource(db);
  return priceCurtain(input, data);
}

export async function addCurtainLineItem(quoteId: number, formData: FormData) {
  const user = await requireUser();

  const input: CurtainInput = {
    style: String(formData.get("style") ?? ""),
    liningInput: String(formData.get("liningInput") ?? "U") === "L" ? "L" : "U",
    finish: String(formData.get("finish") ?? ""),
    trackName: String(formData.get("trackName") ?? ""),
    pricePerMetre: Number(formData.get("pricePerMetre")),
    layout: String(formData.get("layout") ?? ""),
    leftReturnCm: Number(formData.get("leftReturnCm") ?? 0),
    rightReturnCm: Number(formData.get("rightReturnCm") ?? 0),
    overlapCm: formData.get("overlapCm") ? Number(formData.get("overlapCm")) : undefined,
    lpwCm: formData.get("lpwCm") ? Number(formData.get("lpwCm")) : undefined,
    wwCm: formData.get("wwCm") ? Number(formData.get("wwCm")) : undefined,
    rpwCm: formData.get("rpwCm") ? Number(formData.get("rpwCm")) : undefined,
    heightCm: Number(formData.get("heightCm")),
    hooks: String(formData.get("hooks") ?? ""),
    stack: String(formData.get("stack") ?? ""),
  };
  const fabricSupplier = String(formData.get("fabricSupplier") ?? "");
  const fabricName = String(formData.get("fabricName") ?? "");
  // Fitting/CTRL Side -- not pricing inputs (see CurtainLineItemForm's
  // Props comment), carried straight through to attributes for the
  // Curtain Install document.
  const fitting = String(formData.get("fitting") ?? "");
  const ctrlSide = String(formData.get("ctrlSide") ?? "");
  const room = String(formData.get("room") ?? "").trim() || null;

  const curtainData = await loadCurtainDataSource(db);
  const result = priceCurtain(input, curtainData);

  if (!result.ok) {
    const messages: Record<typeof result.reason, string> = {
      fullness_not_found: "That style isn't in the fullness table -- pick a style from the list.",
      track_length_exceeds_bands:
        "That track length is longer than every published price band for this track -- needs a manual price (a real, recurring case in the source data -- see app README).",
      unvalidated_style_variant:
        "This style's pricing formula hasn't been validated against real data yet (only sheer, non-\"OH\" styles are) -- needs a manual price for now. See app README.",
    };
    throw new Error(messages[result.reason]);
  }

  const [{ value: maxLine }] = await db
    .select({ value: max(schema.quoteLineItems.lineNumber) })
    .from(schema.quoteLineItems)
    .where(eq(schema.quoteLineItems.quoteId, quoteId));

  await db.insert(schema.quoteLineItems).values({
    quoteId,
    lineNumber: (maxLine ?? 0) + 1,
    room,
    familySlug: "s_wave_sheer",
    attributes: { ...input, fabricSupplier, fabricName, fitting, ctrlSide, enteredBy: user.email },
    priceBreakdown: result.breakdown,
    calculatedPrice: String(result.breakdown.calculatedPrice),
    finalPrice: String(result.breakdown.calculatedPrice),
  });

  revalidatePath(`/quotes/${quoteId}`);
  redirect(`/quotes/${quoteId}`);
}

export async function updateCurtainLineItem(quoteId: number, lineItemId: number, formData: FormData) {
  const user = await requireUser();

  const input: CurtainInput = {
    style: String(formData.get("style") ?? ""),
    liningInput: String(formData.get("liningInput") ?? "U") === "L" ? "L" : "U",
    finish: String(formData.get("finish") ?? ""),
    trackName: String(formData.get("trackName") ?? ""),
    pricePerMetre: Number(formData.get("pricePerMetre")),
    layout: String(formData.get("layout") ?? ""),
    leftReturnCm: Number(formData.get("leftReturnCm") ?? 0),
    rightReturnCm: Number(formData.get("rightReturnCm") ?? 0),
    overlapCm: formData.get("overlapCm") ? Number(formData.get("overlapCm")) : undefined,
    lpwCm: formData.get("lpwCm") ? Number(formData.get("lpwCm")) : undefined,
    wwCm: formData.get("wwCm") ? Number(formData.get("wwCm")) : undefined,
    rpwCm: formData.get("rpwCm") ? Number(formData.get("rpwCm")) : undefined,
    heightCm: Number(formData.get("heightCm")),
    hooks: String(formData.get("hooks") ?? ""),
    stack: String(formData.get("stack") ?? ""),
  };
  const fabricSupplier = String(formData.get("fabricSupplier") ?? "");
  const fabricName = String(formData.get("fabricName") ?? "");
  // Fitting/CTRL Side -- not pricing inputs (see CurtainLineItemForm's
  // Props comment), carried straight through to attributes for the
  // Curtain Install document.
  const fitting = String(formData.get("fitting") ?? "");
  const ctrlSide = String(formData.get("ctrlSide") ?? "");
  const room = String(formData.get("room") ?? "").trim() || null;

  const curtainData = await loadCurtainDataSource(db);
  const result = priceCurtain(input, curtainData);

  if (!result.ok) {
    const messages: Record<typeof result.reason, string> = {
      fullness_not_found: "That style isn't in the fullness table -- pick a style from the list.",
      track_length_exceeds_bands:
        "That track length is longer than every published price band for this track -- needs a manual price (a real, recurring case in the source data -- see app README).",
      unvalidated_style_variant:
        "This style's pricing formula hasn't been validated against real data yet (only sheer, non-\"OH\" styles are) -- needs a manual price for now. See app README.",
    };
    throw new Error(messages[result.reason]);
  }

  await updateLineItemRow(quoteId, lineItemId, {
    room,
    familySlug: "s_wave_sheer",
    attributes: { ...input, fabricSupplier, fabricName, fitting, ctrlSide, enteredBy: user.email },
    priceBreakdown: result.breakdown,
    calculatedPrice: result.breakdown.calculatedPrice,
  });
}

// ---------------------------------------------------------------------------
// Misc Quote items -- priceMisc() is a pure, synchronous normalizer with no
// DB dependency (see misc.ts), so unlike the blind/curtain families there's
// no separate "preview" action -- the client component calls priceMisc()
// directly, no round-trip needed for something this cheap to compute.

export async function addMiscLineItem(quoteId: number, formData: FormData) {
  const user = await requireUser();

  const description = String(formData.get("description") ?? "").trim();
  const additionalDetails = String(formData.get("additionalDetails") ?? "").trim() || undefined;
  const priceRaw = String(formData.get("price") ?? "").trim();
  const installTimeRaw = formData.get("installTimeMinutes");
  const room = String(formData.get("room") ?? "").trim() || null;

  const input: MiscInput = {
    description,
    additionalDetails,
    price: priceRaw === "" ? undefined : Number.isNaN(Number(priceRaw)) ? priceRaw : Number(priceRaw),
    installTimeMinutes: installTimeRaw ? Number(installTimeRaw) : undefined,
  };

  const result: MiscResult = priceMisc(input);
  if (!result.ok) {
    throw new Error(
      result.reason === "missing_description"
        ? "A description is required."
        : 'Price must be a number, "N/C", or left blank for a note-only line.'
    );
  }

  const [{ value: maxLine }] = await db
    .select({ value: max(schema.quoteLineItems.lineNumber) })
    .from(schema.quoteLineItems)
    .where(eq(schema.quoteLineItems.quoteId, quoteId));

  await db.insert(schema.quoteLineItems).values({
    quoteId,
    lineNumber: (maxLine ?? 0) + 1,
    room,
    familySlug: "misc",
    attributes: { ...input, enteredBy: user.email },
    priceBreakdown: result.breakdown,
    calculatedPrice: String(result.breakdown.calculatedPrice),
    finalPrice: String(result.breakdown.calculatedPrice),
  });

  revalidatePath(`/quotes/${quoteId}`);
  redirect(`/quotes/${quoteId}`);
}

export async function updateMiscLineItem(quoteId: number, lineItemId: number, formData: FormData) {
  const user = await requireUser();

  const description = String(formData.get("description") ?? "").trim();
  const additionalDetails = String(formData.get("additionalDetails") ?? "").trim() || undefined;
  const priceRaw = String(formData.get("price") ?? "").trim();
  const installTimeRaw = formData.get("installTimeMinutes");
  const room = String(formData.get("room") ?? "").trim() || null;

  const input: MiscInput = {
    description,
    additionalDetails,
    price: priceRaw === "" ? undefined : Number.isNaN(Number(priceRaw)) ? priceRaw : Number(priceRaw),
    installTimeMinutes: installTimeRaw ? Number(installTimeRaw) : undefined,
  };

  const result: MiscResult = priceMisc(input);
  if (!result.ok) {
    throw new Error(
      result.reason === "missing_description"
        ? "A description is required."
        : 'Price must be a number, "N/C", or left blank for a note-only line.'
    );
  }

  await updateLineItemRow(quoteId, lineItemId, {
    room,
    familySlug: "misc",
    attributes: { ...input, enteredBy: user.email },
    priceBreakdown: result.breakdown,
    calculatedPrice: result.breakdown.calculatedPrice,
  });
}
