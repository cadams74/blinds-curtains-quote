"use client";

// A trivial client component just for window.print() -- the install sheet
// itself stays a Server Component (no interactivity needed for the data),
// but triggering the browser's print dialog needs client-side JS somewhere.
export function PrintButton() {
  return (
    <button type="button" className="btn secondary no-print" onClick={() => window.print()}>
      Print
    </button>
  );
}
