import type { PrismaClient } from "@/generated/prisma/client";
import { toResult } from "./memory";
import type { RateLimiter, RateLimitResult, RateLimitRule } from "./types";

type Row = { count: number; expiresAtEpoch: number };

/**
 * Fixed-window limiter stored in the RateLimitBucket table.
 * One atomic upsert per hit, so it's correct across Vercel instances.
 *
 * Prisma stores DateTime as UTC `timestamp(3)`, so times are passed as UTC ISO
 * strings and converted explicitly. That keeps it independent of the DB session timezone.
 */
export class PostgresRateLimiter implements RateLimiter {
  constructor(
    private db: Pick<PrismaClient, "$queryRaw" | "$executeRaw">,
    private now: () => number = Date.now,
  ) {}

  async hit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const nowMs = this.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresIso = new Date(nowMs + rule.windowSeconds * 1000).toISOString();

    const rows = await this.db.$queryRaw<Row[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "expiresAt")
      VALUES (
        ${key},
        1,
        (${nowIso}::timestamptz AT TIME ZONE 'UTC'),
        (${expiresIso}::timestamptz AT TIME ZONE 'UTC')
      )
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."expiresAt" <= EXCLUDED."windowStart" THEN 1
          ELSE "RateLimitBucket"."count" + 1 END,
        "windowStart" = CASE
          WHEN "RateLimitBucket"."expiresAt" <= EXCLUDED."windowStart" THEN EXCLUDED."windowStart"
          ELSE "RateLimitBucket"."windowStart" END,
        "expiresAt" = CASE
          WHEN "RateLimitBucket"."expiresAt" <= EXCLUDED."windowStart" THEN EXCLUDED."expiresAt"
          ELSE "RateLimitBucket"."expiresAt" END
      RETURNING
        "count",
        EXTRACT(EPOCH FROM ("expiresAt" AT TIME ZONE 'UTC'))::float8 AS "expiresAtEpoch"
    `;

    const row = rows[0];
    if (!row) throw new Error("Rate limiter upsert returned no row");
    return toResult(Number(row.count), Number(row.expiresAtEpoch) * 1000, rule, nowMs);
  }

  async reset(key: string): Promise<void> {
    await this.db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" = ${key}`;
  }
}
