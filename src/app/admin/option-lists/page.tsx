import { asc, ilike } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { OptionListEditor } from "@/components/admin/OptionListEditor";
import { LIVE_OPTION_LIST_NAMES } from "@/lib/liveOptionLists";

// See the fuller comment on this same export in
// admin/pricing-constants/page.tsx. This page reads `searchParams`, which
// already opts it out of static prerendering on its own -- declared
// explicitly anyway for the same reason as admin/fabrics/page.tsx.
export const dynamic = "force-dynamic";

function isFlatStringArray(values: unknown): values is string[] {
  return Array.isArray(values) && values.every((v) => typeof v === "string");
}

function summarize(values: unknown): string {
  if (Array.isArray(values)) return `${values.length} item${values.length === 1 ? "" : "s"}`;
  return typeof values === "string" || typeof values === "number" ? `single value: ${values}` : "other";
}

export default async function AdminOptionListsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const rows = await db
    .select()
    .from(schema.optionLists)
    .where(q ? ilike(schema.optionLists.name, `%${q}%`) : undefined)
    .orderBy(asc(schema.optionLists.name));

  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 800 }}>
        <h1>Option Lists</h1>
        <p className="muted">
          Dropdown values for every family's line item form -- Fabric Sources, Control Types,
          Brackets, curtain Styles/Finish/Tracks/Layouts, and more. {rows.length} lists total.
          "Live" means a form fetches it today; "not wired to a form" means it's seeded but nothing
          currently reads it (see the note on each row below for exactly why).
        </p>

        <div className="card">
          <form action="/admin/option-lists" method="get" className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="q">Search name</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="q" name="q" defaultValue={q ?? ""} placeholder="e.g. Sources" />
              <button className="btn" type="submit">
                Filter
              </button>
            </div>
          </form>
        </div>

        {rows.map((row) => {
          const isLive = LIVE_OPTION_LIST_NAMES.has(row.name);
          const flatValues = isFlatStringArray(row.values) ? row.values : null;
          return (
            <details key={row.id} className="card">
              <summary style={{ cursor: "pointer" }}>
                <strong>{row.name}</strong>{" "}
                <span className="badge" style={!isLive ? { background: "#f1f2f4", color: "var(--muted)" } : undefined}>
                  {isLive ? "live" : "not wired to a form"}
                </span>{" "}
                <span className="muted" style={{ fontSize: 13 }}>
                  -- {summarize(row.values)}
                </span>
              </summary>

              <div style={{ marginTop: 12 }}>
                {!isLive && (
                  <p className="muted" style={{ fontSize: 13 }}>
                    Not currently read by any line item form. Saving a change here won't affect any
                    live quote -- see liveOptionLists.ts for exactly which lists are wired up and
                    why some (like Fullnesses/LayoutBends) are used by pricing but from a different,
                    non-database source.
                  </p>
                )}

                <OptionListEditor id={row.id} flatValues={flatValues} rawValues={row.values} />
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
