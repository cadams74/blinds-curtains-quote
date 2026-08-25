import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { users } from "./db/schema.js";
import { authConfig } from "./auth.config.js";

/**
 * Full Auth.js config -- Node runtime only (route handlers, Server
 * Components, Server Actions all default to Node on Vercel, unlike
 * middleware). This is where the actual Credentials check against the
 * database lives; see auth.config.ts for why it's split out from the
 * Edge-safe half that middleware.ts uses.
 *
 * Internal staff login only -- no self-signup, no OAuth. Clive (and any
 * team members he creates) log in with email + password against the
 * `users` table; accounts are created with `npm run seed:admin` or by an
 * admin later via the admin area, not by anyone signing themselves up.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Deactivated staff (see admin/users -- "Staff Logins") fail the
        // same way a wrong password would, not with a distinct message --
        // don't confirm to whoever's at the login form that the email
        // exists at all.
        if (!user.active) return null;

        return { id: String(user.id), email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
});
