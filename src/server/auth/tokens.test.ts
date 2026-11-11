import { describe, expect, it } from "vitest";
import { generateToken, hashToken, tokenState } from "./tokens";

describe("one-time tokens", () => {
  it("generates long, URL-safe, unique tokens", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateToken().token));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it("stores only a hash, which is deterministic", () => {
    const { token, tokenHash } = generateToken();
    expect(tokenHash).not.toContain(token);
    expect(hashToken(token)).toBe(tokenHash);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reports expired and used tokens", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const future = new Date("2026-11-07T13:00:00Z");
    const past = new Date("2026-11-07T11:00:00Z");
    expect(tokenState({ expiresAt: future, usedAt: null }, now)).toBe("valid");
    expect(tokenState({ expiresAt: past, usedAt: null }, now)).toBe("expired");
    expect(tokenState({ expiresAt: now, usedAt: null }, now)).toBe("expired");
    expect(tokenState({ expiresAt: future, usedAt: past }, now)).toBe("used");
  });
});
