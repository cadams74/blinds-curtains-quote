/**
 * Shared return shape for a useActionState-backed Server Action, used
 * outside the admin area (adminActions.ts keeps its own copy of this same
 * shape for its own actions). Returned instead of thrown so the client
 * component driving the form can show the real validation message --
 * Next.js redacts a thrown Server Action error's message by default in a
 * production build (`next build && next start`), replacing it with a
 * generic "Application error"/digest the user never sees the content of.
 * See adminActions.ts's own comment on ActionState (Phase 13/14 of this
 * app's build history) for the full story of how that was found. Any new
 * user-facing Server Action with real input validation should return this
 * shape rather than throw, for the same reason -- requireUser()/
 * requireAdmin()'s own failure is the one thing still allowed to throw,
 * since that's a defense-in-depth auth check, not user-input validation.
 */
export interface ActionState {
  error: string | null;
  successAt: number | null;
}
