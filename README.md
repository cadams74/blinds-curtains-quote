# Blinds & Curtains Quoting App

A working Next.js application on top of the Postgres schema and pricing
engines: staff log in, create a quote, add a line item for any of the six
blind families, sheer curtains, or a Misc Quote item -- through real
cascading dropdowns with a live server-computed price -- see the running
total, and download a PDF, end to end, verified against a real (local)
Postgres database, not just unit tests. Roller was built first because it's
the one family validated against real historical data (see "What's
validated" below); the other five blind families, sheer curtains, and Misc
Quote now have working UI too, all sharing the same pricing engines and the
same honest error-reporting for the cases those engines flag as unvalidated
or out of band -- see "The app layer" for how, and "What's not here yet" for
what's still missing.

## Layout

```
src/db/schema.ts           Drizzle ORM schema (Neon/Postgres target)
src/db/client.ts            drizzle(pool) via pg.Pool -- throws clearly if DATABASE_URL isn't set
src/db/migrate.ts            Applies every pending file in ./drizzle to DATABASE_URL, tracked in
                             Drizzle's own migrations table -- run via `npm run db:migrate`, the
                             supported way to create/update a real (Neon) database's schema now
drizzle/                     Versioned SQL migration files (drizzle-kit generate output), checked
                             into git -- 0000_baseline.sql is the whole schema as of the switch away
                             from `drizzle-kit push`, verified to reproduce this project's own
                             push-built schema exactly (see "The app layer")
src/db/seed.ts              Seeds the schema from data/extraction_output/ (dry-runs without DATABASE_URL)
src/db/seedAdmin.ts         Creates/updates one admin login from ADMIN_EMAIL/ADMIN_PASSWORD env vars
src/pricing/loadData.ts     Loads price grids / control prices / constants from extraction JSON
src/pricing/bandLookup.ts   Generic width x height banded price-grid lookup (CEILING + exact-match)
src/pricing/genericBlind.ts Shared pricing engine for Roller/Venetian/Roman/Panel/Verishade/Vertical --
                             takes an optional BlindDataSource so the live app can price off the
                             database instead of the static JSON fixtures, with zero change to the
                             pricing math itself (see "The app layer" below)
src/pricing/genericBlind.test.ts  Hand-computed cross-checks for the 5 families with no real quote data
src/pricing/roller.ts       Roller-specific types, built on genericBlind.ts (kept separate: it's the
                             one family validated against real data, and the reference example)
src/pricing/roller.test.ts  27 real historical quote lines, asserted to the dollar
src/pricing/honeycomb.ts    Honeycomb pricing (needs its own module -- see file comment for why)
src/pricing/honeycomb.test.ts  Hand-computed cross-checks (real Honeycomb data exists but is broken -- see below)
src/pricing/loadCurtainData.ts  Loads track price lists / fullness / make-height adjustment tables from extraction JSON
src/pricing/curtain.ts      Curtain pricing (fullness x fabric metreage x 1D banded track price, not the
                             blind grid shape) -- takes an optional CurtainDataSource, same
                             database-vs-JSON pattern as genericBlind.ts's BlindDataSource
src/pricing/curtain.test.ts 11 real historical "S Wave Sheer" quote lines (8 clean, 3 real #N/A cases), asserted to the dollar
src/pricing/misc.ts        Misc Quote normalizer (this sheet has NO pricing formula -- see "What's validated")
src/pricing/misc.test.ts   4 real Misc Quote sample rows, covering all 3 price states (amount / "N/C" / blank note)
data/extraction_output/     Copy of the validated workbook extraction (see extraction/README.md)
data/roller_fixtures.json   27 real Roller blind line items (inputs + workbook's own computed outputs)
data/curtain_fixtures.json  11 real curtain line items (inputs + workbook's own computed outputs, incl. the 3 broken ones)
data/misc_quote_fixtures.json  4 real Misc Quote sample rows

src/auth.config.ts          Edge-safe Auth.js config (session/jwt callbacks only, no Credentials
                             provider) -- used by middleware.ts, which runs on Vercel's Edge runtime
                             and can't load `pg`/`bcryptjs`
src/auth.ts                  Full Auth.js config: auth.config.ts + the Credentials provider
                             (bcrypt + DB lookup) -- used everywhere else (Node runtime)
src/middleware.ts            Route guard: redirects to /login unless signed in, built from the
                             Edge-safe config only
src/types/next-auth.d.ts     Module augmentation adding `role` to the session/user/JWT types
src/lib/session.ts           requireUser() -- throws if called without a session, for every
                             Server Action/page that touches the database. requireAdmin() adds a
                             role check on top, for the admin area
src/lib/adminActions.ts      Admin-only Server Actions (updateFabricPrice, updatePricingConstants,
                             getPricingConstantsHistory, updateOptionListValues,
                             updateBlindFabricGroup, startFabricImport, approveFabricImport,
                             rejectFabricImport, createUser, updateUser) -- split from actions.ts so
                             the admin/estimator boundary is visible in the file layout, not just a
                             runtime check buried in each function. Every mutating action here
                             returns a shared `ActionState { error, successAt }` instead of throwing
                             on bad input, the fix for a real production-only bug found while
                             building Staff Logins and then applied to the rest of the file -- see
                             "The app layer"
src/lib/pricingConstantsConfig.ts  Which of the stored pricing_constants_versions.constants keys
                             are real, live editing targets -- split into EDITABLE_BLIND_CONSTANTS
                             (genericBlind.ts) and EDITABLE_CURTAIN_CONSTANTS (curtain.ts, both now
                             DB-backed and both save together as one version) -- vs. left out of the
                             admin UI entirely (extraction artifacts, not live pricing knobs, e.g.
                             CordCost -- see the file comment for how that one was found unread)
src/lib/liveOptionLists.ts   Which option_lists rows a live form actually fetches today, for the
                             Option Lists admin page's "live" vs "not wired to a form" badge
src/lib/fabricImport.ts      Parses an uploaded .xlsx (exceljs) or .pdf (pdfjs-dist, reconstructing
                             a table from raw text positions -- see the file's own parsePdfBuffer
                             comment for exactly how and its documented limitations) price list into
                             the same plain grid either way, auto-detects the name/price columns,
                             and diffs the parsed rows against a supplier's current fabrics (new /
                             price_change / unchanged / ambiguous / invalid_price). Pure functions,
                             unit-tested (fabricImport.test.ts, including real PDF fixtures built at
                             test time by pdf-lib) -- no DB/Server Action code in this file, see
                             adminActions.ts for that
src/lib/blindFabricSourceInfo.ts  Which price-grid family/families each blind_fabric_options.source
                             value can be used by, and whether that family has a live quoting route
                             -- for the Blind Fabric Groups admin page's "used by" column and
                             not-wired badge. Also where the Honeycomb-has-no-UI-route gap (see
                             "What's not here yet") was found and documented
src/lib/pricingDataSource.ts loadBlindDataSource(db, family) -- fetches a family's constants/grids/
                             fabric options/control prices from Postgres and hands back a
                             BlindDataSource the existing pricing engines can price against directly
src/lib/curtainDataSource.ts loadCurtainDataSource(db) -- the curtain-side equivalent, fetches
                             constants/track price lists/Fullnesses/LayoutBends/direct-address
                             adjustment tables from Postgres into a CurtainDataSource. Also
                             getCurtainHookNames(db) for the Hooks dropdown (UI option list, not
                             pricing math, kept separate)
src/lib/actions.ts           Server Actions: createQuote, previewRollerPrice, addRollerLineItem,
                             previewGenericBlindPrice, addGenericBlindLineItem, previewCurtainPrice,
                             addCurtainLineItem, addMiscLineItem, getFabricNamesForSource,
                             getCurtainFabricSuppliers, getCurtainFabricsForSupplier,
                             deleteLineItem, setPriceOverride -- all call requireUser() first
src/lib/blindFamilies.ts     UI config for the five genericBlind.ts families (Venetian/Roman/Panel/
                             Verishade/Vertical) -- which option lists each uses, since they're not
                             all the same fields (only Panel has a bracket/track choice, only
                             Roller has cassette/side-channel/link fields -- see the file comment)
src/lib/QuotePdfDocument.tsx @react-pdf/renderer document definition for the quote PDF -- handles
                             every family's attribute shape, not just Roller's

src/app/layout.tsx           Root layout
src/app/globals.css          Plain CSS design system (no Tailwind/component library)
src/app/login/page.tsx       Login form (email/password against the Credentials provider)
src/app/page.tsx             Dashboard: quotes list with aggregated totals/line counts
src/app/quotes/new/page.tsx  New quote form
src/app/quotes/[id]/page.tsx  Quote detail: line items, totals, price-override form, PDF/Add-line links
src/app/quotes/[id]/line-items/new/roller/page.tsx  Roller line item form page (fetches option lists)
src/app/quotes/[id]/line-items/new/[family]/page.tsx  Shared route for the other five blind
                             families -- looks up the family's config in blindFamilies.ts, 404s on
                             an unknown slug
src/app/quotes/[id]/line-items/new/curtain/page.tsx  Sheer curtain line item form page
src/app/quotes/[id]/line-items/new/misc/page.tsx  Misc Quote item form page
src/app/quotes/[id]/pdf/route.ts  Streams the quote PDF (renderToBuffer, Node runtime)
src/app/api/auth/[...nextauth]/route.ts  Auth.js's own API routes (sign-in/callback/sign-out)
src/components/Topbar.tsx    Brand/user/sign-out
src/components/RollerLineItemForm.tsx  Client Component: cascading fabric source -> name select,
                             live price preview via a Server Action, submit via a Server Action
src/components/GenericBlindLineItemForm.tsx  Same pattern, shared by the other five blind families
                             -- auto-selects Fabric Source/Control Type when a family only has one
                             valid option (Venetian/Verishade/Vertical all do -- see file comment)
src/components/CurtainLineItemForm.tsx  Sheer curtain form -- cascading fabric supplier -> fabric
                             name (auto-fills $/metre), style/finish/track/layout/hooks selects
src/components/MiscLineItemForm.tsx  Free-text description/price/notes form -- live preview is a
                             direct client-side call to priceMisc(), no server round trip needed
src/components/admin/NewUserForm.tsx  Client Component wrapping createUser in useActionState --
                             see adminActions.ts's comment on why this page needed that instead of
                             the plain <form action={fn}> + throw pattern every other admin action
                             uses; resets its fields after a successful create
src/components/admin/UserRow.tsx  One Staff Logins table row, also useActionState-backed (updateUser)
                             -- its own <form> per row rather than the out-of-table form="" pattern
                             used elsewhere, and renders a second <tr> underneath itself for the
                             error message when a save is rejected (self-demote, last-admin, etc.)
src/components/admin/FabricRow.tsx  One Fabric Prices table row, useActionState-backed
                             (updateFabricPrice) -- same per-row <form>/error-<tr> shape as
                             UserRow.tsx, the pattern every remaining admin action was converted to
src/components/admin/BlindFabricRow.tsx  One Blind Fabric Groups table row, useActionState-backed
                             (updateBlindFabricGroup) -- preserves the family-range/out-of-range
                             badge logic the inline version had
src/components/admin/PricingConstantsForm.tsx  The whole Pricing Constants page's form (both blind
                             and curtain sections), useActionState-backed (updatePricingConstants)
src/components/admin/OptionListEditor.tsx  One Option Lists <details> row's editor (list mode or
                             raw-JSON mode), useActionState-backed (updateOptionListValues)
src/components/admin/FabricImportUploadForm.tsx  The Fabric Import upload form, useActionState-
                             backed (startFabricImport) -- its success path still ends in a
                             redirect(), which useActionState passes through unchanged
src/components/admin/ApproveRejectButtons.tsx  A batch review page's Approve/Reject buttons -- two
                             independent useActionState hooks (approveFabricImport,
                             rejectFabricImport), whichever one has an error shown below both buttons

src/app/admin/error.tsx      Error boundary for the whole /admin section, kept as a fallback --
                             Next.js redacts a thrown Server Action error's message in a production
                             build by default, which is what motivated converting every admin action
                             above to return a useActionState value instead of throwing (see "The app
                             layer"). requireAdmin()'s own failure is the one thing still allowed to
                             throw in each action, so this boundary is what a signed-out/non-admin
                             request into a Server Action actually hits

src/app/admin/page.tsx       Admin index -- links to what's built, plainly labels what isn't yet
src/app/admin/fabrics/page.tsx  Fabric Prices: filter/search/paginate the 3,313 seeded fabrics,
                             edit $/metre + active inline via FabricRow.tsx (GET-form filters are
                             still plain server-rendered, only the per-row edit form is a Client
                             Component)
src/app/admin/pricing-constants/page.tsx  Edit the blind AND curtain pricing constants live, both
                             sections in one form via PricingConstantsForm.tsx (new versioned row
                             per save, with history)
src/app/admin/option-lists/page.tsx  Edit any of the 75 seeded dropdown lists via
                             OptionListEditor.tsx -- friendly one-per-line editor for flat string
                             lists, raw JSON for everything else, each row badged "live" or "not
                             wired to a form"
src/app/admin/blind-fabrics/page.tsx  Blind Fabric Groups: filter/search the 217 seeded
                             blind_fabric_options rows, edit each fabric's price-grid group inline
                             via BlindFabricRow.tsx -- distinct from Fabric Prices (a group number,
                             not a dollar figure), shows each row's applicable families' live valid
                             group ranges and flags a saved value that falls outside one of them
src/app/admin/fabric-import/page.tsx  Fabric Import: upload a supplier's price list (.xlsx or .pdf)
                             via FabricImportUploadForm.tsx, parses and diffs it against that
                             supplier's current fabrics, lists recent batches
src/app/admin/fabric-import/[id]/page.tsx  Review one import batch -- diff counts, filterable row
                             table, Approve/Reject via ApproveRejectButtons.tsx; a low-confidence
                             column-detection guess is flagged with a warning banner rather than
                             silently trusted
src/app/admin/users/page.tsx  Staff Logins: create/edit/deactivate accounts without a terminal or
                             database connection -- replaces npm run seed:admin for day-to-day use
                             (that script still creates the very first login). Self-demote and
                             last-active-admin guards live in adminActions.ts's updateUser
```

## Running it

```
npm install
npm test              # 80 tests, all passing
npx tsc --noEmit       # typecheck

cp .env.example .env.local   # then fill in DATABASE_URL and AUTH_SECRET (see .env.example)
npm run db:migrate     # creates the schema (16 tables) by applying every file in ./drizzle in order
npm run seed           # seeds pricing data + option lists from data/extraction_output/
npm run seed:admin     # creates/updates one admin login from ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NAME

npm run dev             # local dev server (http://localhost:3000)
npm run build && npm run start   # production build + start
```

`npm run db:migrate`, `npm run seed`, and `npm run seed:admin` all need `DATABASE_URL` set (in
`.env.local` for local dev, or as a real environment variable against a Neon database). Without it,
`seed` dry-runs and reports row counts instead of writing anything -- `db:migrate` and `seed:admin`
require a real connection and will error without one. All three are safe to re-run: `db:migrate`
tracks which migration files have already applied and only runs new ones, and every seed insert is
guarded against duplicates (see "The app layer" below for the idempotency bugs this found and fixed).

**Schema changes go through `db:generate` + `db:migrate`, not `db:push`, from this point on.** Any
edit to `src/db/schema.ts` needs a `npm run db:generate` migration file committed alongside it --
`db:generate` writes the SQL diff to a new file under `./drizzle` without touching any database,
so it can be read and reviewed before anything runs. `db:push` (still present) computes and applies
a schema diff directly against whatever `DATABASE_URL` points at with nothing to review first and no
record afterward of what ran -- fine for quick local prototyping on a schema change you haven't
generated a migration for yet, but never point it at a database anyone else's data lives in. See
"The app layer" for why this switch happened and how the very first migration (`0000_baseline.sql`)
was verified to reproduce this project's own push-built schema exactly.

## What's validated

**Roller** (`roller.ts`): checked against **27 real line items** pulled
directly from the sample quote in the source workbook — every one reproduces
the workbook's own calculated price (the `AA` column, i.e. the formula
output *before* any manual price override) to the exact dollar, plus
finer-grained checks on fabric-group resolution, the raw price-grid lookup,
freight, booster, control cost, and links cost. That real data exercised the
band lookup, the 1.88 markup, freight, the oversized-item booster, control
pricing, and linked-blind driver cost. It did **not** exercise cassettes,
side channels, the "Dual Compact" bracket, or "On Dual" installation —
transcribed from the formulas but unconfirmed against a real example.

**Venetian, Roman, Panel, Verishade, Vertical** (`genericBlind.ts`): the
sample workbook has **zero** real historical line items for these five
families, so there's nothing to validate against directly. Instead,
`genericBlind.test.ts` independently recomputes the expected raw price
straight from the extracted grid JSON (a separate calculation from the one
`bandLookup.ts` does) and checks the engine matches it. That catches
band-lookup/indexing bugs, but it is **not the same strength of evidence**
as Roller's real-quote validation — the day real quotes for any of these
families are available, re-validate against them the same way Roller was.

**Honeycomb** (`honeycomb.ts`): the sample workbook *does* have 5 real
Honeycomb line items -- but all 5 have `#REF!` errors in their own cached
price cells, because the source spreadsheet's Fabric Source column was left
blank on every one of them (Honeycomb only has one valid source, "Honeycomb"
itself, which is easy to overlook filling in when there's nothing to
"choose" from). The estimator worked around it with a manual price override
rather than fixing the input. Two things worth taking from this: (1) it's
independent confirmation that a bare Excel dropdown doesn't stop bad data
entry -- worth keeping in mind when the new UI's forms get built, e.g.
auto-selecting a field when it only has one valid option; (2) it means
Honeycomb, like the other five families, is validated by hand-computed
cross-check rather than real data. `honeycomb.test.ts` also includes a case
that reproduces this exact real-world failure (blank fabric selection),
confirming the engine reports it clearly rather than guessing a price.

**Curtains — sheer style only** (`curtain.ts`): checked against **8 real
line items** pulled from the sample quote's "S Wave Sheer" rows (unlined,
top-fix, not the "OH"/"Over" variant) — every one reproduces the workbook's
own calculated price to the exact dollar across every intermediate
component (fullness, make-height, fabric quantity, track pricing, mitres,
bends, making cost, fabric cost, lining cost, installation). The sample
quote's other 3 real rows have a genuine `#N/A` in the *source workbook
itself*: their track length exceeds every published band for that track
series, the same "oversized needs a manual price" failure mode already
confirmed independently in the blind families and Honeycomb — now seen a
third time, which is enough to say it's a systemic pattern in this business
worth designing the new UI around (e.g. surface it as a clear "no price
available, needs a manual quote" state rather than a blank or crashed
field). `curtain.test.ts` asserts the engine reproduces that same `#N/A`
outcome rather than guessing a price for those 3 rows.

Two real bugs were caught by this real data, both fixed:
1. Excel's `SUM()` treats a blank cell as 0; naive JS addition of
   `lpwCm + wwCm + rpwCm` produces `NaN` when a layout (e.g. "Wall to Wall")
   only fills the width field and leaves left/right-of-window blank. Fixed
   by defaulting each to 0.
2. Excel's `QUOTIENT()` truncates toward zero; `Math.floor` rounds toward
   -Infinity. The installation-cost formula's `QUOTIENT(trackLength-350,150)`
   goes negative for any track under 350cm (routine for a single small
   window), and the two truncation rules disagree there. Fixed by using
   `Math.trunc` instead of `Math.floor`.

Both are worth remembering as a general lesson for the rest of this port:
Excel's arithmetic and rounding functions have their own semantics that
don't always match the "obvious" JS equivalent, and it took real short/blank
data to surface both of these rather than the formula reading alone.

Curtains also introduced a unit switch worth flagging clearly for the new
UI: **blind measurements are in millimetres; curtain measurements (track
length, LPW/WW/RPW, height) are in centimetres.** Easy to miss, easy to get
wrong once, so the schema and form labels should make it unambiguous rather
than relying on the user remembering.

Several branches are transcribed from the formulas but not exercised by any
of the 11 real rows (all "S Wave Sheer", unlined, non-"OH"): the Lined
lining-cost path, the non-sheer/Upleat fabric-quantity formula, the "Over
270cm"/"OH" 2.2x making-cost surcharge, and the Upleat-specific track-price
lookup. `priceCurtain` reports these clearly as `"unvalidated_style_variant"`
rather than silently guessing a price — re-validate against real data for
those styles the same way the sheer path was.

**Misc Quote** (`misc.ts`): unlike every other family, this sheet has **no
pricing formula at all** — verified by the extraction script, which
programmatically checks every Price/Install Time cell in the sheet and fails
loudly if it ever finds a formula, rather than silently missing one. Price is
100% manual entry, so `misc.ts` isn't a calculator, it's a normalizer:
checked against the sample quote's 4 real rows, which between them cover all
three price states the source data actually uses — a plain number, the
literal text `"N/C"` (used deliberately instead of `0` so it prints as "N/C"
rather than "$0.00" on the customer-facing quote/invoice — those read very
differently), and a bare note line with no price at all (e.g. a logistics
note like "client's floor plans are at Unique bay 13"). `priceMisc()` keeps
those three states distinct (`priceKind: "amount" | "no_charge" |
"note_only"`) rather than collapsing "N/C" and "no price entered" into the
same thing, since a real quote should be able to show them differently. It
also rejects free text that isn't a real number or "N/C" (e.g. a stray "TBC")
rather than silently treating it as $0 — the source sheet has no validation
on this cell either, so a typo there is a real risk worth catching rather
than reproducing.

The workbook's Misc Quote items also referenced a `Miscellaneous` fabric-
style name/price list (`Miscellaneous!$A$3:$A$20`) — checked and it's
placeholder test data by the exact same pattern as the supplier favourites
lists dropped during phase 1 (named "Clive", "Misc2".."Misc13"), so it was
not carried into the extraction or this engine. The app should let Misc
Quote's description/price be typed freely, matching how the source sheet is
actually used, rather than restricting it to a predefined list that doesn't
reflect real data.

One source-data quirk reproduced faithfully rather than "fixed" everywhere:
the width/height rounding-and-lookup logic in the original spreadsheet
clamps both axes against `MIN(width_bands)`, not a separate
`MIN(height_bands)` for the height axis. Harmless for every family checked
so far because their width and height band lists are identical — worth a
second look if a family is ever found where they differ. See the comment in
`bandLookup.ts`.

## The app layer

The app is real, not scaffolding: an internal staff member signs in
(Auth.js, Credentials provider, bcrypt-hashed passwords, no self-signup),
creates a quote, adds a line item for any blind family, sheer curtains, or
a Misc Quote item through cascading dropdowns populated from the real
seeded database (not a hardcoded list), sees a live price as they fill in
the form (the exact same pricing engines validated in Phases 2-5, just now
pointed at Postgres instead of the JSON fixtures for the blind families),
saves it, sees the quote's running total update, and downloads a PDF. This
was verified end to end with Playwright driving a real `next start` server
against a real local Postgres database -- not just unit tests against the
pricing functions in isolation, for Roller first and then again for every
other family once its UI was built (see "One shared route for five blind
families" below).

**One shared route for five blind families, not five near-duplicate
routes.** Venetian, Roman, Panel, Verishade, and Vertical all share
`genericBlind.ts`, but they don't all expose the same fields in the source
workbook -- only Panel has a bracket/track choice (`PanelBrackets`), and
none of the five have Roller's cassette/side-channel/link options.
`src/lib/blindFamilies.ts` is a small per-family config (which option list
backs Fabric Source, Control Type, and optionally Bracket/Track) that a
single dynamic route (`.../line-items/new/[family]/page.tsx`) and a single
form component (`GenericBlindLineItemForm.tsx`) read from, rather than
five copy-pasted versions of the Roller page. Roller itself stays on its
own dedicated route/form -- it has fields none of the other five do, and
it's the one family with real-data validation, so keeping it as the
standalone reference example (per the existing `roller.ts` file comment)
seemed worth the small duplication versus folding it into the generic
config and complicating it for everyone else.

**A single-option dropdown is a real failure mode here, not a hypothetical
one -- so the form now avoids it.** Checking each family's actual seeded
option lists while building this turned up that Venetian, Verishade, and
Vertical each have **exactly one** valid Fabric Source in the source
workbook (named after the family itself -- e.g. Venetian's only source is
literally "Venetian"). That's the same shape as the blank-Fabric-Source
bug already documented in `honeycomb.ts`, which broke 5 real historical
Honeycomb quotes because the estimator had nothing to meaningfully
"choose" from a one-option dropdown and left it blank. `GenericBlindLine
ItemForm` now auto-selects a field when its option list has exactly one
value (Fabric Source and/or Control Type, per family), rather than
presenting a dropdown with one item the estimator has to actively pick.
This is a UI decision informed directly by a real historical data quality
issue found earlier in this project, not a hypothetical nicety.

**The extraction's single-value-vs-list shape inconsistency showed up
again, and needed the same kind of fix as before.** The named ranges
backing those single-Fabric-Source lists (and several single-value Control
Type lists, e.g. Panel's and Verishade's, which only have "Wand") are
stored in the extraction JSON as a bare string, not a one-element array --
the same shape bug already found and fixed once for `VerishadeFabricPrices`
during Phase 1. `getOptionListValues()` (`pricingDataSource.ts`) now
normalizes any non-array value into a one-element array, so every caller
can assume a real list regardless of how the source workbook happened to
store it.

**Sheer curtains needed a different fabric-selection pattern than the
blind families.** `CurtainInput.pricePerMetre` is a raw number the source
sheet's estimator typed in directly, not looked up from a fabric-group
grid like the blind families -- so the curtain form has its own cascading
select (fabric supplier -> fabric name, from the `suppliers`/`fabrics`
tables, i.e. the same $/metre fabric library the seed script already
loads) that auto-fills the price, which the estimator can still see and
override before submitting.

**Misc Quote's "N/C" distinction, carried through to the UI, not just the
pricing module.** `misc.ts` already kept "explicitly no charge" (prints as
"N/C") separate from "just a note, no price" (see Phase 5) -- the quote
detail page and PDF now honor that too, showing "N/C" rather than "$0.00"
for those line items, so the distinction the pricing module was built to
preserve doesn't get silently lost the moment it hits a screen or a PDF.

**Admin area, scoped to fabric prices first.** The first admin section
(`/admin/fabrics`) edits the curtain fabric library's $/metre prices --
3,313 seeded fabrics, filterable by supplier and name, paginated 50 at a
time. Deliberately scoped to just this: a blind fabric's *price group*
(which price-grid it maps to) is a materially different, riskier kind of
edit than a curtain fabric's dollar price, so it's left for its own admin
section later rather than folded in under the same "fabric price" label
(see the Admin index page, which says so plainly rather than pretending
it's covered). Two things worth noting about how it's built:
- **Role-gated at two independent layers, not one.** `middleware.ts`
  redirects a non-admin away from any `/admin/*` route before any page
  code runs (Edge-safe, reads the session cookie's `role` claim only), and
  `requireAdmin()` (`session.ts`) checks again inside the Server Action
  itself. The second check isn't redundant: a Server Action's endpoint can
  in principle be invoked directly (same reasoning as the existing
  `requireUser()` on every other action), so hiding the "Admin" link and
  gating the route isn't sufficient on its own -- the actual enforcement
  has to live at the point that touches the database. Verified with Playwright as two
  separate users: a non-admin never sees the "Admin" link and is bounced
  from `/admin/fabrics` straight back to `/`; an admin can filter, search,
  edit, and have the edit persist.
- **A real payoff for the "4 fabrics with an unusable source price" finding
  from Phase 6.** Those 4 fabrics are seeded `active: false` with no price
  because the source workbook's own cached price was `"#N/A"` or blank --
  until now, the only way to fix that was editing seed data and re-running
  the seed script. The admin page's "Needs review" quick filter surfaces
  exactly those rows, and typing in a real price and checking Active fixes
  one for good, no redeploy needed. Verified this exact flow with
  Playwright: it found the 4 flagged rows, fixed one, and confirmed it
  dropped out of the "needs review" list with the new price intact.
- Each row's inline edit form doesn't nest a `<form>` inside its `<tr>` --
  that's invalid HTML (a `<form>` isn't allowed flow content directly
  inside `<tr>`/`<tbody>`, only `<td>`/`<th>` are), and browsers silently
  relocate it out of the table on parse, which would break the row-to-
  action association in a way that might still *look* fine until tested.
  Each row's inputs instead reference an out-of-table `<form>` by id via
  HTML's native `form=""` attribute -- valid, and keeps every field in its
  own `<td>` lined up with the header row.
- **A new seed-script idempotency bug, found by actually using the admin
  page and then re-running the seed script afterward -- not by reasoning
  about the code.** Fixing one of the 4 unusable-price fabrics through the
  admin UI, then re-running `npm run seed` (say, to pick up a new supplier
  price list), silently created a second, stale-priced duplicate row for
  that same fabric. Root cause: the fabric insert's idempotency relied on
  a `(supplierId, name, price)` unique index (from the fix in Phase 6) --
  which stops working the moment an admin edit changes a row's price out
  from under it, since the JSON's original price no longer matches
  anything in the database to "conflict" with. Fixed in `seed.ts` by
  checking, per supplier, which fabric *names* already exist before
  inserting, and skipping any JSON row whose name is already present --
  the database is authoritative once a name has been seeded, whether that
  row came from the original extraction or a later admin edit, and a seed
  re-run never overwrites or duplicates it. (The two genuinely-duplicated
  names at two different real prices, Zepel "Dadaism" and CP "Softdrape
  Plus", still both land correctly on a first run, since neither name
  exists yet when both of their rows are inserted together.)

**Pricing Constants and Option Lists, and a real gap they surfaced.**
Building admin editors for these two required actually tracing which
stored values the live app reads at request time, not just what's in the
database -- and that tracing found a real, worth-knowing-about gap:
- `pricing_constants_versions.constants` is a single JSON blob, but it's
  actually three different kinds of data mixed together (see
  `pricingConstantsConfig.ts`'s file comment for the full breakdown): real
  $ constants `genericBlind.ts` reads live (`InstallationCost`,
  `BoosterCost`, cassette/side-channel/link costs -- these are genuinely
  editable through `/admin/pricing-constants`, take effect immediately, no
  redeploy), real $ constants `curtain.ts` also uses (`MitreCost`,
  `BendCost`, the curtain-making cost variants) but reads from the static
  extraction JSON instead of this table, and a grab-bag of extraction
  artifacts (per-price-grid-group scale values, single-value duplicates of
  option-list data) that nothing reads by these names at runtime at all.
  The admin page only exposes the first group as editable, shows the
  second group read-only with an explicit note about why, and leaves the
  third out of the UI entirely -- rather than building an editor that
  looks like it controls curtain pricing when it silently wouldn't.
- The same issue, worse, turned up in `option_lists` (75 rows, seeded from
  every non-fabric/non-control-price named range in Blind_Settings and
  Curtain_Settings): most rows really are dropdown lists a live form reads
  (`RollerSources`, `Styles`, `Tracks`, etc.), but the table also contains
  bare numeric constants captured as a side effect of being named ranges
  (`BendCost`, `ItemsPerPage`), and paired-data tables like `Fullnesses`
  and `LayoutBends` that `curtain.ts` genuinely uses for pricing -- again
  from the static JSON, not this table. Rather than hide or restrict any
  of these 75 rows, the admin page shows all of them, badged plainly
  "live" or "not wired to a form" (`liveOptionLists.ts` is the hand-
  maintained source of truth for that badge, with a comment on exactly why
  some values are used-but-not-from-here) -- editable either way, honest
  about effect either way.
- Saving a pricing-constants edit creates a new active version rather than
  mutating the row in place -- the schema already had `label`/`createdAt`/
  `isActive` columns for this, so building a real "what changed and when"
  audit trail cost little extra and fits how the table was clearly meant
  to be used.
- Verified the constants editor actually changes a real price, not just
  that the form submits: bumped `InstallationCost` by $100 through the
  admin UI, re-ran the exact same Roller price preview with Playwright,
  and confirmed it rose by exactly $100 -- then restored it.

**Database-backed pricing without touching the validated math.** The
pricing engines (`genericBlind.ts`, `roller.ts`) already had 60 tests
proving the arithmetic matches the source workbook. Rather than risk that
by rewriting them to query the database directly, they now take an optional
`BlindDataSource` parameter -- an interface with the same shape as the JSON
loader they always used. `defaultDataSource` (JSON-backed) is the default,
so every existing test still exercises the exact same code path with zero
changes. `loadBlindDataSource(db, family)` (`src/lib/pricingDataSource.ts`)
is the only new code: it fetches a family's constants/grids/fabric
options/control prices from Postgres and hands back an object satisfying
the same interface. The app passes that in; the tests don't. This means an
admin editing a price in the database takes effect immediately, with no
redeploy, while the arithmetic that was checked against real quotes stays
provably untouched.

**Auth.js's Edge/Node split.** Next.js middleware runs on Vercel's Edge
runtime by default, which can't load `pg` or `bcryptjs` (both need real
Node APIs). The first attempt at `middleware.ts` imported the full auth
config -- including the Credentials provider, which pulls in both -- and
`next build` warned about it (and it would have broken at runtime on
Vercel, or at best silently ballooned the middleware bundle). Fixed with
Auth.js's documented pattern: `auth.config.ts` holds only the Edge-safe
pieces (session/JWT callbacks, `trustHost: true`, no providers) and is what
`middleware.ts` builds its own lightweight `NextAuth()` instance from --
enough to read the session cookie and redirect, nothing more. `auth.ts`
spreads that config and adds the real Credentials provider, and everything
that actually needs to authenticate a password (the login page, the
Auth.js API route) imports `auth.ts` instead. Middleware's bundle dropped
from 144kB to 86.5kB and the `pg`/`bcryptjs` warnings disappeared once this
was in place.

**The `.js`-suffixed import convention needed a webpack config change, not
a rewrite.** The pricing/db library code (written before any of the Next.js
work, and already covered by 60 tests) uses relative imports with an
explicit `.js` extension, per the standard Node-ESM/TypeScript convention
(`moduleResolution: "Bundler"` already resolves `.js` -> `.ts` at typecheck
time). `next build`'s webpack bundler doesn't do that resolution by
default, so it failed on every one of those imports. Rather than rewrite
~15 already-validated files, `next.config.ts` adds
`config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] }`, which
tells webpack to do what `tsc` already does. New app code under `src/app`,
`src/components`, and `src/lib` uses the same `.js`-suffixed convention for
consistency, and it now builds cleanly too.

**Seeding a real database surfaced bugs a dry run couldn't.** `seed.ts` was
originally only ever dry-run tested (no database credentials were available
until this phase). Running it against a real local Postgres found several
real issues, all now fixed:
- 4 real fabrics have unusable source prices (`"#N/A"` or blank) that
  crashed a `numeric` column insert. `fabrics.pricePerMetre` is now
  nullable, and those rows are seeded with `active: false` rather than
  crashing or silently coercing the price to $0.
- Postgres treats every `NULL` as distinct in a unique index, so those same
  4 rows re-inserted as duplicates on every re-run of the seed script.
  Fixed with a partial unique index on `(supplierId, name) WHERE
  pricePerMetre IS NULL`.
- Two real fabrics genuinely appear twice in the source data at two
  different real prices (Zepel "Dadaism" at $70 and $95; CP "Softdrape
  Plus" at $12 and $24) — real, not typos. The original unique constraint
  on `(supplierId, name)` was silently dropping the second row of each
  pair. Widened to `(supplierId, name, pricePerMetre)` so both survive.
- `blindFabricOptions` (223 rows) had no unique constraint and no
  conflict handling at all, so every re-run of the seed script duplicated
  all 223 rows. Fixed with a unique index on
  `(familySlug, source, fabricName)` plus `onConflictDoNothing()`.
- `pricingConstantsVersions` had the same problem — a new "active" version
  row inserted on every re-run. Fixed with an explicit existence check
  before inserting.
- Confirmed (not fixed) 6 Roller fabric names that appear more than once in
  the source workbook with *conflicting* price groups for the same name
  (e.g. "E Screen 6%" resolves to group 6 in one row and group 4 in
  another). The seed script's "first occurrence wins" behavior reproduces
  Excel's own `VLOOKUP` behavior on the same duplicated data exactly — this
  is a real ambiguity in the source data, not a bug in the port, and it's
  worth flagging to whoever maintains the fabric price lists.

None of the above would have been caught by the dry run or by `tsc
--noEmit` — only by actually inserting into a real database and hitting
its constraints.

**Blind Fabric Groups, and a real gap it surfaced.** `blind_fabric_options`
maps a (source, fabric name) pair to a price-grid group number -- the last
piece of "fabric price" data that was still seed-script-only. It's a
smaller edit than it first looks: the schema's `familySlug` column on that
table is literally always the constant `"blind"` (see `seed.ts`), so the
real per-source-to-per-family relationship lives only in each family's own
Fabric Source option list, not in this table. Cross-referencing
`RollerSources`/`RomanSources`/`PanelSources`/`VenetianSources`/
`VerishadeSources`/`VerticalSources` against the 217 seeded rows (checked
directly against the database, not assumed) found exactly two shapes: nine
generic supplier sources (Blindware, Mermet, Louvolite, etc.) shared
identically across Roller, Roman, and Panel, and five self-named sources
(Roller, Venetian, Verishade, Vertical, Honeycomb) each belonging to one
family only -- captured in `blindFabricSourceInfo.ts`. Because one row can
be shared across several families with different valid group ranges, the
admin page doesn't hard-block an edit against any single range; it shows
each row's applicable families and their live valid ranges (read fresh from
`price_grid_groups` on every page load, not hardcoded) and flags a value
that falls outside one of them, the same honesty-over-restriction approach
used for pricing constants and option lists. An out-of-range group still
fails loudly at quote time (`loadBlindDataSource`'s "No price grid for..."
error) rather than silently mispricing, so this is a guardrail, not a hole.

Building this also surfaced a real, previously undocumented gap: **Honeycomb
has a working pricing engine (`honeycomb.ts`, validated since Phase 3) but
no live quoting route anywhere in the app.** It's missing from
`blindFamilies.ts` and from `seed.ts`'s `families` catalog -- an estimator
cannot create a Honeycomb line item today, full stop, regardless of what's
in `blind_fabric_options`. The three Honeycomb rows in the Blind Fabric
Groups admin page are badged "not wired to a form" for exactly this reason.
This wasn't scoped as part of admin UI work -- adding a Honeycomb route
would mean a sixth family added to `blindFamilies.ts` (it doesn't fit that
config as-is, since its price-grid family name depends on control style,
see `honeycomb.ts`'s file comment) or its own dedicated route/form, more
like Roller than the generic five. Worth deciding on purpose, not by
default.

**Fabric Import, and why it's a synchronous upload rather than the
background-job pipeline architecture-proposal.md sketched.** That doc
proposed a queue (Inngest/Trigger.dev) for parsing uploaded price lists,
written before knowing the real scale. In practice the whole seeded fabric
library -- 11 suppliers combined -- is 3,313 rows; one supplier's own price
list is a few hundred to low thousands of rows, comfortably inside a single
Server Action request. `/admin/fabric-import` parses the `.xlsx` upload
synchronously (`fabricImport.ts`, pure functions, unit-tested independently
of any DB or file I/O), diffs it against that supplier's current fabrics,
and stages the result in a new `fabric_import_batches` row -- nothing
touches `fabrics` until an admin reviews the diff and clicks Approve.
`next.config.ts`'s default 1MB Server Action body limit was raised to 10MB
for the upload itself (`experimental.serverActions.bodySizeLimit`); revisit
with a real queue only if a supplier's file ever doesn't fit this, not
before, since that infra has an ongoing cost/complexity budget this doesn't
need yet.
- **Column detection is a guess, and says so when it is one.** The first row
  is read as headers; name/price columns are matched by keyword (`name`/
  `fabric`/`code`/`description` for name, `price`/`rate`/`cost`/`rrp`/`$`
  for price). When that fails, it falls back to whichever column parses as
  numbers most often in a sample of rows -- and the review page shows an
  explicit warning banner in that case rather than silently trusting the
  guess, since a wrong column match would mis-price every row in the batch.
- **The diff never overwrites ambiguously.** A parsed row is "new" if the
  name doesn't exist yet for that supplier, "price_change" if it matches
  exactly one existing fabric at a different price (this also reactivates a
  fabric seeded inactive with an unusable price, e.g. the 4 real `"#N/A"`
  fabrics from Phase 6 -- a price on a fresh list reads as "available now"),
  "unchanged" if the price already matches, and "ambiguous" if the name
  matches *more than one* existing fabric -- which happens for real, not
  hypothetically: Zepel "Dadaism" and CP "Softdrape Plus" both legitimately
  exist twice at two different prices (see Phase 6). Approving a batch only
  ever applies "new" and "price_change" rows; ambiguous and invalid-price
  (unparseable) rows are always left for manual resolution on Fabric
  Prices, the same "don't guess, surface it" principle as every other
  admin page in this app.
- PDF price lists needed their own table-extraction pass and shipped in a
  later phase, not this one -- Excel was genuinely the "easy path"
  architecture-proposal.md called it, and shipped first on its own; see
  "PDF fabric price lists" further down for how PDF was eventually added.

**Curtain pricing is now database-backed too, mirroring `BlindDataSource`
exactly.** `curtain.ts`'s `priceCurtain()` takes an optional `CurtainDataSource`
the same way `genericBlind.ts`'s pricing functions take a `BlindDataSource`:
default to the original JSON-backed implementation (zero behavior change,
`curtain.test.ts`'s 12 tests still pass unchanged) with a DB-backed
implementation (`curtainDataSource.ts`'s `loadCurtainDataSource(db)`) used by
the live app. `previewCurtainPrice` and `addCurtainLineItem` in `actions.ts`
now load that DataSource from Postgres per request instead of importing the
static JSON module directly.

Building the read path turned up a real, previously undocumented gap:
**`curtain_price_lists` has existed in `schema.ts` since Phase 2, but nothing
had ever written to it or read from it.** The 11 curtain fixtures validated
back in Phase 4 exercised the JSON-backed path only. Seeding it this phase
(62 matched track-length/price pairs out of `curtain_pricing/named_ranges.json`)
was genuinely new work, unlike `Fullnesses`, `LayoutBends`, and all 11
curtain pricing constants, which turned out to already be sitting in the
database since Phase 1/6/9 -- just never read from there until now.

Matching those 62 pairs surfaced a real bug in the **source workbook's own
named ranges**, not in this app's code: one track-length/price pair can
never match by name because of a capitalization difference --
`"...somfySeries82rtsswaveTrackLengths"` (lowercase "somfy") vs
`"...SomfySeries82rtsswavePrices"` (capitalized) -- so that combination has
a track-length list with no matching price list under any name. Six other
`*TrackLengths` keys have no `*Prices` counterpart at all (`OtherWS`,
`OtherWSTWMotorSomfySeries82Batteryswave`,
`OtherWSTWMotorSomfySeries82Battery`, `Upleat2Sell`, `UpleatSell`,
`UpleatWS`). All seven are logged explicitly by `seed.ts` at seed time
rather than silently dropped -- worth flagging to Clive as a genuine
data-quality issue in the source spreadsheet, not something this app can
fix on its own.

**`curtain_price_lists.track_lengths_mm` is named as if millimetres but
actually holds centimetres.** The column name matches the blind-side
convention (`price_grid_groups` genuinely stores mm), but `curtain.ts`'s
own `trackLengthCm` is centimetre-denominated, and the seeded values are
copied straight from the workbook's cm-based named ranges. Renaming the
column is a real schema migration and out of scope for this pass, so it's
documented in the column's code comment instead of silently left
confusing; tracked below as a deferred cleanup.

**`CordCost` was corrected out of the editable-curtain-constants list.**
It lived in the old constants list alongside genuinely-read curtain
constants, but grepping `curtain.ts` for `CordCost` turns up zero matches
-- it's an unread extraction artifact, same bucket as the `*WScale`/
`*HScale` values, not a live pricing knob. Left it editing it would have
done nothing when saved, so it moved to the "artifact, not shown" bucket
in `pricingConstantsConfig.ts`'s file comment instead.

Verification for this phase went beyond the usual spot-checks: a one-off
script ran `priceCurtain()` against all 11 real historical fixtures through
both the JSON-backed and DB-backed DataSource and asserted the two results
were byte-for-byte identical (`JSON.stringify()` equality), including the 3
genuine `#N/A` oversized-track fixtures -- not just "looks right," but a
literal zero-diff confirmation the refactor changed nothing observable.
Live Playwright verification on top of that created a real curtain quote
through the actual UI and confirmed it priced correctly end-to-end, then
edited `MitreCost` by +$10 on the Pricing Constants admin page and confirmed
the curtain preview price moved by exactly +$20 (mitres = 2 x MitreCost) --
proving the admin edit path and the quoting path are reading the same live
row, not two independent copies.

**Staff Logins (`/admin/users`), and why creating an account there needed a
different Server Action pattern than every other admin page.** Before this,
the only way to add a login was `npm run seed:admin` -- a CLI script that
needs a terminal and a direct `DATABASE_URL` connection, which meant only
whoever had database access could add a teammate. This admin page lets an
existing admin create, edit, and deactivate logins instead; `active`
(`schema.ts`) is a new boolean users column, checked in `auth.ts`'s
`authorize()` right after the password check, so a deactivated account fails
to sign in the same way a wrong password would (same generic "incorrect
email or password" message either way -- doesn't confirm to whoever's at the
login form that the email exists at all). Deactivating rather than deleting
keeps the row's history intact and is reversible; there's no cascading
reference to clean up either way, since `quotes` has no `createdBy`/user
link today.

Two safety guards stop this page from being able to lock everyone out with
no CLI fallback: an admin can't demote or deactivate their own row, and the
last remaining active admin can't be demoted or deactivated by anyone else
either. Both are enforced in `updateUser` against a fresh database read of
the target row, not the submitted form values, so a stale form can't be used
to sneak past them -- verified directly by attempting a self-demote against
a real running instance and confirming it's rejected, not silently applied.

**A real, previously undocumented production bug found while verifying that
self-demote guard, affecting every admin action in the app, not just this
page's.** Next.js redacts a thrown Server Action error's message by default
in a production build (`next build && next start`) -- the client receives a
generic "Application error: a server-side exception has occurred" with only
a digest number, not the actual message, even though the real message is
right there in the server log. This is deliberate Next.js behavior (avoiding
an accidental error-message information leak by default), not a bug in
Next.js itself, but it meant every existing admin action's `throw new
Error("...")` -- `updateFabricPrice`, `updatePricingConstants`,
`updateOptionListValues`, `updateBlindFabricGroup`, `startFabricImport`,
`approveFabricImport`, `rejectFabricImport` -- has been showing a blank,
unhelpful crash page instead of its validation message in production this
entire time, and nothing in this project's testing had caught it because
verification had always run against `next dev` (which shows the real
message in its overlay) rather than a genuine production build. Confirmed
by actually building and running the app in production while testing the
self-demote guard, not assumed: the guard rejected the edit correctly every
time, but the screen said nothing useful about why until this was fixed.

Fixed two ways, deliberately different in scope. `createUser`/`updateUser`
now return a `{ error, successAt }` state instead of throwing, and their
forms (`NewUserForm.tsx`, `UserRow.tsx`) use React 19's `useActionState` to
display that message inline -- the officially-supported way to get a real
message back to the client, since Next's redaction applies to thrown errors
specifically, not to values an action returns normally. That's a real
per-action rewrite, so it was only done for this page's two actions, not
retrofitted onto the other seven admin actions in this pass (tracked below).
Separately, `src/app/admin/error.tsx` is a new error boundary for the whole
`/admin` section, so any action that still throws shows a plain "something
went wrong" message with a Try Again button instead of the completely blank
digest page -- not the real validation text (Next still redacts that part),
but a real improvement over what every admin page showed before this phase,
with no per-action changes needed.

**The remaining seven admin actions got the same `useActionState` rewrite in
the next pass, closing out the gap the paragraphs above left open.** A
shared `ActionState` interface (`{ error, successAt }`) now lives once at the
top of `adminActions.ts`; every action's signature changed from `(...args,
formData)` to `(...args, _prevState: ActionState, formData): Promise<
ActionState>`, and every remaining `throw new Error(...)` became a `return
{ error: msg, successAt: null }`. `startFabricImport`'s success path is the
one exception worth noting -- it still ends in `redirect()` on success rather
than returning a state, because `redirect()` is a framework-recognized
signal distinct from a thrown error and passes through `useActionState`
unaffected. `requireAdmin()`'s own failure is the one throw left in every
action, deliberately: it's a genuine defence-in-depth auth check, not user
input validation, and `middleware.ts` already stops a non-admin from
reaching any of these pages before the action can even run, so
`admin/error.tsx` is what actually catches it now, not a validation-message
gap. Six new Client Components (`FabricRow.tsx`, `BlindFabricRow.tsx`,
`PricingConstantsForm.tsx`, `OptionListEditor.tsx`,
`FabricImportUploadForm.tsx`, `ApproveRejectButtons.tsx`) replaced the
inline server-rendered forms on their six pages, each wired to its action
with `useActionState` the same way `NewUserForm.tsx`/`UserRow.tsx` were.
Confirmed via `npm run build`'s own output, not just a typecheck: every
converted admin page's client-JS bundle size grew from the ~168-179 B a
purely server-rendered page ships to 829 B-1.42 kB, a concrete sign the
conversion actually shipped real client code rather than silently no-op'ing.
`npx tsc --noEmit` stayed clean and all 74 existing tests kept passing
throughout, since none of this touched pricing logic.

Live verification against a real production build surfaced a genuine
test-methodology gap, not an app bug: three of the nine cases (Pricing
Constants, Blind Fabric Groups, and Fabric Import's no-file case) initially
looked unfixed, showing no error message at all after submitting invalid
input. The cause was the app's own HTML5 `min="0"`/`min="1"`/`required`
attributes on those inputs -- correct, desirable behaviour that blocks the
browser from ever sending the bad request in the first place, but it also
meant a normal Playwright form-fill-and-submit never reached the server
action for those three cases either, dev build or production. Fixed in the
verification script (not the app) by stripping the relevant attribute with
`page.evaluate()` immediately before each of those three submissions, so the
request goes to the server the way a non-JS client, `curl`, or a hand-built
malformed request actually would -- exactly the scenario the whole
`ActionState` rewrite exists to protect against. With that in place, all ten
checks passed: every one of the seven newly-converted actions shows its real
validation message on bad input, an existing successful edit still applies
and displays correctly, and the Fabric Import approve/reject flow still
works end-to-end including the "no more buttons after approval" guard.

**PDF fabric price lists, and why the extraction had to be built from raw
text positions rather than any table-aware PDF library.** A PDF carries no
row/column/cell structure at all -- pdf.js (`pdfjs-dist`, the library used
here) only reports where each run of text sits on the page, so
`parsePdfBuffer` (`fabricImport.ts`) reconstructs a table itself: groups
text runs into lines by y-position, then splits each line into cells
wherever the horizontal gap between two runs is wide enough to be a column
boundary rather than ordinary word-spacing, and resolves `headers`/`rows`
to the exact same plain grid shape `parseWorkbookBuffer` already produced
for Excel -- so every step after parsing (`detectColumns`, `buildParsedRows`,
`diffAgainstExisting`) needed no changes at all and is completely unaware
which format a given upload was.

Finding the column-gap threshold turned out to need two different signals,
not one, discovered by testing against PDFs built two genuinely different
ways. A gap-clustering approach (find the biggest jump between "normal"
word-spacing gaps and "much bigger" column gaps, the same idea behind
`pdftotext -layout` + a column pass) works well against a PDF where each
word is its own separate text run with visible small gaps between them --
true of a browser's HTML-table-to-PDF rendering, used for an early test
fixture. But a real `pdf-lib`-generated fixture (each cell placed as one
whole `drawText()` call, closer to how a report/price-list generator
actually writes a PDF) has exactly *one* gap per row and nothing smaller to
contrast it against, so pure clustering found nothing to split on and left
every row as a single unsplit cell -- caught by testing against that
fixture specifically, not assumed to work from the first test alone. Fixed
by adding a second, independent signal: an absolute floor scaled to the
document's own average character width (a real column gap should fit a
few real characters, not just a wide space), used as-is when clustering
finds nothing trustworthy, and only ever pushed higher by clustering when
clustering does find a clean two-cluster split.

Documented, not silently handled: a table cell that wraps onto a second PDF
line (a long fabric name in a narrow column) produces two output rows, not
one merged one -- and the second one, the wrapped remainder, sits on the
same PDF line as the row's real price, so it can read as a legitimate new
fabric named after a name fragment at a real price, not just a harmless
unparseable row. Approving a batch applies every "new"/"price_change" row
at once with no per-row selection, so this is a real, if narrow, risk if an
admin doesn't actually read the review table before approving -- mitigated
today only by that review step, the same safety net ambiguous and
invalid-price rows already rely on, not a structural fix. `parsePdfBuffer`'s
own doc comment has the full detail, including why a repeated header row on
a multi-page price list is comparatively harmless (its "price" cell holds
header text, which fails to parse as a number and surfaces as an ordinary
`invalid_price` row).

Verified two ways. `fabricImport.test.ts` builds real PDF fixtures at test
time with `pdf-lib` (a from-scratch PDF writer, independent of `pdfjs-dist`,
which is what actually parses them) -- a clean two-column table with single
whole-cell text runs, a three-column table feeding straight into
`detectColumns`/`buildParsedRows` the same way an Excel upload does, a
table spanning a page break, a right-aligned price column whose data cells
don't share the header's exact x-position, an empty PDF, and the documented
wrapped-cell failure mode reproduced and asserted rather than just
described. Separately, live end to end with Playwright against a real
production build and a live local Postgres: uploaded a real generated PDF
exercising a new/price-change/unchanged row each, confirmed the review page
showed all three correctly with column detection reported confident,
approved it, and confirmed via the database that exactly the new fabric and
the price change applied while the unchanged row stayed untouched.

That live run also caught a real, production-only bug the unit tests and
local script testing couldn't have: `pdfjs-dist`'s worker-loading fallback
resolves a relative path (`pdf.worker.mjs`) that only exists next to its own
file in `node_modules` -- once Next's webpack bundles it into a
`.next/server/chunks/*.js` file for a real production build, that relative
path no longer resolves, and every PDF upload failed with a generic,
redacted Server Components render error. `pdfjs-dist` runs directly against
`node_modules` via tsx in a standalone script, which is why it worked in
every manual test right up until it was exercised through the actual built
app. Fixed the same way `pg` already was: added to `next.config.ts`'s
`serverExternalPackages`, which keeps its own file layout intact by
skipping webpack bundling for it entirely.

**Versioned migrations, replacing `drizzle-kit push` as the way this app's schema reaches a real
database.** `push` computes a schema diff against whatever `DATABASE_URL` points at and applies it
in the same step -- nothing to review beforehand, and no record afterward of what actually ran. That
was fine for this project's own disposable local dev database through every phase so far, but not
for Neon, a database other people's real data will live in. `db:generate` (already an existing but
unused script) writes the diff to a plain SQL file under `./drizzle` instead of touching any
database, and a new `db:migrate` (`src/db/migrate.ts`, using drizzle-orm's own `migrate()`) applies
whichever of those files haven't run yet, tracked in a migrations table Drizzle manages itself --
safe to run repeatedly, and safe against a brand-new empty database, which is exactly what a fresh
Neon project is.

Generating the first migration (`0000_baseline.sql`) against `schema.ts` as it stands today produced
all 16 tables, every unique index (including the partial one on `fabrics` for null-priced rows), and
every foreign key in one file -- but a generated migration is only trustworthy if it actually
reproduces what years of incremental `push` calls already built, not just what looks plausible on
its own. Verified by applying it to a genuinely empty database and `pg_dump --schema-only`-comparing
the result against this project's own long-lived push-built dev database: identical, byte for byte,
apart from the new `drizzle.__drizzle_migrations` tracking table (expected -- that's the whole point)
and one cosmetic column-order difference on `users` (`active` was added by a later `push` call after
`created_at` already existed, so it physically sits last in the push-built table even though
`schema.ts` declares it earlier -- column order has no effect on anything Drizzle or this app does,
since every query addresses columns by name). Beyond the structural diff, the migrated database was
also proven to actually work, not just look right: `npm run seed` populated all 16 tables correctly
(3,313 fabrics, 40 price grids, 217 blind fabric options, everything), and a real login, quote
creation, and Roller price preview all worked end to end against it through the actual running app --
exercising `users`, `quotes`, and the pricing-engine's own reads across `blind_fabric_options`/
`price_grid_groups`/`control_prices`/`fabrics` for real, not just checking the empty schema shape.
`quote_line_items` specifically (the one table that vertical slice didn't reach, after a form-submit
click that turned out to have a pre-existing Playwright interaction quirk in this environment --
confirmed unrelated to migrations by reproducing identically against the untouched push-built
database, not chased further since it's a test-script issue, not an app or schema one) was confirmed
separately with a direct insert/join through its foreign key and jsonb columns.

`db:push` still exists, deliberately -- fast iteration on a schema change still being drafted, before
it's worth generating a real migration file for, is a genuinely useful thing to keep. What changes is
that it's no longer how a schema change is expected to reach any database other than a disposable
local one; see "Running it" above for the new expected flow.

### Width Definition (curtain quote lines)

The source workbook's Curtain Quote sheet computes a value in its AT column ("Width Definition") that
never got ported when `curtain.ts` was first built -- a workroom-facing shorthand for how many fabric
widths make up a curtain and how much fabric each needs, e.g. `"2x7.4m"` (a pair, 7.4m of fabric each
side) or `"1x9.7m"` (a single panel). It's purely descriptive -- confirmed against the source formulas
that it plays no part in `calculatedPrice` -- but the Curtain Install document (not yet built; see
"What's not here yet") pulls it by raw cell reference (`VLOOKUP(...,'Curtain Quote'!...,46,0)`) for
every line, so it's needed now even though nothing consumes it yet beyond the line-item price preview.

Reproducing it needed one input that was also never captured: the "Stack" field (Curtain Quote's H
column, validated against the `Stacks` named range -- `1WL`/`1WR`/`2W`/`1ANY`/`2ANY`), which drives the
source's "2way?" flag (`AM` column). Traced through every formula that reads `AM` to confirm it's
otherwise unused -- `trackLengthCm`, `makeHeightCm`, and `fabricQuantityM` don't reference it, so this
was safe to add without touching any existing calculated price. Added as a required dropdown on the
curtain form (backed by the `Stacks` option list, which turned out to already be seeded -- it's one of
the ~75 lists from Phase 9, just not wired to a form until now), wired through `priceCurtain()`, and
shown as "Width Definition" in the price-preview breakdown alongside the existing calculated fields.

Verified against all 11 real historical quote lines -- matches the workbook's own AT values exactly,
covering both the `1x` and `2x` cases -- and live end to end with Playwright against a real production
build and a local Postgres seeded from the existing extraction data: added a curtain line item with a
`1WL` Stack, confirmed "Width Definition: 1x7.3m" in the live preview and on the saved line, then opened
it via Edit and confirmed the Stack came back pre-filled with the same value shown immediately in the
initial preview (same pattern as every other field, see Phase 18 above).

### Curtain fabric price: cost vs. sell price

Reported directly by Clive: picking a fabric on the curtain form brought across the fabric's raw cost
price, not the sell price the source workbook actually quotes to a customer. Confirmed as a real bug,
not a misunderstanding -- `fabrics.pricePerMetre` in the database is exactly each supplier sheet's own
"Price" column (a cost, unchanged since Phase 1's extraction), but Curtain Quote's own `$ P/M` field (M
column) is a *computed* value:

```
=MIN(IF(SellPricePoints>=cost*2, SellPricePoints))
```

i.e. double the cost, then round up to the nearest of 16 published sell-price bands (`$0, $30, $36, $41,
$46, $51, $56, $66, $76, $90, $105, $120, $135, $150, $165, $180` -- `Curtain_Pricing!$A$106:$A$121`).
The curtain fabric-selection UI (built in Phase 7) auto-filled the raw cost directly into Price per
metre the whole time, because this cost-vs-sell distinction was never traced until now.

- **`priceCurtain()` itself was never wrong.** `pricePerMetre` is an *input* to the pricing formula, not
  something the engine computes -- and all 11 real historical fixtures already carry the correct,
  pre-computed sell price extracted straight from the workbook (Zepel "Audiance": cost $35, sell $76), so
  `curtain.test.ts`'s validation was never exposed to this bug. The gap was entirely in
  `getCurtainFabricsForSupplier()` (`actions.ts`), the function that auto-fills the form's price field.
- **`SellPricePoints` was already extracted, like `Stacks` before it, just never seeded or read** --
  sitting in `curtain_pricing/named_ranges.json` since Phase 1. Now seeded into `option_lists` (`seed.ts`)
  and read via the same `getOptionListValues()` path as every other option list; no schema change.
  `computeCurtainFabricSellPrice()` (new, `curtainFabricSellPrice.ts`) is the pure function that applies
  the formula -- deliberately kept separate from `curtain.ts`, since it's not part of that formula chain.
- **A real edge case, confirmed by actually recalculating the source workbook (LibreOffice, not guessed).**
  About 15% of the real fabric library (498 of 3,309 fabrics checked, any cost over $90) has a cost high
  enough that doubling it exceeds every published band. In the real spreadsheet, that formula silently
  evaluates to **$0** -- reproducing that literally would trade one silent underpricing bug for a worse
  one. Matching this app's established "flag rather than guess" pattern (`curtain.ts`'s
  `track_length_exceeds_bands`, the blind families' oversized handling),
  `computeCurtainFabricSellPrice()` returns `null` for these instead; the fabric dropdown shows "(enter
  price manually)" and the form leaves Price per metre blank with an explanatory message rather than
  auto-filling anything.
- **Worth checking in production.** Any curtain quotes created since the fabric-selection UI shipped
  (Phase 7) where the estimator picked a fabric and did *not* manually override the auto-filled price
  would have been priced at roughly half (or less) of the correct sell price -- the Price per metre field
  has always been editable, so a quote is only affected if it was left at its auto-filled value. This
  session has no access to the production database to check itself; worth a look at
  `quote_line_items` rows with `family_slug = 's_wave_sheer'` where the stored `pricePerMetre` matches a
  known fabric *cost* rather than its sell price.
- Verified with 5 new unit tests (`curtainFabricSellPrice.test.ts`, including all 11 real fixtures, a
  round-up-to-the-next-band case, an exact-band-boundary case, and the null/over-tier case) and live end
  to end with Playwright against a real production build: selecting Zepel "Audiance" now shows
  "($76.00/m)" and auto-fills 76 (previously "$35.00/m"/35); selecting a real over-tier fabric (JamesDunlop
  "Hattusa F0797", cost $215) shows "(enter price manually)", leaves the price field blank, and displays
  the manual-price message instead of silently filling in a wrong number.

## What's not here yet

- The non-sheer and Upleat curtain styles, the Lined lining-cost path, and
  the "Over"/"OH" 2.2x surcharge -- transcribed from the formulas but no
  real data to validate against yet (see above). Width Definition's
  Drops-based ("...d" suffix) branch belongs to this same unvalidated path
  and is deferred alongside it -- see "Width Definition" above.
- The Curtain Install document itself -- Width Definition (above) is ready
  for it, but the document/PDF isn't built yet, same status as every other
  order/production form (Track/Roller/Venetian/Roman Order Form, Blind
  Install, Curtain Making, Install Time).
- A live quoting route for Honeycomb blinds -- the pricing engine
  (`honeycomb.ts`) has been validated since Phase 3, but there's no form
  anywhere in the app to actually create a Honeycomb line item. Found while
  building the Blind Fabric Groups admin page (see "The app layer"); needs
  a deliberate decision on whether it fits the shared `blindFamilies.ts`
  config or needs its own route like Roller, not just wiring in as-is.
- A real audit trail for option list edits, matching what pricing
  constants got (a new versioned row per save) -- option list saves
  currently overwrite in place, no history kept.
- `curtain_price_lists.track_lengths_mm` actually stores centimetres, not
  millimetres -- copied straight from the workbook's cm-based named ranges
  and named to match the blind-side (genuinely mm) convention. A real
  schema migration (rename + a migration for any already-seeded rows in a
  deployed environment), deliberately not done in the same pass that
  seeded it. See "The app layer" for how this was found.
- A source-data quality issue worth flagging to Clive directly, not just
  documenting here: the workbook's own named ranges have a
  `"somfySeries82rtsswaveTrackLengths"` (lowercase) that can never match
  its `"SomfySeries82rtsswavePrices"` (capitalized) counterpart, plus six
  other track-length lists with no matching price list under any name.
  These are genuine gaps in the source spreadsheet this app inherited, not
  bugs introduced here -- see "The app layer" for the full list.
- A real, structural fix for the PDF wrapped-cell risk documented in "The
  app layer" -- a fabric name that wraps onto a second PDF line can surface
  as a spurious "new" fabric with a real price, currently caught only by an
  admin actually reading the review table before clicking Approve, not by
  the app itself. Worth a per-row approve/skip control on the review page,
  or real multi-line-cell merging, if a real supplier PDF turns out to wrap
  names in practice -- not built speculatively ahead of that.
- Deployment to a real Neon database and Vercel project — everything here
  has been run against a local Postgres and `next dev`/`next start` only.
  `DATABASE_URL` and `AUTH_SECRET` need real values in that environment
  (see `.env.example`); the dev-only secret used while building this is
  not secure and must not be reused.
