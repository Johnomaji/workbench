import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { MARKETING_PATHS } from "@/lib/site";
import { proxy } from "./proxy";

function visit(path: string, { signedIn = false } = {}) {
  const headers = signedIn ? { cookie: "authjs.session-token=anything" } : undefined;
  const response = proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
  const location = response.headers.get("location");
  return location ? new URL(location).pathname + new URL(location).search : null;
}

describe("proxy", () => {
  it("lets anyone see the public site", () => {
    for (const path of MARKETING_PATHS) expect(visit(path), path).toBeNull();
    for (const path of ["/robots.txt", "/sitemap.xml", "/opengraph-image", "/icon", "/apple-icon"]) {
      expect(visit(path), path).toBeNull();
    }
  });

  it("lets anyone sign in, sign up and reset a password", () => {
    for (const path of ["/login", "/signup", "/signup/abc", "/forgot-password", "/set-password/abc"]) {
      expect(visit(path), path).toBeNull();
    }
  });

  it("sends signed-out visitors of the app to sign in, and back afterwards", () => {
    expect(visit("/acme/board?person=me")).toBe(`/login?callbackUrl=${encodeURIComponent("/acme/board?person=me")}`);
    expect(visit("/organizations")).toBe(`/login?callbackUrl=${encodeURIComponent("/organizations")}`);
    // Prefixes only match whole segments.
    expect(visit("/pricing-team")).toMatch(/^\/login/);
    expect(visit("/signupx")).toMatch(/^\/login/);
  });

  it("takes signed-in people from the home page to their organizations", () => {
    expect(visit("/", { signedIn: true })).toBe("/organizations");
    expect(visit("/pricing", { signedIn: true })).toBeNull();
    expect(visit("/acme/board", { signedIn: true })).toBeNull();
  });
});
