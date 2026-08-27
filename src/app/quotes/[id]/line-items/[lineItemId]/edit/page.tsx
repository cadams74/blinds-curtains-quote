import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { RollerLineItemForm } from "@/components/RollerLineItemForm";
import { GenericBlindLineItemForm } from "@/components/GenericBlindLineItemForm";
import { CurtainLineItemForm } from "@/components/CurtainLineItemForm";
import { MiscLineItemForm } from "@/components/MiscLineItemForm";
import { getOptionListValues } from "@/lib/pricingDataSource";
import { getBlindFamilyConfig } from "@/lib/blindFamilies";
import { getCurtainFabricSuppliers } from "@/lib/actions";
import { getCurtainHookNames } from "@/lib/curtainDataSource";

export const dynamic = "force-dynamic";

// A single shared edit route for every family, branching on the existing
// line item's own family_slug, rather than four separate route trees
// mirroring .../new/roller, .../new/curtain, .../new/misc, .../new/[family]
// -- there's nothing family-specific about the URL itself (unlike "new",
// which needs the estimator to pick a family first), so there's no reason
// to ask for one again here. Each branch reuses the exact same option-list
// loading and form component as its "new" counterpart, just with lineItemId
// and initial (parsed from the stored attributes/room) passed through so
// the form edits in place instead of creating a new row -- see each form's
// updateXLineItem call in src/lib/actions.ts.
function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

export default async function EditLineItemPage({
  params,
}: {
  params: Promise<{ id: string; lineItemId: string }>;
}) {
  const { id, lineItemId: lineItemIdStr } = await params;
  const quoteId = Number(id);
  const lineItemId = Number(lineItemIdStr);
  if (!Number.isInteger(quoteId) || !Number.isInteger(lineItemId)) notFound();

  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) notFound();

  const [lineItem] = await db
    .select()
    .from(schema.quoteLineItems)
    .where(and(eq(schema.quoteLineItems.id, lineItemId), eq(schema.quoteLineItems.quoteId, quoteId)));
  if (!lineItem) notFound();

  const attrs = lineItem.attributes as Record<string, unknown>;
  const room = lineItem.room ?? "";
  const quoteHeader = (
    <p className="muted">
      {quote.quoteNumber} -- {quote.customerName}
    </p>
  );

  if (lineItem.familySlug === "roller") {
    const [sources, brackets, cassettes, channels, links, controlTypes] = await Promise.all([
      getOptionListValues(db, "RollerSources"),
      getOptionListValues(db, "RollerBrackets"),
      getOptionListValues(db, "RollerCassettes"),
      getOptionListValues(db, "RollerChannels"),
      getOptionListValues(db, "RollerLinks"),
      getOptionListValues(db, "RollerControlTypes"),
    ]);

    return (
      <>
        <Topbar />
        <div className="page" style={{ maxWidth: 640 }}>
          <h1>Edit Roller Blind</h1>
          {quoteHeader}
          <div className="card">
            <RollerLineItemForm
              quoteId={quoteId}
              lineItemId={lineItemId}
              sources={sources as string[]}
              brackets={brackets as string[]}
              cassettes={cassettes as string[]}
              channels={channels as string[]}
              links={links as string[]}
              controlTypes={controlTypes as string[]}
              initial={{
                room,
                fabricSource: str(attrs.fabricSource),
                fabricName: str(attrs.fabricName),
                widthMm: str(attrs.widthMm),
                heightMm: str(attrs.heightMm),
                controlType: str(attrs.controlType),
                bracketTrack: str(attrs.bracketTrack),
                cassette: str(attrs.cassette),
                sideChannels: Boolean(attrs.sideChannels),
                linkChoice: str(attrs.linkChoice),
              }}
            />
          </div>
        </div>
      </>
    );
  }

  if (lineItem.familySlug === "s_wave_sheer") {
    const [styles, finishes, tracks, layouts, suppliers, hooks, stacks, fittings, ctrlSides] =
      await Promise.all([
        getOptionListValues(db, "Styles"),
        getOptionListValues(db, "Finish"),
        getOptionListValues(db, "Tracks"),
        getOptionListValues(db, "Layouts"),
        getCurtainFabricSuppliers(),
        getCurtainHookNames(db),
        getOptionListValues(db, "Stacks"),
        getOptionListValues(db, "Fittings"),
        getOptionListValues(db, "Controls"),
      ]);

    return (
      <>
        <Topbar />
        <div className="page" style={{ maxWidth: 640 }}>
          <h1>Edit Curtain</h1>
          {quoteHeader}
          <div className="card">
            <CurtainLineItemForm
              quoteId={quoteId}
              lineItemId={lineItemId}
              styles={styles as string[]}
              finishes={finishes as string[]}
              tracks={tracks as string[]}
              layouts={layouts as string[]}
              hooks={hooks}
              stacks={stacks as string[]}
              fittings={fittings as string[]}
              ctrlSides={ctrlSides as string[]}
              suppliers={suppliers}
              initial={{
                room,
                style: str(attrs.style),
                liningInput: attrs.liningInput === "L" ? "L" : "U",
                finish: str(attrs.finish),
                trackName: str(attrs.trackName),
                fabricSupplier: str(attrs.fabricSupplier),
                fabricName: str(attrs.fabricName),
                pricePerMetre: str(attrs.pricePerMetre),
                layout: str(attrs.layout),
                hooksValue: str(attrs.hooks),
                stack: str(attrs.stack),
                fitting: str(attrs.fitting),
                ctrlSide: str(attrs.ctrlSide),
                leftReturnCm: str(attrs.leftReturnCm),
                rightReturnCm: str(attrs.rightReturnCm),
                overlapCm: str(attrs.overlapCm),
                lpwCm: str(attrs.lpwCm),
                wwCm: str(attrs.wwCm),
                rpwCm: str(attrs.rpwCm),
                heightCm: str(attrs.heightCm),
              }}
            />
          </div>
        </div>
      </>
    );
  }

  if (lineItem.familySlug === "misc") {
    return (
      <>
        <Topbar />
        <div className="page" style={{ maxWidth: 560 }}>
          <h1>Edit Misc Quote item</h1>
          {quoteHeader}
          <div className="card">
            <MiscLineItemForm
              quoteId={quoteId}
              lineItemId={lineItemId}
              initial={{
                room,
                description: str(attrs.description),
                additionalDetails: str(attrs.additionalDetails),
                price: str(attrs.price),
                installTimeMinutes: str(attrs.installTimeMinutes),
              }}
            />
          </div>
        </div>
      </>
    );
  }

  // Venetian / Roman / Panel / Verishade / Vertical -- share genericBlind.ts's
  // engine and this one form (see blindFamilies.ts).
  const config = getBlindFamilyConfig(lineItem.familySlug);
  if (!config) notFound();

  const [sources, controlTypes, bracketTrackOptions] = await Promise.all([
    getOptionListValues(db, config.sourcesList),
    getOptionListValues(db, config.controlTypesList),
    config.bracketTrackList ? getOptionListValues(db, config.bracketTrackList) : Promise.resolve([]),
  ]);

  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 640 }}>
        <h1>Edit {config.label}</h1>
        {quoteHeader}
        <div className="card">
          <GenericBlindLineItemForm
            quoteId={quoteId}
            lineItemId={lineItemId}
            familySlug={config.slug}
            sources={sources as string[]}
            controlTypes={controlTypes as string[]}
            bracketTrackOptions={config.bracketTrackList ? (bracketTrackOptions as string[]) : undefined}
            bracketTrackLabel={config.slug === "panel" ? "Track / panel config" : "Bracket / track"}
            initial={{
              room,
              fabricSource: str(attrs.fabricSource),
              fabricName: str(attrs.fabricName),
              widthMm: str(attrs.widthMm),
              heightMm: str(attrs.heightMm),
              controlType: str(attrs.controlType),
              bracketTrack: str(attrs.bracketTrack),
            }}
          />
        </div>
      </div>
    </>
  );
}
