import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { PrintButton } from "@/components/PrintButton";
import { GridPrintFit } from "@/components/GridPrintFit";
import { BLIND_TYPE_LABELS } from "@/lib/blindFamilies";
import * as schema from "@/db/schema";

// Shared print-grid for the Roller, Venetian, and Roman Order Forms --
// mirrors the source workbook's "Roller Order Form" / "Venetian Order
// Form" / "Roman Order Form" sheets, which all share one identical header
// row (row 5, columns B:V) even though each one's own FILTER() formula
// pulls a different subset of 'Blind Quote' rows. Reuses Blind Grid's
// exact BlindAttrs/BlindBreakdown attribute shape and its isRoller-gated
// column treatment (Chain Length/Linked/Roll/Cassette/Side Channels only
// ever have a source-data dropdown for Roller in the workbook) since these
// order forms draw from the very same 'Blind Quote' data.
//
// Column labels use each order form sheet's OWN literal header text where
// it differs from Blind Grid's -- "Crtl" instead of "Control Side" and
// "Control Type/Accessory" instead of "Control Type" -- the same
// current-sheet-wins precedent already used for Track Order Form's
// "Track/Accessory" column. No Price column: like Track Order Form, this
// is a purchasing document, not a pricing review, and the source sheets
// themselves have no price column either.
//
// Print machinery (GridPrintFit, .grid-print-page, .grid-table/.grid-scroll)
// is the exact same reused pieces as Curtain Grid, Blind Grid, and Track
// Order Form -- landscape, zoom-shrink-to-fit on print.
export interface BlindAttrs {
  fabricSource?: string;
  fabricName?: string;
  widthMm?: string | number;
  heightMm?: string | number;
  controlType?: string;
  bracketTrack?: string;
  cassette?: string;
  sideChannels?: boolean;
  linkChoice?: string;
  lhCutOut?: string | number;
  rhCutOut?: string | number;
  controlSide?: string;
  chainLength?: string;
  fitting?: string;
  componentColour?: string;
  fabricColour?: string;
  baseStyle?: string;
  roll?: string;
}

export interface BlindBreakdown {
  fabricGroup?: number;
}

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === "") return "--";
  return String(v);
}

export interface BlindOrderFormProps {
  quoteId: number;
  quoteNumber: string;
  customerName: string;
  title: string;
  lineItems: (typeof schema.quoteLineItems.$inferSelect)[];
  emptyMessage: string;
}

export function BlindOrderForm({
  quoteId,
  quoteNumber,
  customerName,
  title,
  lineItems,
  emptyMessage,
}: BlindOrderFormProps) {
  return (
    <>
      <Topbar />
      <GridPrintFit />
      <div className="page grid-print-page" style={{ maxWidth: 1400 }}>
        <div className="no-print" style={{ marginBottom: 16 }}>
          <Link href={`/quotes/${quoteId}`}>&larr; Back to {quoteNumber}</Link>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element -- same
                static /public asset Topbar.tsx uses; a letterhead on a
                printed page, not an optimizable content image. */}
            <img
              src="/logo.png"
              alt="Unique Curtains + Blinds"
              style={{ height: 36, display: "block", marginBottom: 12 }}
            />
            <h1 style={{ marginBottom: 2 }}>{title}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {quoteNumber} -- {customerName}
            </p>
          </div>
          <PrintButton />
        </div>

        {lineItems.length === 0 ? (
          <div className="card" style={{ marginTop: 20 }}>
            <p className="muted" style={{ margin: 0 }}>
              {emptyMessage}
            </p>
          </div>
        ) : (
          <div className="grid-scroll" style={{ marginTop: 20 }}>
            <table className="grid-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Room</th>
                  <th>Blind Type</th>
                  <th>Width</th>
                  <th>Height</th>
                  <th>LH Cut Out</th>
                  <th>RH Cut Out</th>
                  <th>Crtl</th>
                  <th>Control Type/Accessory</th>
                  <th>Chain Length</th>
                  <th>Linked</th>
                  <th>Fitting</th>
                  <th>Component Colour</th>
                  <th>Fabric Source</th>
                  <th>Fabric Name</th>
                  <th>Grp</th>
                  <th>Fabric Colour</th>
                  <th>Base Style</th>
                  <th>Roll</th>
                  <th>Bracket/Track</th>
                  <th>Cassette</th>
                  <th>Side Channels</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li) => {
                  const attrs = li.attributes as BlindAttrs;
                  const breakdown = li.priceBreakdown as BlindBreakdown;
                  const isRoller = li.familySlug === "roller";
                  return (
                    <tr key={li.id}>
                      <td>
                        <Link href={`/quotes/${quoteId}/line-items/${li.id}/edit`}>{li.lineNumber}</Link>
                      </td>
                      <td>{fmt(li.room)}</td>
                      <td>{BLIND_TYPE_LABELS[li.familySlug] ?? li.familySlug}</td>
                      <td>{fmt(attrs.widthMm)}</td>
                      <td>{fmt(attrs.heightMm)}</td>
                      <td>{fmt(attrs.lhCutOut)}</td>
                      <td>{fmt(attrs.rhCutOut)}</td>
                      <td>{fmt(attrs.controlSide)}</td>
                      <td>{fmt(attrs.controlType)}</td>
                      <td className={isRoller ? undefined : "muted"}>
                        {isRoller ? fmt(attrs.chainLength) : "--"}
                      </td>
                      <td className={isRoller ? undefined : "muted"}>
                        {isRoller ? fmt(attrs.linkChoice) : "--"}
                      </td>
                      <td>{fmt(attrs.fitting)}</td>
                      <td>{fmt(attrs.componentColour)}</td>
                      <td>{fmt(attrs.fabricSource)}</td>
                      <td>{fmt(attrs.fabricName)}</td>
                      <td>{fmt(breakdown.fabricGroup)}</td>
                      <td>{fmt(attrs.fabricColour)}</td>
                      <td>{fmt(attrs.baseStyle)}</td>
                      <td className={isRoller ? undefined : "muted"}>{isRoller ? fmt(attrs.roll) : "--"}</td>
                      <td>{fmt(attrs.bracketTrack)}</td>
                      <td className={isRoller ? undefined : "muted"}>
                        {isRoller ? fmt(attrs.cassette) : "--"}
                      </td>
                      <td className={isRoller ? undefined : "muted"}>
                        {isRoller ? (attrs.sideChannels ? "Yes" : "No") : "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
