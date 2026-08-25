import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the Auth.js config -- no bcrypt, no Postgres driver,
 * nothing that needs the Node runtime. middleware.ts runs on Vercel's Edge
 * runtime by default, and building it against the full auth.ts (which pulls
 * in `pg` and `bcryptjs` for the Credentials provider's authorize()) either
 * warns at build time or breaks outright at request time, since neither
 * library works in Edge. Kept separate on purpose: middleware only needs to
 * check "is there a valid session cookie", never to actually verify a
 * password against the database.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Vercel sets AUTH_URL/VERCEL_URL automatically in production so Auth.js
  // can validate the request Host header against the real deployment host.
  // Locally (and on any non-Vercel host) that variable doesn't exist, so
  // trust the incoming Host header instead of rejecting every request.
  trustHost: true,
  providers: [], // real Credentials provider is added in auth.ts (Node runtime only)
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & { role: string }).role = token.role as string;
      }
      return session;
    },
  },
};
