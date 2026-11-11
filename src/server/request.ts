import "server-only";

type HeaderSource = Pick<Headers, "get">;

/**
 * Best-effort client IP for rate limiting and audit logs.
 * On Vercel, x-forwarded-for is set by the platform and can't be spoofed.
 * When self-hosting, make sure the reverse proxy overwrites it.
 */
export function getClientIp(headers: HeaderSource): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Only allow same-site relative paths, so a link can't redirect people elsewhere. */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
