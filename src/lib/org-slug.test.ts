import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { orgParamSchema, organizationSlugSchema, signupSchema } from "@/server/validation/organizations";
import { HOME_PATH, orgPath } from "./org-path";
import { RESERVED_SLUGS, SLUG_MAX_LENGTH, slugify, slugProblem, slugWithSuffix } from "./org-slug";

describe("slugify", () => {
  it("turns names into lower-case, hyphenated addresses", () => {
    expect(slugify("Acme Media")).toBe("acme-media");
    expect(slugify("  Ação & Co. — Studio!  ")).toBe("acao-co-studio");
    expect(slugify("Ünïcôdé Ltd")).toBe("unicode-ltd");
    expect(slugify("!!!")).toBe("");
  });

  it("stays within the length limit without a trailing hyphen", () => {
    const slug = slugify("a".repeat(39) + " b c");
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("slugProblem", () => {
  it("accepts ordinary addresses", () => {
    for (const ok of ["acme", "acme-media", "studio-42", "a1b"]) expect(slugProblem(ok)).toBeNull();
  });

  it("rejects bad formats", () => {
    for (const bad of ["ab", "-acme", "acme-", "ac--me", "Acme", "acme media", "acme_media", "a".repeat(41), "acmé"]) {
      expect(slugProblem(bad), bad).not.toBeNull();
    }
  });

  it("reserves every top-level page of the app", () => {
    for (const page of ["login", "signup", "account", "organizations", "platform", "api", "set-password", "forgot-password"]) {
      expect(RESERVED_SLUGS.has(page)).toBe(true);
      expect(slugProblem(page)).toMatch(/reserved/);
    }
  });

  it("reserves every top-level route that exists, so an organization can't hide one", () => {
    // Top-level segments: folders in src/app and in its route groups, plus
    // metadata files like icon.tsx, which are served at /icon.
    const app = join(process.cwd(), "src", "app");
    const groups = readdirSync(app, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith("("));
    const routes = new Set<string>();
    for (const dir of [app, ...groups.map((g) => join(app, g.name))]) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !/^[([_@]/.test(entry.name)) routes.add(entry.name);
        const metadata = entry.isFile() && /^(icon|apple-icon|opengraph-image|twitter-image|sitemap|robots|manifest)\./.exec(entry.name);
        if (metadata) routes.add(metadata[1]);
      }
    }
    expect(routes.has("pricing")).toBe(true); // the scan found the public site
    for (const route of routes) expect(RESERVED_SLUGS.has(route), route).toBe(true);
  });
});

describe("slugWithSuffix", () => {
  it("adds a number and keeps the result valid", () => {
    expect(slugWithSuffix("acme", 2)).toBe("acme-2");
    const long = slugWithSuffix("a".repeat(SLUG_MAX_LENGTH), 12);
    expect(long.length).toBe(SLUG_MAX_LENGTH);
    expect(slugProblem(long)).toBeNull();
    // Never leaves a double hyphen when the cut lands on one.
    expect(slugWithSuffix(`${"a".repeat(37)}-bb`, 2)).toBe(`${"a".repeat(37)}-2`);
  });
});

describe("organization validation", () => {
  it("normalises and checks the address someone picks", () => {
    expect(organizationSlugSchema.parse("  Acme-Media ")).toBe("acme-media");
    expect(organizationSlugSchema.safeParse("login").success).toBe(false);
  });

  it("only looks up well-formed slugs from URLs and forms", () => {
    expect(orgParamSchema.safeParse("acme").success).toBe(true);
    for (const bad of ["../acme", "acme/board", "ACME", "", "a".repeat(41)]) expect(orgParamSchema.safeParse(bad).success).toBe(false);
  });

  it("validates sign-up input", () => {
    const ok = signupSchema.safeParse({ name: "Nia", email: " Nia@Example.com ", organizationName: "Nia Studio", organizationSlug: "nia-studio" });
    expect(ok.success && ok.data.email).toBe("nia@example.com");
    expect(signupSchema.safeParse({ name: "Nia", email: "nia@example.com", organizationName: "N", organizationSlug: "nia" }).success).toBe(false);
  });
});

describe("orgPath", () => {
  it("builds paths inside an organization", () => {
    expect(orgPath("acme")).toBe("/acme");
    expect(orgPath("acme", "/")).toBe("/acme");
    expect(orgPath("acme", "/items/12")).toBe("/acme/items/12");
  });

  it("lands signed-in people on a page no organization can take", () => {
    expect(slugProblem(HOME_PATH.slice(1))).toMatch(/reserved/);
  });
});
