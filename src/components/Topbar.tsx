import Link from "next/link";
import { auth, signOut } from "@/auth";

export async function Topbar() {
  const session = await auth();

  return (
    <div className="topbar">
      <Link href="/" className="topbar-brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- a plain <img>
            keeps this a Server Component; the logo is a small static asset so
            next/image's optimization pipeline isn't worth the extra config. */}
        <img src="/logo.png" alt="Unique Curtains + Blinds" style={{ height: 32, display: "block" }} />
      </Link>
      {session?.user && (
        <div className="topbar-user">
          {session.user.role === "admin" && <Link href="/admin">Admin</Link>}
          <span>
            {session.user.name} <span className="badge">{session.user.role}</span>
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="btn secondary" style={{ padding: "4px 12px" }}>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
