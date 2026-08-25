import { auth } from "@/auth";

/** Server Components/Actions call this to get the current user, throwing if
 * somehow called unauthenticated (defense in depth -- middleware already
 * blocks unauthenticated requests to every route, but a Server Action can
 * in principle be invoked directly). */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  return session.user;
}

/** Same as requireUser(), plus a role check -- for admin-only Server
 * Actions/pages (fabric price edits, pricing constants, etc). Defense in
 * depth again: middleware.ts already blocks a non-admin from ever reaching
 * an /admin page, but a Server Action can in principle be called directly
 * (e.g. from devtools), so this is the actual enforcement point, not just
 * UI-level hiding of the "Admin" link. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Admin access required.");
  return user;
}
