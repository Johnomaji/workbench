import type { RateLimiter, RateLimitResult, RateLimitRule } from "./types";

type Bucket = { count: number; expiresAt: number };

/** In-process limiter for tests. Not safe across server instances. */
export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(private now: () => number = Date.now) {}

  async hit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      bucket = { count: 0, expiresAt: now + rule.windowSeconds * 1000 };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return toResult(bucket.count, bucket.expiresAt, rule, now);
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}

export function toResult(
  count: number,
  expiresAtMs: number,
  rule: RateLimitRule,
  nowMs: number,
): RateLimitResult {
  const ok = count <= rule.max;
  return {
    ok,
    remaining: Math.max(0, rule.max - count),
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAtMs - nowMs) / 1000)),
  };
}
