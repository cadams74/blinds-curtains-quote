/**
 * Create (or update the password of) the first admin user. Internal tool --
 * there's no self-signup, so at least one account has to be created this
 * way before anyone can log in.
 *
 *   DATABASE_URL=postgres://... ADMIN_EMAIL=clive@bowlswa.com.au \
 *     ADMIN_PASSWORD=... ADMIN_NAME="Clive" npm run seed:admin
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Admin";

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required.");
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const passwordHash = await bcrypt.hash(password, 12);
  const normalizedEmail = email.toLowerCase();

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail));

  if (existing) {
    await db
      .update(schema.users)
      .set({ passwordHash, name, role: "admin" })
      .where(eq(schema.users.id, existing.id));
    console.log(`Updated existing user ${normalizedEmail} (id ${existing.id}), role=admin.`);
  } else {
    const [created] = await db
      .insert(schema.users)
      .values({ email: normalizedEmail, passwordHash, name, role: "admin" })
      .returning({ id: schema.users.id });
    console.log(`Created admin user ${normalizedEmail} (id ${created.id}).`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
