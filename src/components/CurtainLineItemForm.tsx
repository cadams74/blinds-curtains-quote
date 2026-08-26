"use client";

import { Fragment, useState, useTransition } from "react";
import { addCurtainLineItem, getCurtainFabricsForSupplier, previewCurtainPrice } from "@/lib/actions";
import type { CurtainResult } from "@/pricing/curtain";

interface Props {
  quoteId: number;
  styles: string[];
  finishes: string[];
  tracks: string[];
  layouts: string[];
  hooks: string[];
  suppliers: string[];
}

const BREAKDOWN_LABELS: Record<string, string> = {
  fullness: "Fullness",
  trackLengthCm: "Track length (cm)",
  makeHeightCm: "Make height (cm)",
  fabricQuantityM: "Fabric quantity (m)",
  trackPricing: "Track pricing",
  mitres: "Mitres",
  bends: "Bends",
  curtainMaking: "Curtain making",
  fabricPricing: "Fabric pricing",
  liningPricing: "Lining",
  installation: "Installation",
};

// The source workbook's own labels have inconsistent leading whitespace
// (e.g. "  Top Fix" with two leading spaces, " Brushing" with one) -- that's
// real data the pricing lookups match against exactly, so the submitted
// <option> value keeps it. Trimmed only for what's shown on screen.
function trimLabel(s: string) {
  return s.trim();
}

export function CurtainLineItemForm({ quoteId, styles, finishes, tracks, layouts, hooks, suppliers }: Props) {
  const [room, setRoom] = useState("");
  const [style, setStyle] = useState("");
  const [liningInput, setLiningInput] = useState<"U" | "L">("U");
  const [finish, setFinish] = useState("");
  const [trackName, setTrackName] = useState("");
  const [layout, setLayout] = useState("");
  const [hooksValue, setHooksValue] = useState("");
  const [fabricSupplier, setFabricSupplier] = useState("");
  const [fabricOptions, setFabricOptions] = useState<{ name: string; pricePerMetre: number }[]>([]);
  const [fabricName, setFabricName] = useState("");
  const [pricePerMetre, setPricePerMetre] = useState("");
  const [leftReturnCm, setLeftReturnCm] = useState("");
  const [rightReturnCm, setRightReturnCm] = useState("");
  const [overlapCm, setOverlapCm] = useState("");
  const [lpwCm, setLpwCm] = useState("");
  const [wwCm, setWwCm] = useState("");
  const [rpwCm, setRpwCm] = useState("");
  const [heightCm, setHeightCm] = useState("");

  const [preview, setPreview] = useState<CurtainResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  async function onSupplierChange(supplier: string) {
    setFabricSupplier(supplier);
    setFabricName("");
    setPricePerMetre("");
    setPreview(null);
    if (!supplier) {
      setFabricOptions([]);
      return;
    }
    const options = await getCurtainFabricsForSupplier(supplier);
    setFabricOptions(options);
  }

  function onFabricChange(name: string) {
    setFabricName(name);
    const match = fabricOptions.find((f) => f.name === name);
    if (match) setPricePerMetre(String(match.pricePerMetre));
    runPreview({ pricePerMetreOverride: match ? String(match.pricePerMetre) : undefined });
  }

  // See RollerLineItemForm.tsx's comment on this pattern -- every dropdown
  // below calls runPreview() in the same onChange as its own setState(),
  // which hasn't taken effect yet, so without passing the new value in
  // explicitly the preview reads the PREVIOUS value for that field (style,
  // lining, finish, track, layout, hooks all had this bug). The line item
  // that gets SAVED is unaffected (the server action reads fresh submitted
  // form data), but the live price shown while quoting was one selection
  // behind.
  function runPreview(
    overrides: {
      pricePerMetreOverride?: string;
      style?: string;
      liningInput?: "U" | "L";
      finish?: string;
      trackName?: string;
      layout?: string;
      hooksValue?: string;
    } = {}
  ) {
    const ppm = Number(overrides.pricePerMetreOverride ?? pricePerMetre);
    const h = Number(heightCm);
    const currentStyle = overrides.style ?? style;
    const currentLiningInput = overrides.liningInput ?? liningInput;
    const currentFinish = overrides.finish ?? finish;
    const currentTrackName = overrides.trackName ?? trackName;
    const currentLayout = overrides.layout ?? layout;
    const currentHooksValue = overrides.hooksValue ?? hooksValue;
    if (!currentStyle || !currentFinish || !currentTrackName || !currentLayout || !currentHooksValue || !ppm || !h) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    startPreview(async () => {
      setPreviewError(null);
      try {
        const result = await previewCurtainPrice({
          style: currentStyle,
          liningInput: currentLiningInput,
          finish: currentFinish,
          trackName: currentTrackName,
          pricePerMetre: ppm,
          layout: currentLayout,
          leftReturnCm: Number(leftReturnCm) || 0,
          rightReturnCm: Number(rightReturnCm) || 0,
          overlapCm: overlapCm ? Number(overlapCm) : undefined,
          lpwCm: lpwCm ? Number(lpwCm) : undefined,
          wwCm: wwCm ? Number(wwCm) : undefined,
          rpwCm: rpwCm ? Number(rpwCm) : undefined,
          heightCm: h,
          hooks: currentHooksValue,
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
        await addCurtainLineItem(quoteId, formData);
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
          <label htmlFor="style">Style</label>
          <select
            id="style"
            name="style"
            value={style}
            onChange={(e) => {
              setStyle(e.target.value);
              runPreview({ style: e.target.value });
            }}
            onBlur={() => runPreview()}
            required
          >
            <option value="">-- select --</option>
            {styles.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="liningInput">Lining</label>
          <select
            id="liningInput"
            name="liningInput"
            value={liningInput}
            onChange={(e) => {
              const next = e.target.value === "L" ? "L" : "U";
              setLiningInput(next);
              runPreview({ liningInput: next });
            }}
          >
            <option value="U">Unlined</option>
            <option value="L">Lined (formula not yet validated against real data)</option>
          </select>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="finish">Finish</label>
          <select
            id="finish"
            name="finish"
            value={finish}
            onChange={(e) => {
              setFinish(e.target.value);
              runPreview({ finish: e.target.value });
            }}
            required
          >
            <option value="">-- select --</option>
            {finishes.map((f) => (
              <option key={f} value={f}>
                {trimLabel(f)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="trackName">Track</label>
          <select
            id="trackName"
            name="trackName"
            value={trackName}
            onChange={(e) => {
              setTrackName(e.target.value);
              runPreview({ trackName: e.target.value });
            }}
            required
          >
            <option value="">-- select --</option>
            {tracks.map((t) => (
              <option key={t} value={t}>
                {trimLabel(t)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="fabricSupplier">Fabric supplier</label>
          <select
            id="fabricSupplier"
            name="fabricSupplier"
            value={fabricSupplier}
            onChange={(e) => onSupplierChange(e.target.value)}
            required
          >
            <option value="">-- select --</option>
            {suppliers.map((s) => (
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
            disabled={!fabricSupplier}
            onChange={(e) => onFabricChange(e.target.value)}
            required
          >
            <option value="">-- select --</option>
            {fabricOptions.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name} (${f.pricePerMetre.toFixed(2)}/m)
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="pricePerMetre">Price per metre ($)</label>
        <input
          id="pricePerMetre"
          name="pricePerMetre"
          type="number"
          step="0.01"
          value={pricePerMetre}
          onChange={(e) => {
            setPricePerMetre(e.target.value);
            runPreview({ pricePerMetreOverride: e.target.value });
          }}
          required
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="layout">Layout</label>
          <select
            id="layout"
            name="layout"
            value={layout}
            onChange={(e) => {
              setLayout(e.target.value);
              runPreview({ layout: e.target.value });
            }}
            required
          >
            <option value="">-- select --</option>
            {layouts.map((l) => (
              <option key={l} value={l}>
                {trimLabel(l)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="hooks">Hooks</label>
          <select
            id="hooks"
            name="hooks"
            value={hooksValue}
            onChange={(e) => {
              setHooksValue(e.target.value);
              runPreview({ hooksValue: e.target.value });
            }}
            required
          >
            <option value="">-- select --</option>
            {hooks.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
        Track length (cm): fill in whichever of Left-of-Window / Wall Width / Right-of-Window your
        layout uses -- leave the others blank (matches how the source sheet is filled in per layout).
      </p>
      <div className="field-row">
        <div className="field">
          <label htmlFor="lpwCm">Left of window (cm)</label>
          <input id="lpwCm" name="lpwCm" type="number" value={lpwCm} onChange={(e) => { setLpwCm(e.target.value); }} onBlur={() => runPreview()} />
        </div>
        <div className="field">
          <label htmlFor="wwCm">Wall width (cm)</label>
          <input id="wwCm" name="wwCm" type="number" value={wwCm} onChange={(e) => { setWwCm(e.target.value); }} onBlur={() => runPreview()} />
        </div>
        <div className="field">
          <label htmlFor="rpwCm">Right of window (cm)</label>
          <input id="rpwCm" name="rpwCm" type="number" value={rpwCm} onChange={(e) => { setRpwCm(e.target.value); }} onBlur={() => runPreview()} />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="leftReturnCm">Left return (cm)</label>
          <input id="leftReturnCm" name="leftReturnCm" type="number" value={leftReturnCm} onChange={(e) => setLeftReturnCm(e.target.value)} onBlur={() => runPreview()} required />
        </div>
        <div className="field">
          <label htmlFor="rightReturnCm">Right return (cm)</label>
          <input id="rightReturnCm" name="rightReturnCm" type="number" value={rightReturnCm} onChange={(e) => setRightReturnCm(e.target.value)} onBlur={() => runPreview()} required />
        </div>
        <div className="field">
          <label htmlFor="overlapCm">Overlap (cm)</label>
          <input id="overlapCm" name="overlapCm" type="number" value={overlapCm} onChange={(e) => setOverlapCm(e.target.value)} onBlur={() => runPreview()} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="heightCm">Height (cm)</label>
        <input
          id="heightCm"
          name="heightCm"
          type="number"
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
          onBlur={() => runPreview()}
          required
        />
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
                      <dd>{typeof v === "number" && k.endsWith("Cm") ? v : typeof v === "number" && (k === "fullness" || k === "fabricQuantityM") ? v : `$${Number(v).toFixed(2)}`}</dd>
                    </Fragment>
                  ))}
              </dl>
            </>
          ) : (
            <p className="error" style={{ margin: 0 }}>
              {preview.reason === "fullness_not_found" &&
                "That style isn't in the fullness table -- pick a style from the list."}
              {preview.reason === "track_length_exceeds_bands" &&
                "Track length exceeds every published price band for this track -- needs a manual price."}
              {preview.reason === "unvalidated_style_variant" &&
                'This style\'s pricing formula hasn\'t been validated against real data yet -- needs a manual price for now.'}
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
