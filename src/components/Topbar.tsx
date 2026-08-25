import Link from "next/link";
import { auth, signOut } from "@/auth";

export async function Topbar() {
  const session = await auth();

  return (
    <div className="topbar">
      <Link href="/" className="topbar-brand">
        Blinds &amp; Curtains Quoting
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
