"use client";

/**
 * Error boundary for the whole /admin section. Every admin Server Action
 * (updateFabricPrice, updatePricingConstants, createUser, updateUser, and
 * the rest in adminActions.ts) validates by throwing a plain Error with a
 * human-readable message -- but Next.js redacts thrown Server Action
 * errors by default in a production build, replacing the real message with
 * a generic "Application error" + digest on the client (the real message
 * still reaches the server log, see adminActions.ts's callers, but an
 * admin looking at their screen would see nothing useful at all). Found
 * while verifying the Staff Logins page's self-demote/last-admin guards --
 * without this, tripping one of those guards looked like the app had
 * crashed, not like a validation message. Same "surface it, don't hide it"
 * principle as every other admin page's inline error text; this is just
 * the fallback for the admin actions that throw instead of returning a
 * value (nearly all of them, since none use useActionState yet).
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div className="card">
        <p className="error" style={{ marginTop: 0 }}>
          {error.message || "Something went wrong saving that."}
        </p>
        <button className="btn secondary" type="button" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}
