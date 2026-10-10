import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC = ["/api/auth", "/api/guest", "/api/health", "/widget.js", "/login", "/register", "/verified"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  // Cheap presence check only; real validation happens in auth() on each route.
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ code: "unauthorized:chat" }, { status: 401 });
  }
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const redirectUrl = encodeURIComponent(pathname);
  return NextResponse.redirect(new URL(`${base}/api/guest?redirectUrl=${redirectUrl}`, request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
