import { describe, expect, it } from "vitest";
import { getClientIp, safeRedirectPath } from "./request";

describe("getClientIp", () => {
  it("uses the first x-forwarded-for address", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});

describe("safeRedirectPath", () => {
  it("keeps same-site paths", () => {
    expect(safeRedirectPath("/admin/users?q=ri")).toBe("/admin/users?q=ri");
  });

  it("rejects anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, 42]) {
      expect(safeRedirectPath(bad)).toBe("/");
    }
  });
});
