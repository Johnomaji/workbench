import { describe, expect, it } from "vitest";
import {
  canCreateItem,
  canEditItemDetails,
  canViewItem,
  canManageDepartmentItems,
  canManageUsers,
  checkUserChange,
  isDepartmentMember,
  type Actor,
  type ActorMembership,
} from "./policy";

const ORG = "org_acme";
const MEDIA = "dept_media";
const OTHER = "dept_other";
/** A department of another organization. */
const FOREIGN = "dept_globex_media";

function membership(overrides: Partial<ActorMembership> = {}): ActorMembership {
  return {
    roleId: "role_writer",
    roleKey: "SCRIPT_WRITER",
    roleName: "Script writer",
    departmentId: MEDIA,
    departmentName: "Media",
    canCreateItems: true,
    canManageItems: false,
    ...overrides,
  };
}

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: "u_actor",
    isAdmin: false,
    isActive: true,
    organizationId: ORG,
    orgDepartmentIds: [MEDIA, OTHER],
    memberships: [],
    ...overrides,
  };
}

const admin = actor({ id: "u_admin", isAdmin: true });
const pm = actor({ id: "u_pm", memberships: [membership({ roleKey: "PROJECT_MANAGER", canManageItems: true })] });
const writer = actor({ id: "u_writer", memberships: [membership()] });

describe("canManageUsers", () => {
  it("allows active admins only", () => {
    expect(canManageUsers(admin)).toBe(true);
    expect(canManageUsers(pm)).toBe(false);
    expect(canManageUsers(writer)).toBe(false);
  });

  it("denies a deactivated admin", () => {
    expect(canManageUsers({ ...admin, isActive: false })).toBe(false);
  });
});

describe("department access", () => {
  it("lets PMs manage items in their own department only", () => {
    expect(canManageDepartmentItems(pm, MEDIA)).toBe(true);
    expect(canManageDepartmentItems(pm, OTHER)).toBe(false);
  });

  it("does not give manager rights to ordinary roles", () => {
    expect(canManageDepartmentItems(writer, MEDIA)).toBe(false);
  });

  it("gives admins access to every department of their own organization", () => {
    expect(canManageDepartmentItems(admin, OTHER)).toBe(true);
    expect(isDepartmentMember(admin, OTHER)).toBe(true);
  });

  it("gives admins nothing in another organization", () => {
    expect(canManageDepartmentItems(admin, FOREIGN)).toBe(false);
    expect(isDepartmentMember(admin, FOREIGN)).toBe(false);
    expect(canCreateItem(admin, FOREIGN)).toBe(false);
  });

  it("treats membership by department", () => {
    expect(isDepartmentMember(writer, MEDIA)).toBe(true);
    expect(isDepartmentMember(writer, OTHER)).toBe(false);
    expect(isDepartmentMember({ ...writer, isActive: false }, MEDIA)).toBe(false);
  });
});

describe("canCreateItem / canViewItem", () => {
  const editor = actor({ id: "u_editor", memberships: [membership({ roleId: "role_editor", roleKey: "CONTENT_EDITOR", canCreateItems: false })] });
  const draft = {
    organizationId: ORG,
    departmentId: MEDIA,
    createdById: writer.id,
    firstSubmittedAt: null,
    firstStageAssigneeIds: [writer.id],
    firstStageOpenRoleIds: [],
    draftsVisibleToAll: false,
  };

  it("lets writers, PMs and admins create items, not editors", () => {
    expect(canCreateItem(writer, MEDIA)).toBe(true);
    expect(canCreateItem(pm, MEDIA)).toBe(true);
    expect(canCreateItem(admin, MEDIA)).toBe(true);
    expect(canCreateItem(editor, MEDIA)).toBe(false);
    expect(canCreateItem(writer, OTHER)).toBe(false);
  });

  it("keeps an unsubmitted draft private to its writer and managers", () => {
    expect(canViewItem(writer, draft)).toBe(true);
    expect(canViewItem(pm, draft)).toBe(true);
    expect(canViewItem(admin, draft)).toBe(true);
    expect(canViewItem(editor, draft)).toBe(false);
  });

  it("shows it to everyone in the department once submitted, or when the setting is on", () => {
    expect(canViewItem(editor, { ...draft, firstSubmittedAt: new Date() })).toBe(true);
    expect(canViewItem(editor, { ...draft, draftsVisibleToAll: true })).toBe(true);
  });

  it("lets the right role see an unassigned draft so they can pick it up", () => {
    const pool = { ...draft, createdById: pm.id, firstStageAssigneeIds: [], firstStageOpenRoleIds: ["role_writer"] };
    expect(canViewItem(actor({ id: "u_w2", memberships: [membership()] }), pool)).toBe(true);
    expect(canViewItem(editor, pool)).toBe(false);
  });

  it("never shows another department's items", () => {
    const outsider = actor({ id: "u_out", memberships: [membership({ departmentId: OTHER })] });
    expect(canViewItem(outsider, { ...draft, firstSubmittedAt: new Date() })).toBe(false);
  });

  it("never shows an item from another organization, even to an admin or a matching role", () => {
    const foreign = { ...draft, organizationId: "org_globex", firstSubmittedAt: new Date() };
    expect(canViewItem(admin, foreign)).toBe(false);
    expect(canViewItem(pm, foreign)).toBe(false);
    expect(canViewItem(writer, foreign)).toBe(false);
    // Even a department id that happens to match can't cross organizations.
    expect(canViewItem(admin, { ...foreign, departmentId: FOREIGN })).toBe(false);
  });

  it("lets the creator edit details only until the first submission", () => {
    expect(canEditItemDetails(writer, draft)).toBe(true);
    expect(canEditItemDetails(writer, { ...draft, firstSubmittedAt: new Date() })).toBe(false);
    expect(canEditItemDetails(pm, { ...draft, firstSubmittedAt: new Date() })).toBe(true);
    expect(canEditItemDetails(editor, draft)).toBe(false);
  });
});

describe("checkUserChange", () => {
  const otherAdmin = { id: "u_admin2", isAdmin: true, isActive: true, managedHere: true };
  const regular = { id: "u_regular", isAdmin: false, isActive: true, managedHere: true };
  const shared = { ...regular, id: "u_shared", managedHere: false };
  const self = { id: admin.id, isAdmin: true, isActive: true, managedHere: true };
  const edit = (makeAdmin: boolean, changesProfile = false) => ({ kind: "edit" as const, makeAdmin, changesProfile });

  it("only lets administrators change accounts", () => {
    for (const nonAdmin of [pm, writer]) {
      const result = checkUserChange(nonAdmin, regular, { kind: "deactivate" }, 2);
      expect(result.ok).toBe(false);
    }
  });

  it("allows deactivating and reactivating other people", () => {
    expect(checkUserChange(admin, regular, { kind: "deactivate" }, 2)).toEqual({ ok: true });
    expect(checkUserChange(admin, { ...regular, isActive: false }, { kind: "reactivate" }, 2)).toEqual({ ok: true });
  });

  it("blocks deactivating yourself", () => {
    const result = checkUserChange(admin, self, { kind: "deactivate" }, 5);
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("your own account") });
  });

  it("blocks removing your own admin access", () => {
    const result = checkUserChange(admin, self, edit(false), 5);
    expect(result.ok).toBe(false);
  });

  it("allows editing yourself while staying an admin", () => {
    expect(checkUserChange(admin, self, edit(true), 1)).toEqual({ ok: true });
  });

  it("never leaves an organization without an active administrator", () => {
    expect(checkUserChange(admin, otherAdmin, edit(false), 1).ok).toBe(false);
    expect(checkUserChange(admin, otherAdmin, { kind: "deactivate" }, 1).ok).toBe(false);
    // With another admin left it's fine.
    expect(checkUserChange(admin, otherAdmin, edit(false), 2).ok).toBe(true);
    expect(checkUserChange(admin, otherAdmin, { kind: "deactivate" }, 2).ok).toBe(true);
  });

  it("rejects no-op status changes with a clear reason", () => {
    expect(checkUserChange(admin, { ...regular, isActive: false }, { kind: "deactivate" }, 2).ok).toBe(false);
    expect(checkUserChange(admin, regular, { kind: "reactivate" }, 2).ok).toBe(false);
  });

  it("doesn't change how a deactivated member signs in", () => {
    for (const kind of ["sendLink", "setTemporaryPassword", "signOutEverywhere"] as const) {
      expect(checkUserChange(admin, { ...regular, isActive: false }, { kind }, 2).ok).toBe(false);
      expect(checkUserChange(admin, regular, { kind }, 2).ok).toBe(true);
    }
  });

  it("protects accounts that are also used in other organizations", () => {
    // Roles and admin rights here are this organization's business...
    expect(checkUserChange(admin, shared, edit(true), 2).ok).toBe(true);
    expect(checkUserChange(admin, shared, { kind: "deactivate" }, 2).ok).toBe(true);
    // ...a reset link goes to the person's own inbox, so it's safe too...
    expect(checkUserChange(admin, shared, { kind: "sendLink" }, 2).ok).toBe(true);
    // ...but the account itself is theirs.
    expect(checkUserChange(admin, shared, edit(false, true), 2)).toMatchObject({ ok: false, reason: expect.stringContaining("name and email") });
    expect(checkUserChange(admin, shared, { kind: "setTemporaryPassword" }, 2)).toMatchObject({ ok: false, reason: expect.stringContaining("reset link") });
    expect(checkUserChange(admin, shared, { kind: "signOutEverywhere" }, 2).ok).toBe(false);
    // Accounts that only live here can be fully managed.
    expect(checkUserChange(admin, regular, edit(false, true), 2).ok).toBe(true);
  });

  it("lets admins sign themselves out everywhere even when their account is shared", () => {
    expect(checkUserChange(admin, { ...self, managedHere: false }, { kind: "signOutEverywhere" }, 2).ok).toBe(true);
  });
});
