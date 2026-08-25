import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Built from the Edge-safe authConfig, NOT the full auth.ts -- see
// auth.config.ts for why (middleware runs on the Edge runtime, which can't
// load `pg`/`bcryptjs`). This instance only ever decodes the session
// cookie, never touches the database.
const { auth } = NextAuth(authConfig);

// Every route requires a logged-in session except /login itself and the
// Auth.js API routes it depends on. Internal staff tool -- no public pages.
// /admin/* additionally requires role "admin" -- checked here (not just by
// hiding the Topbar link) since this is the Edge-safe session-cookie check
// that runs before any page code, the same defense-in-depth reasoning as
// requireAdmin() in session.ts for Server Actions.
export default auth((req) => {
  const isAuthed = !!req.auth;
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
  const isLoginPage = req.nextUrl.pathname === "/login";
  const isAdminRoute = req.nextUrl.pathname.startsWith("/admin");

  if (isAuthRoute) return NextResponse.next();

  if (!isAuthed && !isLoginPage) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthed && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  if (isAuthed && isAdminRoute && req.auth?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
