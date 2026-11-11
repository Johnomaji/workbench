import { NextResponse, type NextRequest } from "next/server";
import { HOME_PATH } from "@/lib/org-path";
import { isSessionCookieName } from "@/lib/session-cookie";
import { MARKETING_PATHS } from "@/lib/site";

/**
 * Optimistic check only: send visitors with no session cookie to sign in.
 * It never touches the database. Every page and action still verifies the
 * session properly in the Data Access Layer (src/server/auth/session.ts).
 */
const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot-password", "/set-password"];

/** The marketing pages, and the files search engines and link previews ask for. */
const PUBLIC_PATHS: ReadonlySet<string> = new Set<string>([
  ...MARKETING_PATHS,
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
  "/icon",
  "/apple-icon",
]);

function isPublic(pathname: string) {
  return (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

function hasSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some(({ name }) => isSessionCookieName(name));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = hasSessionCookie(request);

  // Signed-in people come to the site to get to their work, not the sales pitch.
  if (pathname === "/" && signedIn) return NextResponse.redirect(new URL(HOME_PATH, request.url));
  if (signedIn || isPublic(pathname)) return NextResponse.next();

  const url = new URL("/login", request.url);
  url.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Skip API routes (they authorise themselves), Next internals and static files.
  matcher: ["/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
