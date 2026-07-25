import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/constants";

/**
 * Edge gate: fast redirect UX only. REAL authentication & authorization happen
 * server-side (lib/auth/session.ts) in every layout, page, action and route —
 * the cookie's mere presence is never trusted for data access.
 */

const PUBLIC_PATHS = ["/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSessionCookie = req.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && !hasSessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }

  if (isPublic && hasSessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts|uploads|api/health).*)"],
};
