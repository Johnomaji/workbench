import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { MemoryRateLimiter } from "./memory";
import { PostgresRateLimiter } from "./postgres";
import type { RateLimiter } from "./types";

const rule = { max: 3, windowSeconds: 60 };

/** The same behaviour is required of every implementation. */
function contract(name: string, make: (now: () => number) => RateLimiter, before?: () => Promise<void>) {
  describe(name, () => {
    let now: number;
    let limiter: RateLimiter;

    beforeEach(async () => {
      await before?.();
      now = Date.parse("2026-11-07T12:00:00Z");
      limiter = make(() => now);
    });

    it("allows up to the limit, then blocks", async () => {
      const results = [];
      for (let i = 0; i < 4; i++) results.push(await limiter.hit("k", rule));
      expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
      expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    });

    it("reports how long to wait", async () => {
      for (let i = 0; i < 3; i++) await limiter.hit("k", rule);
      now += 20_000;
      const blocked = await limiter.hit("k", rule);
      expect(blocked.ok).toBe(false);
      expect(blocked.retryAfterSeconds).toBe(40);
    });

    it("starts a fresh window once the old one expires", async () => {
      for (let i = 0; i < 4; i++) await limiter.hit("k", rule);
      now += 60_000;
      const result = await limiter.hit("k", rule);
      expect(result).toMatchObject({ ok: true, remaining: 2 });
    });

    it("keeps keys independent", async () => {
      for (let i = 0; i < 4; i++) await limiter.hit("a", rule);
      expect((await limiter.hit("b", rule)).ok).toBe(true);
    });

    it("forgets a key on reset", async () => {
      for (let i = 0; i < 4; i++) await limiter.hit("k", rule);
      await limiter.reset("k");
      expect((await limiter.hit("k", rule)).remaining).toBe(2);
    });
  });
}

contract("MemoryRateLimiter", (now) => new MemoryRateLimiter(now));

// Runs against a real, migrated database when TEST_DATABASE_URL is set.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });
  afterAll(() => db.$disconnect());

  contract(
    "PostgresRateLimiter",
    (now) => new PostgresRateLimiter(db, now),
    async () => {
      await db.rateLimitBucket.deleteMany({});
    },
  );

  describe("PostgresRateLimiter under concurrency", () => {
    it("counts every concurrent hit exactly once", async () => {
      await db.rateLimitBucket.deleteMany({});
      const limiter = new PostgresRateLimiter(db);
      const results = await Promise.all(
        Array.from({ length: 20 }, () => limiter.hit("burst", { max: 5, windowSeconds: 60 })),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(5);
      const row = await db.rateLimitBucket.findUnique({ where: { key: "burst" } });
      expect(row?.count).toBe(20);
    });
  });
} else {
  describe.skip("PostgresRateLimiter (set TEST_DATABASE_URL to run)", () => {
    it("runs against a real database", () => {});
  });
}
