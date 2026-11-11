export type RateLimitRule = {
  /** Hits allowed per window. */
  max: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  ok: boolean;
  /** Hits left in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the window resets. */
  retryAfterSeconds: number;
};

/**
 * Fixed-window rate limiter. Implementations must be safe across server
 * instances (the in-memory one is for tests only).
 */
export interface RateLimiter {
  /** Records one hit and reports whether the caller is still within the limit. */
  hit(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
  /** Forgets a key, e.g. after a successful sign-in. */
  reset(key: string): Promise<void>;
}
