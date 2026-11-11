import { createHash, randomBytes } from "node:crypto";

export const INVITE_TTL_HOURS = 72;
export const RESET_TTL_MINUTES = 60;

/** A random, URL-safe one-time token. Only its hash is stored. */
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type TokenState = "valid" | "expired" | "used";

export function tokenState(
  token: { expiresAt: Date; usedAt: Date | null },
  now: Date = new Date(),
): TokenState {
  if (token.usedAt) return "used";
  if (token.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}
