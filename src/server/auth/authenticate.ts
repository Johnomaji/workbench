import { loginSchema } from "@/server/validation/auth";
import { RATE_LIMITS, rateLimitKey } from "@/server/providers/rate-limit/rules";
import type { RateLimiter } from "@/server/providers/rate-limit/types";

export type AuthUserRecord = {
  id: string;
  passwordHash: string | null;
  isActive: boolean;
  sessionVersion: number;
};

export type AuthenticateDeps = {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  dummyHash(): Promise<string>;
  limiter: RateLimiter;
  onSuccess(userId: string, ip: string): Promise<void>;
};

export type AuthenticateResult =
  | { ok: true; userId: string; sessionVersion: number }
  | { ok: false; reason: "invalid" | "deactivated" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number };

/**
 * Checks an email + password. Framework-free so it can be unit-tested.
 *
 * - Rate limited per IP and per email before any password work.
 * - Unknown emails still pay for a bcrypt compare (no timing hint).
 * - "deactivated" is only reported once the password is proven correct.
 */
export async function authenticate(
  input: unknown,
  ip: string,
  deps: AuthenticateDeps,
): Promise<AuthenticateResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { email, password } = parsed.data;

  const [byIp, byEmail] = await Promise.all([
    deps.limiter.hit(rateLimitKey.loginByIp(ip), RATE_LIMITS.loginByIp),
    deps.limiter.hit(rateLimitKey.loginByEmail(email), RATE_LIMITS.loginByEmail),
  ]);
  if (!byIp.ok || !byEmail.ok) {
    const waits = [byIp, byEmail].filter((r) => !r.ok).map((r) => r.retryAfterSeconds);
    return { ok: false, reason: "rate_limited", retryAfterSeconds: Math.max(...waits) };
  }

  const user = await deps.findUserByEmail(email);
  if (!user || !user.passwordHash) {
    await deps.verifyPassword(password, await deps.dummyHash());
    return { ok: false, reason: "invalid" };
  }

  const valid = await deps.verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false, reason: "invalid" };
  if (!user.isActive) return { ok: false, reason: "deactivated" };

  await deps.limiter.reset(rateLimitKey.loginByEmail(email));
  await deps.onSuccess(user.id, ip);
  return { ok: true, userId: user.id, sessionVersion: user.sessionVersion };
}
