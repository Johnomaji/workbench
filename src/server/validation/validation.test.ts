import { describe, expect, it } from "vitest";
import { changePasswordSchema, setPasswordSchema } from "./auth";
import { emailSchema, fieldErrors, newPasswordSchema } from "./common";
import { createUserSchema, formToObject, updateUserSchema } from "./users";

describe("emailSchema", () => {
  it("trims and lower-cases", () => {
    expect(emailSchema.parse("  Casey.Novak@Example.COM ")).toBe("casey.novak@example.com");
  });

  it("rejects things that aren't emails", () => {
    for (const bad of ["", "   ", "casey", "casey@", "@example.com", "a b@example.com"]) {
      expect(emailSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("newPasswordSchema", () => {
  it("requires at least 10 characters", () => {
    expect(newPasswordSchema.safeParse("short").success).toBe(false);
    expect(newPasswordSchema.safeParse("long enough").success).toBe(true);
  });

  it("enforces bcrypt's 72-byte limit in bytes", () => {
    expect(newPasswordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(newPasswordSchema.safeParse("a".repeat(73)).success).toBe(false);
    expect(newPasswordSchema.safeParse("€".repeat(25)).success).toBe(false); // 75 bytes
  });

  it("rejects passwords that are only spaces", () => {
    expect(newPasswordSchema.safeParse(" ".repeat(12)).success).toBe(false);
  });
});

describe("set / change password", () => {
  it("needs matching confirmation", () => {
    const result = setPasswordSchema.safeParse({
      token: "t".repeat(43),
      password: "a fine password",
      confirmPassword: "a different one",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)).toHaveProperty("confirmPassword");
  });

  it("refuses reusing the current password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "same password!",
      password: "same password!",
      confirmPassword: "same password!",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)).toHaveProperty("password");
  });
});

describe("createUserSchema", () => {
  const base = { name: "Casey Novak", email: "casey@example.com", roleIds: ["role1"], setup: "invite" };

  it("accepts an invite with a role", () => {
    const result = createUserSchema.parse({ ...base, isAdmin: null });
    expect(result).toMatchObject({ isAdmin: false, roleIds: ["role1"], setup: "invite" });
  });

  it("requires a role unless the person is an admin", () => {
    expect(createUserSchema.safeParse({ ...base, roleIds: [] }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, roleIds: [], isAdmin: "on" }).success).toBe(true);
  });

  it("requires a valid temporary password when that option is chosen", () => {
    const missing = createUserSchema.safeParse({ ...base, setup: "temporary" });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(fieldErrors(missing.error)).toHaveProperty("temporaryPassword");
    expect(createUserSchema.safeParse({ ...base, setup: "temporary", temporaryPassword: "temp-pass-123" }).success).toBe(true);
  });

  it("de-duplicates roles and rejects junk ids", () => {
    expect(createUserSchema.parse({ ...base, roleIds: ["r1", "r1", "r2"] }).roleIds).toEqual(["r1", "r2"]);
    expect(createUserSchema.safeParse({ ...base, roleIds: ["'; DROP TABLE"] }).success).toBe(false);
  });

  it("rejects an unknown setup option", () => {
    expect(createUserSchema.safeParse({ ...base, setup: "magic" }).success).toBe(false);
  });
});

describe("updateUserSchema", () => {
  it("requires a user id", () => {
    expect(updateUserSchema.safeParse({ name: "A", email: "a@example.com", roleIds: ["r"] }).success).toBe(false);
  });
});

describe("formToObject", () => {
  it("collects repeated fields into arrays and drops React's action fields", () => {
    const form = new FormData();
    form.append("name", "Casey");
    form.append("roleIds", "r1");
    form.append("roleIds", "r2");
    form.append("$ACTION_ID_abc", "");
    expect(formToObject(form, ["roleIds", "missing"])).toEqual({ name: "Casey", roleIds: ["r1", "r2"], missing: [] });
  });
});
