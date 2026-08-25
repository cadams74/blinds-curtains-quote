import Link from "next/link";
import { Topbar } from "@/components/Topbar";

// See the fuller comment on this same export in
// admin/pricing-constants/page.tsx -- kept explicit here too rather than
// relying on Next's implicit static/dynamic detection for an admin-only page.
export const dynamic = "force-dynamic";

export default function AdminIndexPage() {
  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 640 }}>
        <h1>Admin</h1>
        <p className="muted">
          Edit pricing data live, without re-running the seed script. Admin-only -- see
          app/README.md's "The app layer" for how access is enforced.
        </p>
        <div className="card">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <Link href="/admin/fabrics" className="btn">
                Fabric Prices
              </Link>
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                The curtain fabric library's $/metre prices (3,313 seeded fabrics across 11
                suppliers) -- this is the data that actually changes day to day.
              </p>
            </div>
            <div>
              <Link href="/admin/pricing-constants" className="btn">
                Pricing Constants
              </Link>
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                The shared $ constants behind every quote -- installation/booster/cassette costs for
                the six blind families, plus mitre/bend/making costs for curtains. Affects every
                quote at once, in both directions.
              </p>
            </div>
            <div>
              <Link href="/admin/option-lists" className="btn">
                Option Lists
              </Link>
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Dropdown values for every family's form (fabric sources, control types, brackets,
                curtain styles/finishes/tracks/layouts, and more) -- 75 seeded lists, clearly badged
                by whether a live form actually reads each one today.
              </p>
            </div>
            <div>
              <Link href="/admin/blind-fabrics" className="btn">
                Blind Fabric Groups
              </Link>
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Which price-grid group each blind fabric prices against (217 seeded rows) --
                deliberately kept separate from Fabric Prices: this changes which price grid a
                fabric prices against, not a dollar figure.
              </p>
            </div>
            <div>
              <Link href="/admin/fabric-import" className="btn">
                Fabric Import
              </Link>
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Upload a supplier's updated price list (.xlsx) instead of hand-editing every row on
                Fabric Prices -- parses, diffs against what's currently seeded, and stages it for
                review before anything goes live. Excel only for now; PDF price lists still need a
                table-extraction pass (see app/README.md).
              </p>
            </div>
            <div>
              <Link href="/admin/users" className="btn">
                Staff Logins
              </Link>
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Create, edit, and deactivate the accounts that can sign in -- no terminal or database
                access needed, unlike the original <code>npm run seed:admin</code> script this
                replaces for day-to-day use.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
