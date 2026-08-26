"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import {
  addCurtainLineItem,
  getCurtainFabricsForSupplier,
  previewCurtainPrice,
  updateCurtainLineItem,
} from "@/lib/actions";
import type { CurtainResult } from "@/pricing/curtain";

export interface CurtainLineItemInitial {
  room: string;
  style: string;
  liningInput: "U" | "L";
  finish: string;
  trackName: string;
  fabricSupplier: string;
  fabricName: string;
  pricePerMetre: string;
  layout: string;
  hooksValue: string;
  leftReturnCm: string;
  rightReturnCm: string;
  overlapCm: string;
  lpwCm: string;
  wwCm: string;
  rpwCm: string;
  heightCm: string;
}

interface Props {
  quoteId: number;
  styles: string[];
  finishes: string[];
  tracks: string[];
  layouts: string[];
  hooks: string[];
  suppliers: string[];
  // When set, the form edits this existing line item (via
  // updateCurtainLineItem) instead of creating a new one -- see
  // /quotes/[id]/line-items/[lineItemId]/edit/page.tsx.
  lineItemId?: number;
  initial?: CurtainLineItemInitial;
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

export function CurtainLineItemForm({
  quoteId,
  styles,
  finishes,
  tracks,
  layouts,
  hooks,
  suppliers,
  lineItemId,
  initial,
}: Props) {
  const isEdit = lineItemId !== undefined;
  const [room, setRoom] = useState(initial?.room ?? "");
  const [style, setStyle] = useState(initial?.style ?? "");
  const [liningInput, setLiningInput] = useState<"U" | "L">(initial?.liningInput ?? "U");
  const [finish, setFinish] = useState(initial?.finish ?? "");
  const [trackName, setTrackName] = useState(initial?.trackName ?? "");
  const [layout, setLayout] = useState(initial?.layout ?? "");
  const [hooksValue, setHooksValue] = useState(initial?.hooksValue ?? "");
  const [fabricSupplier, setFabricSupplier] = useState(initial?.fabricSupplier ?? "");
  const [fabricOptions, setFabricOptions] = useState<{ name: string; pricePerMetre: number }[]>([]);
  const [fabricName, setFabricName] = useState(initial?.fabricName ?? "");
  const [pricePerMetre, setPricePerMetre] = useState(initial?.pricePerMetre ?? "");
  const [leftReturnCm, setLeftReturnCm] = useState(initial?.leftReturnCm ?? "");
  const [rightReturnCm, setRightReturnCm] = useState(initial?.rightReturnCm ?? "");
  const [overlapCm, setOverlapCm] = useState(initial?.overlapCm ?? "");
  const [lpwCm, setLpwCm] = useState(initial?.lpwCm ?? "");
  const [wwCm, setWwCm] = useState(initial?.wwCm ?? "");
  const [rpwCm, setRpwCm] = useState(initial?.rpwCm ?? "");
  const [heightCm, setHeightCm] = useState(initial?.heightCm ?? "");

  const [preview, setPreview] = useState<CurtainResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  // Editing starts with a fabric supplier already chosen -- load its fabric
  // options on mount so the Fabric dropdown is populated, and run an
  // initial preview so the current saved price shows immediately rather
  // than only after the next field change.
  useEffect(() => {
    if (initial?.fabricSupplier) {
      getCurtainFabricsForSupplier(initial.fabricSupplier).then((options) => {
        setFabricOptions(options);
        runPreview();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // Investigated a "5.7m vs 5.9m" fabric-quantity report from Clive against
  // this exact formula and these exact inputs (S Wave Sheer / Top Fix / Wall
  // Right / Uspike, 30+240+24 widths, 10+10 returns, no overlap, 253cm
  // height): both a hand-calculation of priceCurtain's formula and a live
  // Playwright run of this form -- fields entered in order and fully
  // blurred, and a second run with no waits between fields to probe for a
  // resolve-order race between overlapping preview requests -- reproduced
  // 5.9m every time, matching the spreadsheet exactly. So the formula, the
  // option-list data (Fullness, layout adjustment), and the request timing
  // are all correct; nothing was ever actually saved with the wrong number
  // either (the server action recomputes fresh from submitted form data
  // regardless of what the preview showed). The likely explanation is the
  // same class of issue as RollerLineItemForm's controlType bug: these
  // numeric fields only refreshed the preview on blur, so glancing at the
  // total before tabbing out of the last-edited field (or before finishing
  // typing a multi-digit value) could show a number computed from
  // incomplete input. Extending the same overrides pattern here removes
  // that gap entirely -- every keystroke refreshes the preview immediately,
  // the same as the dropdowns above, so there's no window where the shown
  // total can lag behind what's actually been typed.
  function runPreview(
    overrides: {
      pricePerMetreOverride?: string;
      style?: string;
      liningInput?: "U" | "L";
      finish?: string;
      trackName?: string;
      layout?: string;
      hooksValue?: string;
      lpwCm?: string;
      wwCm?: string;
      rpwCm?: string;
      leftReturnCm?: string;
      rightReturnCm?: string;
      overlapCm?: string;
      heightCm?: string;
    } = {}
  ) {
    const ppm = Number(overrides.pricePerMetreOverride ?? pricePerMetre);
    const currentHeightCm = overrides.heightCm ?? heightCm;
    const h = Number(currentHeightCm);
    const currentStyle = overrides.style ?? style;
    const currentLiningInput = overrides.liningInput ?? liningInput;
    const currentFinish = overrides.finish ?? finish;
    const currentTrackName = overrides.trackName ?? trackName;
    const currentLayout = overrides.layout ?? layout;
    const currentHooksValue = overrides.hooksValue ?? hooksValue;
    const currentLpwCm = overrides.lpwCm ?? lpwCm;
    const currentWwCm = overrides.wwCm ?? wwCm;
    const currentRpwCm = overrides.rpwCm ?? rpwCm;
    const currentLeftReturnCm = overrides.leftReturnCm ?? leftReturnCm;
    const currentRightReturnCm = overrides.rightReturnCm ?? rightReturnCm;
    const currentOverlapCm = overrides.overlapCm ?? overlapCm;
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
          leftReturnCm: Number(currentLeftReturnCm) || 0,
          rightReturnCm: Number(currentRightReturnCm) || 0,
          overlapCm: currentOverlapCm ? Number(currentOverlapCm) : undefined,
          lpwCm: currentLpwCm ? Number(currentLpwCm) : undefined,
          wwCm: currentWwCm ? Number(currentWwCm) : undefined,
          rpwCm: currentRpwCm ? Number(currentRpwCm) : undefined,
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
        if (isEdit) {
          await updateCurtainLineItem(quoteId, lineItemId, formData);
        } else {
          await addCurtainLineItem(quoteId, formData);
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
          <input id="lpwCm" name="lpwCm" type="number" value={lpwCm} onChange={(e) => { setLpwCm(e.target.value); runPreview({ lpwCm: e.target.value }); }} />
        </div>
        <div className="field">
          <label htmlFor="wwCm">Wall width (cm)</label>
          <input id="wwCm" name="wwCm" type="number" value={wwCm} onChange={(e) => { setWwCm(e.target.value); runPreview({ wwCm: e.target.value }); }} />
        </div>
        <div className="field">
          <label htmlFor="rpwCm">Right of window (cm)</label>
          <input id="rpwCm" name="rpwCm" type="number" value={rpwCm} onChange={(e) => { setRpwCm(e.target.value); runPreview({ rpwCm: e.target.value }); }} />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="leftReturnCm">Left return (cm)</label>
          <input id="leftReturnCm" name="leftReturnCm" type="number" value={leftReturnCm} onChange={(e) => { setLeftReturnCm(e.target.value); runPreview({ leftReturnCm: e.target.value }); }} required />
        </div>
        <div className="field">
          <label htmlFor="rightReturnCm">Right return (cm)</label>
          <input id="rightReturnCm" name="rightReturnCm" type="number" value={rightReturnCm} onChange={(e) => { setRightReturnCm(e.target.value); runPreview({ rightReturnCm: e.target.value }); }} required />
        </div>
        <div className="field">
          <label htmlFor="overlapCm">Overlap (cm)</label>
          <input id="overlapCm" name="overlapCm" type="number" value={overlapCm} onChange={(e) => { setOverlapCm(e.target.value); runPreview({ overlapCm: e.target.value }); }} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="heightCm">Height (cm)</label>
        <input
          id="heightCm"
          name="heightCm"
          type="number"
          value={heightCm}
          onChange={(e) => {
            setHeightCm(e.target.value);
            runPreview({ heightCm: e.target.value });
          }}
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
        {isSubmitting ? "Saving..." : isEdit ? "Save changes" : "Add line item"}
      </button>
    </form>
  );
}
