"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import {
  addRollerLineItem,
  getFabricNamesForSource,
  previewRollerPrice,
  updateRollerLineItem,
} from "@/lib/actions";
import type { RollerBlindResult } from "@/pricing/roller";

export interface RollerLineItemInitial {
  room: string;
  fabricSource: string;
  fabricName: string;
  widthMm: string;
  heightMm: string;
  controlType: string;
  bracketTrack: string;
  cassette: string;
  sideChannels: boolean;
  linkChoice: string;
  lhCutOut: string;
  rhCutOut: string;
  controlSide: string;
  chainLength: string;
  fitting: string;
  componentColour: string;
  fabricColour: string;
  baseStyle: string;
  roll: string;
}

interface Props {
  quoteId: number;
  sources: string[];
  brackets: string[];
  cassettes: string[];
  channels: string[];
  links: string[];
  controlTypes: string[];
  // Non-pricing fields, extracted from the Blind Quote sheet the same way
  // curtain's Fitting/Ctrl Side were -- none of these feed priceRollerBlind(),
  // see blindFamilies.ts's comment for the full explanation. Chain Length and
  // Roll are Roller-only in the source workbook (no other family has a
  // ChainLengths/Rolls named range); Base Style is shared with Panel.
  controlSides: string[];
  chainLengths: string[];
  fittings: string[];
  componentColours: string[];
  baseStyles: string[];
  rolls: string[];
  // When set, the form edits this existing line item (via
  // updateRollerLineItem) instead of creating a new one -- see
  // /quotes/[id]/line-items/[lineItemId]/edit/page.tsx.
  lineItemId?: number;
  initial?: RollerLineItemInitial;
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

export function RollerLineItemForm({
  quoteId,
  sources,
  brackets,
  cassettes,
  channels,
  links,
  controlTypes,
  controlSides,
  chainLengths,
  fittings,
  componentColours,
  baseStyles,
  rolls,
  lineItemId,
  initial,
}: Props) {
  const isEdit = lineItemId !== undefined;
  const [fabricSource, setFabricSource] = useState(initial?.fabricSource ?? "");
  const [fabricNames, setFabricNames] = useState<string[]>([]);
  const [fabricName, setFabricName] = useState(initial?.fabricName ?? "");
  const [widthMm, setWidthMm] = useState(initial?.widthMm ?? "");
  const [heightMm, setHeightMm] = useState(initial?.heightMm ?? "");
  const [controlType, setControlType] = useState(initial?.controlType ?? "");
  const [bracketTrack, setBracketTrack] = useState(initial?.bracketTrack ?? "");
  const [cassette, setCassette] = useState(initial?.cassette ?? "");
  const [sideChannels, setSideChannels] = useState(initial?.sideChannels ?? false);
  const [linkChoice, setLinkChoice] = useState(initial?.linkChoice ?? "");
  const [room, setRoom] = useState(initial?.room ?? "");
  // Non-pricing fields -- see Props' comment above. No runPreview() call on
  // any of these onChange handlers: none of them appear in roller.ts's
  // pricing engine.
  const [lhCutOut, setLhCutOut] = useState(initial?.lhCutOut ?? "");
  const [rhCutOut, setRhCutOut] = useState(initial?.rhCutOut ?? "");
  const [controlSide, setControlSide] = useState(initial?.controlSide ?? "");
  const [chainLength, setChainLength] = useState(initial?.chainLength ?? "");
  const [fitting, setFitting] = useState(initial?.fitting ?? "");
  const [componentColour, setComponentColour] = useState(initial?.componentColour ?? "");
  const [fabricColour, setFabricColour] = useState(initial?.fabricColour ?? "");
  const [baseStyle, setBaseStyle] = useState(initial?.baseStyle ?? "");
  const [roll, setRoll] = useState(initial?.roll ?? "");

  const [preview, setPreview] = useState<RollerBlindResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  // Editing starts with a fabric source already chosen -- load its fabric
  // names on mount (same reasoning as GenericBlindLineItemForm's
  // single-option auto-select effect) and run an initial preview so the
  // current saved price shows immediately rather than only after the next
  // field change.
  useEffect(() => {
    if (initial?.fabricSource) {
      getFabricNamesForSource(initial.fabricSource).then((names) => {
        setFabricNames(names);
        runPreview();
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

  // Every field below is a controlled input whose onChange both updates its
  // own state AND immediately calls runPreview() to refresh the live price --
  // but setState() doesn't take effect until the next render, so a field read
  // from the closed-over state variable (fabricSource, controlType, etc.)
  // inside a preview triggered from that same onChange sees the PREVIOUS
  // value, one interaction behind. Found in production: selecting a
  // motorised Roller control (e.g. "Sonesse RTS 3/30 (M)", a real $550 cost)
  // left the preview's Control line and total showing $0.00 -- as if the
  // control wasn't priced at all -- until some other field's change (or a
  // blur) triggered a fresh preview. The line item that actually got SAVED
  // was correctly priced regardless (the server action re-reads the
  // submitted form data fresh, not this stale client preview), but a
  // misleading on-screen total is still a real bug -- an estimator has no
  // reason to trust a number that's about to change. Every changed field is
  // passed in here explicitly instead, the same fix fabricSource/fabricName
  // already used for the same reason.
  function runPreview(
    overrides: Partial<{
      fabricSource: string;
      fabricName: string;
      controlType: string;
      bracketTrack: string;
      cassette: string;
      linkChoice: string;
      sideChannels: boolean;
    }> = {}
  ) {
    const w = Number(widthMm);
    const h = Number(heightMm);
    const source = overrides.fabricSource ?? fabricSource;
    const name = overrides.fabricName ?? fabricName;
    const currentControlType = overrides.controlType ?? controlType;
    const currentBracketTrack = overrides.bracketTrack ?? bracketTrack;
    const currentCassette = overrides.cassette ?? cassette;
    const currentLinkChoice = overrides.linkChoice ?? linkChoice;
    const currentSideChannels = overrides.sideChannels ?? sideChannels;
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
          controlType: currentControlType,
          bracketTrack: currentBracketTrack || undefined,
          cassette: currentCassette === "Round" || currentCassette === "Square" ? currentCassette : undefined,
          sideChannels: currentSideChannels,
          linked: Boolean(currentLinkChoice && currentLinkChoice !== ""),
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
          await updateRollerLineItem(quoteId, lineItemId, formData);
        } else {
          await addRollerLineItem(quoteId, formData);
        }
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
        </div>
        <div className="field">
          <label htmlFor="bracketTrack">Bracket / track</label>
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
              runPreview({ cassette: e.target.value });
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
              runPreview({ linkChoice: e.target.value });
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
              runPreview({ sideChannels: e.target.checked });
            }}
          />
          Side channels ({channels.join("/")})
        </label>
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
          <label htmlFor="chainLength">Chain length</label>
          <select
            id="chainLength"
            name="chainLength"
            value={chainLength}
            onChange={(e) => setChainLength(e.target.value)}
          >
            <option value="">-- none --</option>
            {chainLengths.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row">
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
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="fabricColour">Fabric colour</label>
          <input
            id="fabricColour"
            name="fabricColour"
            value={fabricColour}
            onChange={(e) => setFabricColour(e.target.value)}
          />
        </div>
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
      </div>

      <div className="field">
        <label htmlFor="roll">Roll</label>
        <select id="roll" name="roll" value={roll} onChange={(e) => setRoll(e.target.value)}>
          <option value="">-- none --</option>
          {rolls.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
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
        {isSubmitting ? "Saving..." : isEdit ? "Save changes" : "Add line item"}
      </button>
    </form>
  );
}
