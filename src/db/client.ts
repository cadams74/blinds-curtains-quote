import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

// Standard Postgres wire protocol via `pg` -- works against a local dev
// Postgres, a self-hosted instance, AND a Neon connection string (Neon
// supports the plain wire protocol, not just its HTTP driver). We're
// running in Next.js's Node runtime (not Edge), so there's no need for the
// serverless-HTTP driver that Edge functions require.
//
// The real connection is created lazily, on first actual use of `db`,
// rather than when this module is first imported. This used to be an
// eager check-and-throw at module scope, which worked fine against every
// environment this app had been built/deployed in so far -- but a real
// deploy platform's build machine imports route modules (including this
// one, transitively, via the auth route) purely to inspect their
// config/exports as part of `next build`, without ever querying the
// database, and that eager throw broke the build there even though the
// app itself never touches the database until a real request comes in.
// The Proxy below keeps the exact same fail-fast behaviour -- `db.<...>`
// still throws immediately with the same clear message if DATABASE_URL is
// missing -- but only when application code actually tries to use it.
type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let realDb: DrizzleDb | null = null;

function getRealDb(): DrizzleDb {
  if (!realDb) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env.local and point it at " +
          "a Postgres database (a local one for dev, or your Neon connection string)."
      );
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    realDb = drizzle(pool, { schema });
  }
  return realDb;
}

export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const real = getRealDb();
    const value = Reflect.get(real as object, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
export type Db = typeof db;
