import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, expectedAuthValue, timingSafeEqual } from "@/lib/auth";

/**
 * Single-user passcode gate.
 *
 * Runs on every non-static request. If APP_PASSCODE is set in the environment
 * and the request lacks a valid auth cookie, redirect to /login.
 *
 * If APP_PASSCODE is unset the gate is disabled (useful for local dev without
 * provisioning env vars).
 */
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /login itself must always be reachable.
  if (pathname === "/login" || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  const expected = await expectedAuthValue();
  if (!expected) return NextResponse.next(); // gate disabled

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && timingSafeEqual(cookie, expected)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  /*
   * Match everything except:
   *   - /_next/static, /_next/image (build assets)
   *   - /favicon.ico, /robots.txt, etc.
   * Public assets stay open so the login page can render.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.png$|.*\\.svg$).*)"],
};
