/**
 * The per-quote document/grid views (Curtain Install, Blind Install,
 * Curtain Grid, Blind Grid, and whatever comes next) that show as a row
 * of buttons at the top of a quote's own page (quotes/[id]/page.tsx), each
 * one only when the quote actually has line items it applies to.
 *
 * These used to live on the dashboard (one row under each quote in the
 * list), but Clive asked for them moved to the quote screen itself instead
 * -- and asked that every future view (install sheets etc.) follow the
 * same pattern from here on. Adding a new one is: write its route under
 * quotes/[id]/<path>/page.tsx, then add one entry here. Nothing else
 * (dashboard, quote page) needs to change.
 */
import { ALL_BLIND_FAMILY_SLUGS } from "./blindFamilies";

export interface QuoteLineItemFamily {
  familySlug: string;
}

export interface QuoteViewConfig {
  key: string;
  label: string;
  // URL segment under /quotes/[id]/ -- e.g. "curtain-install".
  path: string;
  appliesTo: (lineItems: QuoteLineItemFamily[]) => boolean;
}

const hasCurtainLine = (lineItems: QuoteLineItemFamily[]) =>
  lineItems.some((li) => li.familySlug === "s_wave_sheer");

const hasBlindLine = (lineItems: QuoteLineItemFamily[]) =>
  lineItems.some((li) => ALL_BLIND_FAMILY_SLUGS.includes(li.familySlug));

// Roller Order Form aggregates Roller + Panel + Vertical in the source
// workbook (see blind-roller-order/page.tsx's header comment) -- Verishade
// has no order form anywhere in the source workbook at all, so it's never
// included in any of these three predicates.
const hasRollerOrderLine = (lineItems: QuoteLineItemFamily[]) =>
  lineItems.some((li) => ["roller", "panel", "vertical"].includes(li.familySlug));

const hasVenetianLine = (lineItems: QuoteLineItemFamily[]) =>
  lineItems.some((li) => li.familySlug === "venetian");

const hasRomanLine = (lineItems: QuoteLineItemFamily[]) =>
  lineItems.some((li) => li.familySlug === "roman");

export const QUOTE_VIEWS: QuoteViewConfig[] = [
  {
    key: "curtain-install",
    label: "Curtain Install",
    path: "curtain-install",
    appliesTo: hasCurtainLine,
  },
  {
    key: "blind-install",
    label: "Blind Install",
    path: "blind-install",
    appliesTo: hasBlindLine,
  },
  {
    key: "curtain-making",
    label: "Curtain Making",
    path: "curtain-making",
    appliesTo: hasCurtainLine,
  },
  {
    key: "curtain-fabric-order",
    label: "Fabric Order",
    path: "curtain-fabric-order",
    appliesTo: hasCurtainLine,
  },
  {
    key: "curtain-track-order",
    label: "Track Order",
    path: "curtain-track-order",
    appliesTo: hasCurtainLine,
  },
  {
    key: "curtain-grid",
    label: "Curtain Grid",
    path: "curtain-grid",
    appliesTo: hasCurtainLine,
  },
  {
    key: "blind-grid",
    label: "Blind Grid",
    path: "blind-grid",
    appliesTo: hasBlindLine,
  },
  {
    key: "blind-roller-order",
    label: "Roller Order",
    path: "blind-roller-order",
    appliesTo: hasRollerOrderLine,
  },
  {
    key: "blind-venetian-order",
    label: "Venetian Order",
    path: "blind-venetian-order",
    appliesTo: hasVenetianLine,
  },
  {
    key: "blind-roman-order",
    label: "Roman Order",
    path: "blind-roman-order",
    appliesTo: hasRomanLine,
  },
];
