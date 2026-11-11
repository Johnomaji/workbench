import { NextResponse, type NextRequest } from "next/server";
import { HOME_PATH } from "@/lib/org-path";
import { isSessionCookieName } from "@/lib/session-cookie";
import { auth } from "@/server/auth";
import { getCurrentUser } from "@/server/auth/session";

/**
 * Pages send browsers here when their session cookie no longer works (it
 * expired, was revoked by "sign out everywhere", or the account was
 * deactivated). Clearing it matters: the proxy treats any session cookie as
 * signed in, so a dead one would keep bouncing the visitor from the home page
 * to sign-in.
 *
 * Only a cookie that's already useless is removed, so a link to this address
 * can't sign anyone out.
 */
export async function GET(request: NextRequest) {
  if (await getCurrentUser()) return NextResponse.redirect(new URL(HOME_PATH, request.url));

  const url = new URL("/login", request.url);
  // A cookie that still decrypts belonged to a session that has ended; say so.
  if (await auth()) url.searchParams.set("reason", "signed-out");

  const response = NextResponse.redirect(url);
  for (const { name } of request.cookies.getAll()) {
    if (!isSessionCookieName(name)) continue;
    // __Secure- cookies can only be replaced by a Secure cookie.
    response.cookies.set(name, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: name.startsWith("__Secure-") });
  }
  return response;
}
