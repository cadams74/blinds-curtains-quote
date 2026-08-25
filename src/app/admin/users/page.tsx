import { asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { Topbar } from "@/components/Topbar";
import { NewUserForm } from "@/components/admin/NewUserForm";
import { UserRow } from "@/components/admin/UserRow";

// See the fuller comment on this same export in admin/pricing-constants/
// page.tsx -- this page has no dynamic route segment or searchParams, so
// without this Next.js would try to statically prerender it at build time
// against whatever the database happens to hold then.
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await auth();
  const selfEmail = session?.user?.email ?? null;

  const users = await db.select().from(schema.users).orderBy(asc(schema.users.email));

  return (
    <>
      <Topbar />
      <div className="page">
        <h1>Staff Logins</h1>
        <p className="muted">
          Every account that can sign in. There&apos;s no self-signup -- an admin creates each login
          here and shares the password out of band, the same trust model{" "}
          <code>npm run seed:admin</code> always used, just reachable without a terminal or database
          access. Deactivating a login (rather than deleting the row) keeps its history intact and
          can be reversed. You can&apos;t remove your own admin access or deactivate your own row
          (marked &quot;you&quot; below), and the last active admin can&apos;t be demoted or
          deactivated either -- both would leave no way back into this page.
        </p>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Add a login</h3>
          <NewUserForm />
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Existing logins</h3>
          {users.length === 0 ? (
            <p className="muted">No users yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Active</th>
                  <th>Reset password</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRow key={u.id} user={u} isSelf={u.email === selfEmail} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
