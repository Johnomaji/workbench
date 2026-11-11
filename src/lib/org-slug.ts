/**
 * An organization's slug is the first part of every URL in it: /acme-media/board.
 * Shared by the sign-up form (to suggest one as people type) and the server
 * (which has the final say).
 */

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;

/** Lower-case letters and digits, single hyphens between them. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Top-level pages of the app (they'd hide the organization), names kept for
 * pages we may add, and names that could be used to mislead people.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // Pages that exist
  "account",
  "api",
  "forgot-password",
  "login",
  "organizations",
  "platform",
  "pricing",
  "privacy",
  "refunds",
  "set-password",
  "signup",
  "terms",
  // Files Next.js serves from the root (link previews, icons)
  "apple-icon",
  "icon",
  "manifest",
  "opengraph-image",
  "robots",
  "sitemap",
  "twitter-image",
  // Likely future pages and well-known paths
  "about",
  "admin",
  "app",
  "assets",
  "auth",
  "billing",
  "blog",
  "careers",
  "changelog",
  "contact",
  "cookies",
  "customers",
  "dashboard",
  "docs",
  "enterprise",
  "features",
  "help",
  "home",
  "invite",
  "invites",
  "legal",
  "logout",
  "new",
  "oauth",
  "press",
  "public",
  "register",
  "security",
  "settings",
  "sign-in",
  "sign-up",
  "signin",
  "sso",
  "static",
  "status",
  "support",
  "www",
  // Could pass for us
  "official",
  "root",
  "staff",
  "system",
  "team",
  "workbench",
]);

/** Suggests a slug from an organization name: "Ação & Co. Media" → "acao-co-media". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, "");
}

/** Why a slug can't be used, or null when it's fine (availability aside). */
export function slugProblem(slug: string): string | null {
  if (slug.length < SLUG_MIN_LENGTH) return `Use at least ${SLUG_MIN_LENGTH} characters.`;
  if (slug.length > SLUG_MAX_LENGTH) return `Keep it under ${SLUG_MAX_LENGTH + 1} characters.`;
  if (!SLUG_PATTERN.test(slug)) {
    return "Use lower-case letters, numbers and single hyphens, starting and ending with a letter or number.";
  }
  if (RESERVED_SLUGS.has(slug)) return "That address is reserved. Try another.";
  return null;
}

/** The next candidate when a slug is taken: acme → acme-2 → acme-3. Stays within the length limit. */
export function slugWithSuffix(slug: string, n: number): string {
  const suffix = `-${n}`;
  return `${slug.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, "")}${suffix}`;
}
