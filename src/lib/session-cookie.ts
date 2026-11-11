/**
 * Auth.js's session cookie. It gets a __Secure- prefix over HTTPS and may be
 * split into ".0", ".1" chunks when large.
 */
export function isSessionCookieName(name: string): boolean {
  return name.startsWith("authjs.session-token") || name.startsWith("__Secure-authjs.session-token");
}

/** Where pages send a browser whose session cookie no longer works (see app/api/session-ended). */
export const SESSION_ENDED_PATH = "/api/session-ended";
