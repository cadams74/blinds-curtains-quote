"use client";

import { useEffect } from "react";

// Curtain Grid / Blind Grid (see globals.css's print rules) have far more
// columns than fit a printed page at their natural on-screen width. Forcing
// every column to the same width (table-layout: fixed) used to "solve" that,
// but it made short columns like "#" as wide as "Fabric Name" -- an uneven,
// hard-to-read mess, not a real fix. This does it properly: just before the
// browser prints, measure the table's real natural width (auto layout,
// nowrap -- unchanged from how it looks on screen) and shrink the whole
// table proportionally with `zoom` so every column keeps its real
// proportion to the others, just smaller. `zoom` (unlike `transform: scale`)
// actually reflows layout, so the shrunk table takes up correspondingly less
// space in the printed page rather than leaving blank space around it.
//
// targetWidthPx is a conservative stand-in for a landscape page's usable
// width after the @page grid-landscape margin (globals.css) -- comfortably
// under both a US Letter (~980px) and A4 (~1047px) landscape page's real
// usable width at the 96 CSS-px-per-inch browsers use for print, so it
// should fit either without knowing which paper size the printer is set to.
// A quote with fewer/shorter values naturally needs less shrinking (better,
// more readable print) than one with many long fabric names -- this scales
// down only as much as that specific quote's data actually requires, rather
// than punishing every quote with the same tiny fixed font size regardless
// of content. minZoom stops a pathologically wide table from being shrunk
// into illegibility; past that floor the table may still run slightly wider
// than the page, which is an honest trade-off, not a silent failure.
const TARGET_WIDTH_PX = 950;
const MIN_ZOOM = 0.35;

export function GridPrintFit() {
  useEffect(() => {
    function fitForPrint() {
      const table = document.querySelector<HTMLElement>(".grid-table");
      if (!table) return;
      table.style.zoom = "1";
      const naturalWidth = table.scrollWidth;
      if (naturalWidth > TARGET_WIDTH_PX) {
        const zoom = Math.max(TARGET_WIDTH_PX / naturalWidth, MIN_ZOOM);
        table.style.zoom = String(zoom);
      }
    }
    function resetForScreen() {
      const table = document.querySelector<HTMLElement>(".grid-table");
      if (table) table.style.zoom = "1";
    }
    window.addEventListener("beforeprint", fitForPrint);
    window.addEventListener("afterprint", resetForScreen);
    return () => {
      window.removeEventListener("beforeprint", fitForPrint);
      window.removeEventListener("afterprint", resetForScreen);
    };
  }, []);

  return null;
}
