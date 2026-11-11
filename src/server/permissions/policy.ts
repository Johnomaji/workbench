/**
 * Pure permission rules. No database or framework imports, so every rule is
 * unit-tested. Server actions and services call these; the UI only uses them
 * to decide which buttons to show.
 *
 * An Actor is always someone acting inside one organization: their roles and
 * admin rights there, and nothing from any other organization they belong to.
 */

export type ActorMembership = {
  roleId: string;
  roleKey: string;
  roleName: string;
  departmentId: string;
  departmentName: string;
  canCreateItems: boolean;
  canManageItems: boolean;
};

export type Actor = {
  id: string;
  /** Administrator of this organization. */
  isAdmin: boolean;
  isActive: boolean;
  organizationId: string;
  /** Every active department of the organization. Admin rights reach these and nothing else. */
  orgDepartmentIds: string[];
  /** Roles in this organization only. */
  memberships: ActorMembership[];
};

export type PolicyResult = { ok: true } | { ok: false; reason: string };

const allow: PolicyResult = { ok: true };
const deny = (reason: string): PolicyResult => ({ ok: false, reason });

export function canManageUsers(actor: Actor): boolean {
  return actor.isActive && actor.isAdmin;
}

/** An admin's reach: departments of their own organization. */
function adminOf(actor: Actor, departmentId: string): boolean {
  return actor.isAdmin && actor.orgDepartmentIds.includes(departmentId);
}

/** Admin, or PM-level role in that department. */
export function canManageDepartmentItems(actor: Actor, departmentId: string): boolean {
  if (!actor.isActive) return false;
  if (adminOf(actor, departmentId)) return true;
  return actor.memberships.some((m) => m.departmentId === departmentId && m.canManageItems);
}

export function isDepartmentMember(actor: Actor, departmentId: string): boolean {
  if (!actor.isActive) return false;
  return adminOf(actor, departmentId) || actor.memberships.some((m) => m.departmentId === departmentId);
}

/** Admin, or a role in that department that can create items (PM, script writer). */
export function canCreateItem(actor: Actor, departmentId: string): boolean {
  if (!actor.isActive) return false;
  if (adminOf(actor, departmentId)) return true;
  return actor.memberships.some((m) => m.departmentId === departmentId && m.canCreateItems);
}

export type ItemVisibility = {
  organizationId: string;
  departmentId: string;
  createdById: string;
  firstSubmittedAt: Date | null;
  /** People assigned to the first stage's tasks (the writer). */
  firstStageAssigneeIds: string[];
  /** Roles of first-stage tasks nobody has picked up yet. */
  firstStageOpenRoleIds: string[];
  draftsVisibleToAll: boolean;
};

/**
 * Everyone in the department can see an item, except a draft that hasn't been
 * submitted yet: only its creator, its writer and managers see that (unless
 * the department turns on draftsVisibleToAll). If nobody has the writing task
 * yet, people with that role can see it so they can pick it up.
 */
export function canViewItem(actor: Actor, item: ItemVisibility): boolean {
  if (item.organizationId !== actor.organizationId) return false;
  if (!isDepartmentMember(actor, item.departmentId)) return false;
  if (item.firstSubmittedAt || item.draftsVisibleToAll) return true;
  if (canManageDepartmentItems(actor, item.departmentId)) return true;
  if (item.createdById === actor.id || item.firstStageAssigneeIds.includes(actor.id)) return true;
  return actor.memberships.some((m) => item.firstStageOpenRoleIds.includes(m.roleId));
}

/** Title, brief and deadline: managers, or the creator while it's still a draft. */
export function canEditItemDetails(
  actor: Actor,
  item: { departmentId: string; createdById: string; firstSubmittedAt: Date | null },
): boolean {
  if (canManageDepartmentItems(actor, item.departmentId)) return true;
  return isDepartmentMember(actor, item.departmentId) && item.createdById === actor.id && !item.firstSubmittedAt;
}

/** Someone's membership of the actor's organization. */
export type UserTarget = {
  id: string;
  /** Administrator of this organization. */
  isAdmin: boolean;
  /** Active in this organization. */
  isActive: boolean;
  /**
   * The account belongs to this organization alone (and isn't a platform
   * admin). Only then may this organization's admins change the account
   * itself: its name, email, password and sessions. Otherwise an admin of one
   * customer could take over an account another customer relies on.
   */
  managedHere: boolean;
};

export type UserChange =
  | { kind: "edit"; makeAdmin: boolean; changesProfile: boolean }
  | { kind: "deactivate" }
  | { kind: "reactivate" }
  | { kind: "sendLink" }
  | { kind: "setTemporaryPassword" }
  | { kind: "signOutEverywhere" };

const SHARED_ACCOUNT = "This person also uses their account in other organizations, so only they can";

/**
 * Rules for changing someone in an organization.
 * @param activeAdminCount active administrators of the organization right now, including the target.
 */
export function checkUserChange(
  actor: Actor,
  target: UserTarget,
  change: UserChange,
  activeAdminCount: number,
): PolicyResult {
  if (!canManageUsers(actor)) return deny("Only administrators can manage people.");

  const isSelf = actor.id === target.id;
  const targetIsLastAdmin = target.isAdmin && target.isActive && activeAdminCount <= 1;

  switch (change.kind) {
    case "edit":
      if (change.changesProfile && !target.managedHere) {
        return deny(`${SHARED_ACCOUNT} change their name and email.`);
      }
      if (target.isAdmin && !change.makeAdmin) {
        if (isSelf) return deny("You can't remove your own administrator access. Ask another administrator.");
        if (targetIsLastAdmin) return deny("There must always be at least one active administrator.");
      }
      return allow;
    case "deactivate":
      if (!target.isActive) return deny("This account is already deactivated.");
      if (isSelf) return deny("You can't deactivate your own account.");
      if (targetIsLastAdmin) return deny("There must always be at least one active administrator.");
      return allow;
    case "reactivate":
      if (target.isActive) return deny("This account is already active.");
      return allow;
    case "sendLink":
      // The link goes to the account's own email address, so this is safe for any account.
      if (!target.isActive) return deny("Reactivate this account first.");
      return allow;
    case "setTemporaryPassword":
      if (!target.isActive) return deny("Reactivate this account first.");
      if (!target.managedHere) return deny(`${SHARED_ACCOUNT} change their password. Email them a reset link instead.`);
      return allow;
    case "signOutEverywhere":
      if (!target.isActive) return deny("Reactivate this account first.");
      if (!target.managedHere && !isSelf) return deny(`${SHARED_ACCOUNT} sign themselves out everywhere.`);
      return allow;
  }
}
