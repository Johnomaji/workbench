import { describe, expect, it } from "vitest";
import { getDummyHash, hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("a perfectly fine password");
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash).not.toContain("perfectly");
    expect(await verifyPassword("a perfectly fine password", hash)).toBe(true);
    expect(await verifyPassword("a perfectly fine passworD", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same password here"), hashPassword("same password here")]);
    expect(a).not.toEqual(b);
  });

  it("refuses to hash passwords over bcrypt's 72-byte limit", async () => {
    await expect(hashPassword("x".repeat(73))).rejects.toThrow(/72-byte/);
    // Multi-byte characters count as bytes, not characters.
    await expect(hashPassword("é".repeat(37))).rejects.toThrow(/72-byte/);
  });

  it("never verifies an over-long password (no silent truncation)", async () => {
    const hash = await hashPassword("x".repeat(72));
    expect(await verifyPassword("x".repeat(72), hash)).toBe(true);
    expect(await verifyPassword(`${"x".repeat(72)}extra`, hash)).toBe(false);
  });

  it("returns false for a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("anything", "not-a-bcrypt-hash")).toBe(false);
  });

  it("provides a stable dummy hash that matches nothing", async () => {
    const dummy = await getDummyHash();
    expect(await getDummyHash()).toBe(dummy);
    expect(await verifyPassword("", dummy)).toBe(false);
  });
});
