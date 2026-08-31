"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import {
  addGenericBlindLineItem,
  getFabricNamesForSource,
  previewGenericBlindPrice,
  updateGenericBlindLineItem,
} from "@/lib/actions";
import type { GenericBlindResult } from "@/pricing/genericBlind";

export interface GenericBlindLineItemInitial {
  room: string;
  fabricSource: string;
  fabricName: string;
  widthMm: string;
  heightMm: string;
  controlType: string;
  bracketTrack: string;
  lhCutOut: string;
  rhCutOut: string;
  controlSide: string;
  fitting: string;
  componentColour: string;
  fabricColour: string;
  baseStyle: string;
}

interface Props {
  quoteId: number;
  familySlug: string;
  sources: string[];
  controlTypes: string[];
  bracketTrackOptions?: string[]; // only Panel has a bracket/track list -- see blindFamilies.ts
  bracketTrackLabel?: string;
  // Non-pricing fields shared by every blind form -- see blindFamilies.ts's
  // comment on controlSidesList/baseStylesList for why these don't feed the
  // price preview the way sources/controlTypes/bracketTrackOptions do.
  controlSides: string[];
  fittings: string[];
  componentColours: string[];
  baseStyles?: string[]; // only Panel has a base-style list -- see blindFamilies.ts
  // When set, the form edits this existing line item (via
  // updateGenericBlindLineItem) instead of creating a new one -- see
  // /quotes/[id]/line-items/[lineItemId]/edit/page.tsx.
  lineItemId?: number;
  initial?: GenericBlindLineItemInitial;
}

const BREAKDOWN_LABELS: Record<string, string> = {
  fabricGroup: "Fabric group",
  blindPricing: "Blind pricing",
  freight: "Freight",
  booster: "Booster (oversized)",
  cassettesCost: "Cassette",
  sideChannelsCost: "Side channels",
  tracksCost: "Track",
  bracketCost: "Bracket",
  linksCost: "Links",
  controlsCost: "Control",
  installationCost: "Installation",
};

export function GenericBlindLineItemForm({
  quoteId,
  familySlug,
  sources,
  controlTypes,
  bracketTrackOptions,
  bracketTrackLabel = "Bracket / track",
  controlSides,
  fittings,
  componentColours,
  baseStyles,
  lineItemId,
  initial,
}: Props) {
  const isEdit = lineItemId !== undefined;
  // Sources/control types with exactly one valid option are common in this
  // data (Venetian/Verishade/Vertical each have exactly one Fabric Source,
  // named after the family itself) -- auto-select rather than make the
  // estimator pick the only choice. This is the fix for the same failure
  // mode documented in honeycomb.ts: the source workbook left a single-
  // option Fabric Source blank often enough to break 5 real quote lines.
  const [fabricSource, setFabricSource] = useState(
    initial?.fabricSource ?? (sources.length === 1 ? sources[0] : "")
  );
  const [fabricNames, setFabricNames] = useState<string[]>([]);
  const [fabricName, setFabricName] = useState(initial?.fabricName ?? "");
  const [widthMm, setWidthMm] = useState(initial?.widthMm ?? "");
  const [heightMm, setHeightMm] = useState(initial?.heightMm ?? "");
  const [controlType, setControlType] = useState(
    initial?.controlType ?? (controlTypes.length === 1 ? controlTypes[0] : "")
  );
  const [bracketTrack, setBracketTrack] = useState(initial?.bracketTrack ?? "");
  const [room, setRoom] = useState(initial?.room ?? "");
  // Non-pricing fields -- see Props' comment above. No runPreview() call on
  // any of these onChange handlers: unlike fabricSource/controlType/etc.,
  // none of them appear in genericBlind.ts's pricing engine.
  const [lhCutOut, setLhCutOut] = useState(initial?.lhCutOut ?? "");
  const [rhCutOut, setRhCutOut] = useState(initial?.rhCutOut ?? "");
  const [controlSide, setControlSide] = useState(initial?.controlSide ?? "");
  const [fitting, setFitting] = useState(initial?.fitting ?? "");
  const [componentColour, setComponentColour] = useState(initial?.componentColour ?? "");
  const [fabricColour, setFabricColour] = useState(initial?.fabricColour ?? "");
  const [baseStyle, setBaseStyle] = useState(initial?.baseStyle ?? "");

  const [preview, setPreview] = useState<GenericBlindResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  // Auto-selected source needs its fabric names loaded on mount too, not
  // just on a user-driven change event -- and so does an edit's already-
  // chosen source, which also gets an initial preview so the current saved
  // price shows immediately rather than only after the next field change.
  useEffect(() => {
    if (fabricSource) {
      getFabricNamesForSource(fabricSource).then((names) => {
        setFabricNames(names);
        if (initial) runPreview();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSourceChange(source: string) {
    setFabricSource(source);
    setFabricName("");
    setPreview(null);
    if (!source) {
      setFabricNames([]);
      return;
    }
    const names = await getFabricNamesForSource(source);
    setFabricNames(names);
  }

  // See RollerLineItemForm.tsx's comment on this same pattern -- controlType
  // and bracketTrack's onChange handlers call runPreview() in the same event
  // as their own setState(), which hasn't taken effect yet, so without this
  // override the preview reads the PREVIOUS value: selecting a control type
  // (or, for Panel, a track) would leave the shown price/breakdown one
  // selection behind -- confirmed live on Roller's controlType before this
  // fix, and this form has the identical bug for the same reason. The line
  // item that gets SAVED is unaffected either way (the server action reads
  // fresh submitted form data, not this preview), but the on-screen number
  // during quoting was wrong until some other field changed.
  function runPreview(
    overrides: Partial<{
      fabricSource: string;
      fabricName: string;
      controlType: string;
      bracketTrack: string;
    }> = {}
  ) {
    const w = Number(widthMm);
    const h = Number(heightMm);
    const source = overrides.fabricSource ?? fabricSource;
    const name = overrides.fabricName ?? fabricName;
    const currentControlType = overrides.controlType ?? controlType;
    const currentBracketTrack = overrides.bracketTrack ?? bracketTrack;
    if (!source || !name || !w || !h) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    startPreview(async () => {
      setPreviewError(null);
      try {
        const result = await previewGenericBlindPrice(familySlug, {
          widthMm: w,
          heightMm: h,
          fabricSource: source,
          fabricName: name,
          controlType: currentControlType || undefined,
          bracketTrack: currentBracketTrack || undefined,
        });
        setPreview(result);
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : "Couldn't calculate a price preview.");
      }
    });
  }

  function handleSubmit(formData: FormData) {
    setSubmitError(null);
    startSubmit(async () => {
      try {
        if (isEdit) {
          await updateGenericBlindLineItem(quoteId, lineItemId, familySlug, formData);
        } else {
          await addGenericBlindLineItem(quoteId, familySlug, formData);
        }
      } catch (err) {
        if (err instanceof Error && err.message !== "NEXT_REDIRECT") {
          setSubmitError(err.message);
        }
      }
    });
  }

  return (
    <form action={handleSubmit}>
      <div className="field">
        <label htmlFor="room">Room</label>
        <input id="room" name="room" value={room} onChange={(e) => setRoom(e.target.value)} />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="fabricSource">Fabric source</label>
          {sources.length === 1 ? (
            <>
              <input value={sources[0]} disabled />
              <input type="hidden" name="fabricSource" value={sources[0]} />
            </>
          ) : (
            <select
              id="fabricSource"
              name="fabricSource"
              value={fabricSource}
              onChange={(e) => onSourceChange(e.target.value)}
              onBlur={() => runPreview()}
              required
            >
              <option value="">-- select --</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="field">
          <label htmlFor="fabricName">Fabric</label>
          <select
            id="fabricName"
            name="fabricName"
            value={fabricName}
            disabled={!fabricSource}
            onChange={(e) => {
              setFabricName(e.target.value);
              runPreview({ fabricName: e.target.value });
            }}
            required
          >
            <option value="">-- select --</option>
            {fabricNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="widthMm">Width (mm)</label>
          <input
            id="widthMm"
            name="widthMm"
            type="number"
            value={widthMm}
            onChange={(e) => setWidthMm(e.target.value)}
            onBlur={() => runPreview()}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="heightMm">Height (mm)</label>
          <input
            id="heightMm"
            name="heightMm"
            type="number"
            value={heightMm}
            onChange={(e) => setHeightMm(e.target.value)}
            onBlur={() => runPreview()}
            required
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="lhCutOut">LH cut out (mm)</label>
          <input
            id="lhCutOut"
            name="lhCutOut"
            type="number"
            value={lhCutOut}
            onChange={(e) => setLhCutOut(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="rhCutOut">RH cut out (mm)</label>
          <input
            id="rhCutOut"
            name="rhCutOut"
            type="number"
            value={rhCutOut}
            onChange={(e) => setRhCutOut(e.target.value)}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="controlType">Control type</label>
          {controlTypes.length === 1 ? (
            <>
              <input value={controlTypes[0]} disabled />
              <input type="hidden" name="controlType" value={controlTypes[0]} />
            </>
          ) : (
            <select
              id="controlType"
              name="controlType"
              value={controlType}
              onChange={(e) => {
                setControlType(e.target.value);
                runPreview({ controlType: e.target.value });
              }}
            >
              <option value="">-- none --</option>
              {controlTypes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
        {bracketTrackOptions && bracketTrackOptions.length > 0 && (
          <div className="field">
            <label htmlFor="bracketTrack">{bracketTrackLabel}</label>
            <select
              id="bracketTrack"
              name="bracketTrack"
              value={bracketTrack}
              onChange={(e) => {
                setBracketTrack(e.target.value);
                runPreview({ bracketTrack: e.target.value });
              }}
            >
              <option value="">-- none --</option>
              {bracketTrackOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="controlSide">Control side</label>
          <select
            id="controlSide"
            name="controlSide"
            value={controlSide}
            onChange={(e) => setControlSide(e.target.value)}
          >
            <option value="">-- none --</option>
            {controlSides.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="fitting">Fitting</label>
          <select id="fitting" name="fitting" value={fitting} onChange={(e) => setFitting(e.target.value)}>
            <option value="">-- none --</option>
            {fittings.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="componentColour">Component colour</label>
          <select
            id="componentColour"
            name="componentColour"
            value={componentColour}
            onChange={(e) => setComponentColour(e.target.value)}
          >
            <option value="">-- none --</option>
            {componentColours.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="fabricColour">Fabric colour</label>
          <input
            id="fabricColour"
            name="fabricColour"
            value={fabricColour}
            onChange={(e) => setFabricColour(e.target.value)}
          />
        </div>
      </div>

      {baseStyles && baseStyles.length > 0 && (
        <div className="field">
          <label htmlFor="baseStyle">Base style</label>
          <select id="baseStyle" name="baseStyle" value={baseStyle} onChange={(e) => setBaseStyle(e.target.value)}>
            <option value="">-- none --</option>
            {baseStyles.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      )}

      {previewError && <p className="error">{previewError}</p>}

      {preview && (
        <div className="price-preview">
          {isPreviewing && <span className="muted">Recalculating...</span>}
          {preview.ok ? (
            <>
              <div className="total-row" style={{ fontSize: 16, borderTop: "none", marginTop: 0, paddingTop: 0 }}>
                <span>Price</span>
                <span>${preview.breakdown.calculatedPrice.toFixed(2)}</span>
              </div>
              <dl>
                {Object.entries(preview.breakdown)
                  .filter(([k, v]) => k !== "calculatedPrice" && !(typeof v === "number" && v === 0 && k !== "fabricGroup"))
                  .map(([k, v]) => (
                    <Fragment key={k}>
                      <dt>{BREAKDOWN_LABELS[k] ?? k}</dt>
                      <dd>{k === "fabricGroup" ? v : `$${Number(v).toFixed(2)}`}</dd>
                    </Fragment>
                  ))}
              </dl>
            </>
          ) : (
            <p className="error" style={{ margin: 0 }}>
              {preview.reason === "fabric_not_found"
                ? "Fabric not found in the price list."
                : "Width/height exceeds every published price band for this fabric group -- needs a manual price."}
            </p>
          )}
        </div>
      )}

      {submitError && <p className="error">{submitError}</p>}

      <button className="btn" type="submit" disabled={isSubmitting || !preview?.ok}>
        {isSubmitting ? "Saving..." : isEdit ? "Save changes" : "Add line item"}
      </button>
    </form>
  );
}
