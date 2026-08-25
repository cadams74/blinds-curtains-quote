"use client";

import { Fragment, useState, useTransition } from "react";
import { addRollerLineItem, getFabricNamesForSource, previewRollerPrice } from "@/lib/actions";
import type { RollerBlindResult } from "@/pricing/roller";

interface Props {
  quoteId: number;
  sources: string[];
  brackets: string[];
  cassettes: string[];
  channels: string[];
  links: string[];
  controlTypes: string[];
}

const BREAKDOWN_LABELS: Record<string, string> = {
  fabricGroup: "Fabric group",
  blindPricing: "Blind pricing",
  freight: "Freight",
  booster: "Booster (oversized)",
  cassettesCost: "Cassette",
  sideChannelsCost: "Side channels",
  tracksCost: "Track",
  rollerBracketsCost: "Bracket",
  linksCost: "Links",
  controlsCost: "Control",
  installationCost: "Installation",
};

export function RollerLineItemForm({ quoteId, sources, brackets, cassettes, channels, links, controlTypes }: Props) {
  const [fabricSource, setFabricSource] = useState("");
  const [fabricNames, setFabricNames] = useState<string[]>([]);
  const [fabricName, setFabricName] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [controlType, setControlType] = useState("");
  const [bracketTrack, setBracketTrack] = useState("");
  const [cassette, setCassette] = useState("");
  const [sideChannels, setSideChannels] = useState(false);
  const [linkChoice, setLinkChoice] = useState("");
  const [room, setRoom] = useState("");

  const [preview, setPreview] = useState<RollerBlindResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

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
        const result = await previewRollerPrice({
          widthMm: w,
          heightMm: h,
          fabricSource: source,
          fabricName: name,
          controlType,
          bracketTrack: bracketTrack || undefined,
          cassette: cassette === "Round" || cassette === "Square" ? cassette : undefined,
          sideChannels,
          linked: Boolean(linkChoice && linkChoice !== ""),
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
        await addRollerLineItem(quoteId, formData);
      } catch (err) {
        // NEXT_REDIRECT throws internally on success -- only a real error
        // reaches here with a message.
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
          <select
            id="fabricSource"
            name="fabricSource"
            value={fabricSource}
            onChange={(e) => {
              onSourceChange(e.target.value);
            }}
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
        </div>
        <div className="field">
          <label htmlFor="bracketTrack">Bracket / track</label>
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
            {brackets.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="cassette">Cassette</label>
          <select
            id="cassette"
            name="cassette"
            value={cassette}
            onChange={(e) => {
              setCassette(e.target.value);
              runPreview();
            }}
          >
            <option value="">-- none --</option>
            {cassettes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="linkChoice">Linked</label>
          <select
            id="linkChoice"
            name="linkChoice"
            value={linkChoice}
            onChange={(e) => {
              setLinkChoice(e.target.value);
              runPreview();
            }}
          >
            <option value="">No</option>
            {links.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            name="sideChannels"
            checked={sideChannels}
            style={{ width: "auto" }}
            onChange={(e) => {
              setSideChannels(e.target.checked);
              runPreview();
            }}
          />
          Side channels ({channels.join("/")})
        </label>
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
                  .filter(([k]) => k !== "calculatedPrice")
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
