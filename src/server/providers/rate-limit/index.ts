import "server-only";
import { db } from "@/server/db";
import { RateLimitedError } from "@/server/errors";
import { PostgresRateLimiter } from "./postgres";
import type { RateLimiter, RateLimitRule } from "./types";

export type { RateLimiter, RateLimitRule, RateLimitResult } from "./types";
export { RATE_LIMITS, rateLimitKey } from "./rules";

// Swap this for an Upstash/Redis implementation later without touching callers.
export const rateLimiter: RateLimiter = new PostgresRateLimiter(db);

/** Records a hit and throws RateLimitedError when over the limit. */
export async function enforceRateLimit(key: string, rule: RateLimitRule): Promise<void> {
  const result = await rateLimiter.hit(key, rule);
  if (!result.ok) throw new RateLimitedError(result.retryAfterSeconds);
}
