import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRateLimiter } from "@/server/providers/rate-limit/memory";
import { RATE_LIMITS } from "@/server/providers/rate-limit/rules";
import { authenticate, type AuthenticateDeps, type AuthUserRecord } from "./authenticate";

const IP = "203.0.113.7";
const EMAIL = "riley@example.com";
const PASSWORD = "correct horse battery";

function setup(user: AuthUserRecord | null = { id: "u1", passwordHash: "hash:ok", isActive: true, sessionVersion: 3 }) {
  let now = 1_000_000;
  const limiter = new MemoryRateLimiter(() => now);
  const deps = {
    findUserByEmail: vi.fn(async (email: string) => (email === EMAIL ? user : null)),
    verifyPassword: vi.fn(async (password: string, hash: string) => hash === "hash:ok" && password === PASSWORD),
    dummyHash: vi.fn(async () => "hash:dummy"),
    limiter,
    onSuccess: vi.fn(async () => {}),
  } satisfies AuthenticateDeps;
  return { deps, limiter, advance: (ms: number) => (now += ms) };
}

describe("authenticate", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("signs in with the right email and password", async () => {
    const result = await authenticate({ email: EMAIL, password: PASSWORD }, IP, ctx.deps);
    expect(result).toEqual({ ok: true, userId: "u1", sessionVersion: 3 });
    expect(ctx.deps.onSuccess).toHaveBeenCalledWith("u1", IP);
  });

  it("normalises the email (case and spaces)", async () => {
    const result = await authenticate({ email: "  Riley@Example.COM ", password: PASSWORD }, IP, ctx.deps);
    expect(result.ok).toBe(true);
    expect(ctx.deps.findUserByEmail).toHaveBeenCalledWith(EMAIL);
  });

  it("rejects a wrong password", async () => {
    const result = await authenticate({ email: EMAIL, password: "nope" }, IP, ctx.deps);
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(ctx.deps.onSuccess).not.toHaveBeenCalled();
  });

  it("still runs a password check for unknown emails (no timing hint)", async () => {
    const result = await authenticate({ email: "nobody@example.com", password: PASSWORD }, IP, ctx.deps);
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(ctx.deps.verifyPassword).toHaveBeenCalledWith(PASSWORD, "hash:dummy");
  });

  it("treats an account with no password yet (pending invite) like an unknown email", async () => {
    ctx = setup({ id: "u2", passwordHash: null, isActive: true, sessionVersion: 0 });
    const result = await authenticate({ email: EMAIL, password: PASSWORD }, IP, ctx.deps);
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(ctx.deps.verifyPassword).toHaveBeenCalledWith(PASSWORD, "hash:dummy");
  });

  it("only reveals deactivation after the password is proven correct", async () => {
    ctx = setup({ id: "u3", passwordHash: "hash:ok", isActive: false, sessionVersion: 0 });
    expect(await authenticate({ email: EMAIL, password: "wrong" }, IP, ctx.deps)).toEqual({ ok: false, reason: "invalid" });
    expect(await authenticate({ email: EMAIL, password: PASSWORD }, IP, ctx.deps)).toEqual({ ok: false, reason: "deactivated" });
    expect(ctx.deps.onSuccess).not.toHaveBeenCalled();
  });

  it("rejects malformed input without touching the database", async () => {
    for (const input of [null, {}, { email: "not-an-email", password: "x" }, { email: EMAIL, password: "" }]) {
      expect(await authenticate(input, IP, ctx.deps)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(ctx.deps.findUserByEmail).not.toHaveBeenCalled();
  });

  it("rejects passwords longer than bcrypt can check", async () => {
    const result = await authenticate({ email: EMAIL, password: "x".repeat(73) }, IP, ctx.deps);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("locks an email after too many attempts, even with the right password", async () => {
    for (let i = 0; i < RATE_LIMITS.loginByEmail.max; i++) {
      await authenticate({ email: EMAIL, password: "wrong" }, `198.51.100.${i}`, ctx.deps);
    }
    const result = await authenticate({ email: EMAIL, password: PASSWORD }, IP, ctx.deps);
    expect(result).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(ctx.deps.verifyPassword).toHaveBeenCalledTimes(RATE_LIMITS.loginByEmail.max);
  });

  it("unlocks after the window passes", async () => {
    for (let i = 0; i <= RATE_LIMITS.loginByEmail.max; i++) {
      await authenticate({ email: EMAIL, password: "wrong" }, IP, ctx.deps);
    }
    ctx.advance(RATE_LIMITS.loginByEmail.windowSeconds * 1000 + 1);
    expect((await authenticate({ email: EMAIL, password: PASSWORD }, IP, ctx.deps)).ok).toBe(true);
  });

  it("resets the email counter after a successful sign-in", async () => {
    for (let i = 0; i < RATE_LIMITS.loginByEmail.max - 1; i++) {
      await authenticate({ email: EMAIL, password: "wrong" }, IP, ctx.deps);
    }
    expect((await authenticate({ email: EMAIL, password: PASSWORD }, IP, ctx.deps)).ok).toBe(true);
    // A fresh allowance of failures before lockout.
    for (let i = 0; i < RATE_LIMITS.loginByEmail.max - 1; i++) {
      await authenticate({ email: EMAIL, password: "wrong" }, IP, ctx.deps);
    }
    expect((await authenticate({ email: EMAIL, password: PASSWORD }, IP, ctx.deps)).ok).toBe(true);
  });

  it("limits one IP spraying many accounts", async () => {
    for (let i = 0; i < RATE_LIMITS.loginByIp.max; i++) {
      await authenticate({ email: `user${i}@example.com`, password: "guess" }, IP, ctx.deps);
    }
    const result = await authenticate({ email: EMAIL, password: PASSWORD }, IP, ctx.deps);
    expect(result).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(result.ok === false && result.reason === "rate_limited" && result.retryAfterSeconds).toBeGreaterThan(0);
  });
});
