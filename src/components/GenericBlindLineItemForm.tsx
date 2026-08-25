"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { addGenericBlindLineItem, getFabricNamesForSource, previewGenericBlindPrice } from "@/lib/actions";
import type { GenericBlindResult } from "@/pricing/genericBlind";

interface Props {
  quoteId: number;
  familySlug: string;
  sources: string[];
  controlTypes: string[];
  bracketTrackOptions?: string[]; // only Panel has a bracket/track list -- see blindFamilies.ts
  bracketTrackLabel?: string;
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
}: Props) {
  // Sources/control types with exactly one valid option are common in this
  // data (Venetian/Verishade/Vertical each have exactly one Fabric Source,
  // named after the family itself) -- auto-select rather than make the
  // estimator pick the only choice. This is the fix for the same failure
  // mode documented in honeycomb.ts: the source workbook left a single-
  // option Fabric Source blank often enough to break 5 real quote lines.
  const [fabricSource, setFabricSource] = useState(sources.length === 1 ? sources[0] : "");
  const [fabricNames, setFabricNames] = useState<string[]>([]);
  const [fabricName, setFabricName] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [controlType, setControlType] = useState(controlTypes.length === 1 ? controlTypes[0] : "");
  const [bracketTrack, setBracketTrack] = useState("");
  const [room, setRoom] = useState("");

  const [preview, setPreview] = useState<GenericBlindResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  // Auto-selected source needs its fabric names loaded on mount too, not
  // just on a user-driven change event.
  useEffect(() => {
    if (fabricSource) getFabricNamesForSource(fabricSource).then(setFabricNames);
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

  function runPreview(overrides: Partial<{ fabricSource: string; fabricName: string }> = {}) {
    const w = Number(widthMm);
    const h = Number(heightMm);
    const source = overrides.fabricSource ?? fabricSource;
    const name = overrides.fabricName ?? fabricName;
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
          controlType: controlType || undefined,
          bracketTrack: bracketTrack || undefined,
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
        await addGenericBlindLineItem(quoteId, familySlug, formData);
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
                runPreview();
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
                runPreview();
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
        {isSubmitting ? "Saving..." : "Add line item"}
      </button>
    </form>
  );
}
