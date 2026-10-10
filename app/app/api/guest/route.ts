import { NextResponse } from "next/server";
import { consumeGuestSession, RateLimitedError } from "@/lib/ratelimit";
import { authServer } from "@/lib/auth";

// Starts an anonymous (guest) session, then sends the visitor back.
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("redirectUrl") || "/";
  const redirectUrl = raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw : "/";
  // A reverse proxy can expose an internal bind address in request.url.
  // Use the explicitly configured public origin, never an arbitrary Host header.
  const publicOrigin = new URL(process.env.BETTER_AUTH_URL || request.url).origin;
  const destination = new URL(redirectUrl, publicOrigin);
  const target = destination.origin === publicOrigin ? destination : new URL("/", publicOrigin);

  const existing = await authServer.api.getSession({ headers: request.headers });
  if (existing) {
    return NextResponse.redirect(target);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    await consumeGuestSession(ip);
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return new Response(e.message, {
        headers: { "Retry-After": String(e.retryAfterSec) },
        status: 429,
      });
    }
    throw e;
  }

  const res = await authServer.api.signInAnonymous({
    asResponse: true,
    headers: request.headers,
  });
  const out = NextResponse.redirect(target);
  for (const c of res.headers.getSetCookie()) {
    out.headers.append("set-cookie", c);
  }
  return out;
}
