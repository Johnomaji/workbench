import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { issueSetupToken, setupEmail, trySendEmail } from "@/server/auth/account";
import { hashPassword } from "@/server/auth/password";
import { INVITE_TTL_HOURS } from "@/server/auth/tokens";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db";
import { addedToOrganizationEmail } from "@/server/email-templates";
import { appUrl } from "@/server/env";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { canManageUsers, checkUserChange, type Actor, type UserChange, type UserTarget } from "@/server/permissions/policy";
import { fieldErrors } from "@/server/validation/common";
import {
  createUserSchema,
  temporaryPasswordSchema,
  updateUserSchema,
  userIdSchema,
} from "@/server/validation/users";

/**
 * People in one organization, managed by its administrators. Everything here
 * works on memberships of the admin's own organization: someone from another
 * organization is "not found", and an account that's also used elsewhere can
 * only have its roles and access here changed (see UserTarget.managedHere).
 */

/** An administrator acting in their organization. */
export type OrgAdmin = Actor & { name: string; organization: { id: string; slug: string; name: string } };

/** Admin-sent links last longer than self-service resets: people may not read email right away. */
const ADMIN_LINK_TTL_MINUTES = INVITE_TTL_HOURS * 60;

/** active: in. pending: invited, hasn't opened the organization yet. deactivated: removed from it. */
export type UserStatus = "active" | "pending" | "deactivated";

function statusOf(m: { isActive: boolean; joinedAt: Date | null }): UserStatus {
  if (!m.isActive) return "deactivated";
  return m.joinedAt ? "active" : "pending";
}

function assertAdmin(actor: Actor) {
  if (!canManageUsers(actor)) throw new ForbiddenError("Only administrators can manage people.");
}

function assertAllowed(result: ReturnType<typeof checkUserChange>) {
  if (!result.ok) throw new ForbiddenError(result.reason);
}

/**
 * Locks the organization's active-admin rows for the rest of the transaction
 * and returns how many there are, so two admins can't demote each other at the
 * same moment and leave the organization without one.
 */
async function lockActiveAdmins(tx: Prisma.TransactionClient, organizationId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "OrganizationMember"
    WHERE "organizationId" = ${organizationId} AND "isAdmin" = true AND "isActive" = true
    FOR UPDATE
  `;
  return rows.length;
}

async function assertRolesExist(organizationId: string, roleIds: string[]) {
  if (roleIds.length === 0) return;
  const count = await db.role.count({
    where: { id: { in: roleIds }, organizationId, department: { isActive: true } },
  });
  if (count !== roleIds.length) {
    throw new ValidationError({ roleIds: ["One of those roles no longer exists. Reload the page and try again."] });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const emailTaken = () =>
  new ValidationError({ email: ["Someone already has an account with this email address."] });
const alreadyMember = () =>
  new ValidationError({ email: ["This person is already in your organization."] });

/** Loads someone's membership of this organization, with what the rules need. */
async function loadMember(client: Prisma.TransactionClient | typeof db, organizationId: string, userId: string) {
  return client.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: {
      id: true,
      isAdmin: true,
      isActive: true,
      joinedAt: true,
      deactivatedAt: true,
      createdAt: true,
      roles: { select: { roleId: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          passwordHash: true,
          isPlatformAdmin: true,
          mustChangePassword: true,
          lastLoginAt: true,
          _count: { select: { orgMemberships: { where: { organizationId: { not: organizationId } } } } },
        },
      },
    },
  });
}

type LoadedMember = NonNullable<Awaited<ReturnType<typeof loadMember>>>;

function targetOf(member: LoadedMember): UserTarget {
  return {
    id: member.user.id,
    isAdmin: member.isAdmin,
    isActive: member.isActive,
    managedHere: member.user._count.orgMemberships === 0 && !member.user.isPlatformAdmin,
  };
}

async function requireMember(client: Prisma.TransactionClient | typeof db, organizationId: string, userId: string) {
  const member = await loadMember(client, organizationId, userId);
  if (!member) throw new NotFoundError("That person isn't in this organization.");
  return member;
}

function organizationLink(slug: string): string {
  return `${appUrl()}/${slug}`;
}

// ── Reads ────────────────────────────────────────────────────────────────

export type UserListItem = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  status: UserStatus;
  roles: string[];
  lastLoginAt: Date | null;
};

export async function listUsers(
  actor: OrgAdmin,
  filter: { q?: string; status?: "all" | UserStatus },
): Promise<UserListItem[]> {
  assertAdmin(actor);
  const where: Prisma.OrganizationMemberWhereInput = { organizationId: actor.organizationId };
  if (filter.q) {
    where.user = {
      OR: [
        { name: { contains: filter.q, mode: "insensitive" } },
        { email: { contains: filter.q, mode: "insensitive" } },
      ],
    };
  }
  if (filter.status === "active") Object.assign(where, { isActive: true, joinedAt: { not: null } });
  if (filter.status === "pending") Object.assign(where, { isActive: true, joinedAt: null });
  if (filter.status === "deactivated") where.isActive = false;

  const members = await db.organizationMember.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { user: { name: "asc" } }],
    take: 500,
    select: {
      isAdmin: true,
      isActive: true,
      joinedAt: true,
      user: { select: { id: true, name: true, email: true, lastLoginAt: true } },
      roles: { select: { role: { select: { name: true } } }, orderBy: { role: { name: "asc" } } },
    },
  });

  return members.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    isAdmin: m.isAdmin,
    status: statusOf(m),
    roles: m.roles.map((r) => r.role.name),
    lastLoginAt: m.user.lastLoginAt,
  }));
}

export type DepartmentRoles = {
  id: string;
  name: string;
  roles: { id: string; name: string; canManageItems: boolean }[];
};

export async function listDepartmentRoles(actor: OrgAdmin): Promise<DepartmentRoles[]> {
  assertAdmin(actor);
  return db.department.findMany({
    where: { organizationId: actor.organizationId, isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      roles: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, canManageItems: true },
      },
    },
  });
}

export type UserDetail = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isActive: boolean;
  status: UserStatus;
  hasPassword: boolean;
  /** The account is only used in this organization, so its admins can manage it fully. */
  managedHere: boolean;
  mustChangePassword: boolean;
  roleIds: string[];
  lastLoginAt: Date | null;
  addedAt: Date;
  deactivatedAt: Date | null;
  openTaskCount: number;
  pendingLinkExpiresAt: Date | null;
};

export async function getUserDetail(actor: OrgAdmin, userId: string): Promise<UserDetail | null> {
  assertAdmin(actor);
  const parsed = userIdSchema.safeParse({ userId });
  if (!parsed.success) return null;

  const member = await loadMember(db, actor.organizationId, parsed.data.userId);
  if (!member) return null;
  const { user } = member;
  const target = targetOf(member);

  const [openTaskCount, pendingLink] = await Promise.all([
    db.task.count({ where: { assigneeId: user.id, status: { not: "DONE" }, item: { organizationId: actor.organizationId } } }),
    user.passwordHash
      ? null
      : db.authToken.findFirst({
          where: { userId: user.id, type: "INVITE", usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          select: { expiresAt: true },
        }),
  ]);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: member.isAdmin,
    isActive: member.isActive,
    status: statusOf(member),
    hasPassword: Boolean(user.passwordHash),
    managedHere: target.managedHere,
    mustChangePassword: user.mustChangePassword,
    roleIds: member.roles.map((r) => r.roleId),
    lastLoginAt: user.lastLoginAt,
    addedAt: member.createdAt,
    deactivatedAt: member.deactivatedAt,
    openTaskCount,
    pendingLinkExpiresAt: pendingLink?.expiresAt ?? null,
  };
}

// ── Writes ───────────────────────────────────────────────────────────────

/**
 * Adds someone to the organization. A new address gets an account (with an
 * invite email or a temporary password). An address that already has an
 * account, from another organization, is added as it is: its owner keeps
 * their own password and is told by email.
 */
export async function createUser(
  actor: OrgAdmin,
  input: unknown,
  ip: string,
): Promise<{ userId: string; emailSent: boolean | null }> {
  assertAdmin(actor);
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const data = parsed.data;
  const organizationId = actor.organizationId;

  await assertRolesExist(organizationId, data.roleIds);
  const existing = await db.user.findUnique({
    where: { email: data.email },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      orgMemberships: { where: { organizationId }, select: { id: true } },
    },
  });
  if (existing?.orgMemberships.length) throw alreadyMember();
  if (existing && data.setup === "temporary") {
    throw new AppError(
      "This person already has a Workbench account, so they keep their own password. Choose “Email them an invite” instead.",
    );
  }

  const roles = (userId: string) => data.roleIds.map((roleId) => ({ organizationId, userId, roleId }));

  if (existing) {
    let token: string | null = null;
    try {
      token = await db.$transaction(async (tx) => {
        await tx.organizationMember.create({ data: { organizationId, userId: existing.id, isAdmin: data.isAdmin } });
        await tx.membership.createMany({ data: roles(existing.id) });
        await writeAudit(tx, {
          action: "user.added_to_organization",
          actorId: actor.id,
          entityType: "User",
          entityId: existing.id,
          organizationId,
          ipAddress: ip,
          data: { isAdmin: data.isAdmin, roleIds: data.roleIds },
        });
        // Never chose a password (invited somewhere else first): they need a link to set one.
        return existing.passwordHash ? null : issueSetupToken(tx, existing.id, "INVITE", ADMIN_LINK_TTL_MINUTES);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw alreadyMember();
      throw error;
    }
    const message = token
      ? setupEmail(existing, "INVITE", token, ADMIN_LINK_TTL_MINUTES, { invitedBy: actor.name, organizationName: actor.organization.name })
      : addedToOrganizationEmail({
          to: existing.email,
          name: existing.name,
          invitedBy: actor.name,
          organizationName: actor.organization.name,
          link: organizationLink(actor.organization.slug),
        });
    return { userId: existing.id, emailSent: await trySendEmail(message) };
  }

  const passwordHash =
    data.setup === "temporary" && data.temporaryPassword ? await hashPassword(data.temporaryPassword) : null;

  let created: { userId: string; token: string | null };
  try {
    created = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
          mustChangePassword: data.setup === "temporary",
          orgMemberships: { create: { organizationId, isAdmin: data.isAdmin } },
        },
        select: { id: true },
      });
      await tx.membership.createMany({ data: roles(user.id) });
      const token =
        data.setup === "invite"
          ? await issueSetupToken(tx, user.id, "INVITE", ADMIN_LINK_TTL_MINUTES)
          : null;
      await writeAudit(tx, {
        action: "user.created",
        actorId: actor.id,
        entityType: "User",
        entityId: user.id,
        organizationId,
        ipAddress: ip,
        data: { email: data.email, isAdmin: data.isAdmin, roleIds: data.roleIds, setup: data.setup },
      });
      return { userId: user.id, token };
    });
  } catch (error) {
    // Someone signed up or was invited elsewhere with this address a moment ago.
    if (isUniqueViolation(error)) throw emailTaken();
    throw error;
  }

  const emailSent = created.token
    ? await trySendEmail(
        setupEmail(data, "INVITE", created.token, ADMIN_LINK_TTL_MINUTES, {
          invitedBy: actor.name,
          organizationName: actor.organization.name,
        }),
      )
    : null;
  return { userId: created.userId, emailSent };
}

export async function updateUser(actor: OrgAdmin, input: unknown, ip: string): Promise<void> {
  assertAdmin(actor);
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const data = parsed.data;
  const organizationId = actor.organizationId;
  await assertRolesExist(organizationId, data.roleIds);

  try {
    await db.$transaction(async (tx) => {
      const adminCount = await lockActiveAdmins(tx, organizationId);
      // Holds off the account joining another organization while we decide whether it's managed here.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${data.userId} FOR UPDATE`;
      const member = await requireMember(tx, organizationId, data.userId);
      const name = data.name ?? member.user.name;
      const email = data.email ?? member.user.email;
      const changesProfile = name !== member.user.name || email !== member.user.email;
      assertAllowed(
        checkUserChange(actor, targetOf(member), { kind: "edit", makeAdmin: data.isAdmin, changesProfile }, adminCount),
      );

      const before = {
        name: member.user.name,
        email: member.user.email,
        isAdmin: member.isAdmin,
        roleIds: member.roles.map((r) => r.roleId).sort(),
      };
      const after = { name, email, isAdmin: data.isAdmin, roleIds: [...data.roleIds].sort() };

      if (changesProfile) await tx.user.update({ where: { id: member.user.id }, data: { name, email } });
      await tx.organizationMember.update({ where: { id: member.id }, data: { isAdmin: data.isAdmin } });
      // Only this organization's roles: the person's roles elsewhere are untouched.
      await tx.membership.deleteMany({ where: { organizationId, userId: member.user.id, roleId: { notIn: data.roleIds } } });
      await tx.membership.createMany({ data: data.roleIds.map((roleId) => ({ organizationId, userId: member.user.id, roleId })), skipDuplicates: true });
      await writeAudit(tx, {
        action: "user.updated",
        actorId: actor.id,
        entityType: "User",
        entityId: member.user.id,
        organizationId,
        ipAddress: ip,
        data: { before, after },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw emailTaken();
    throw error;
  }
}

/** Removes someone from (or brings them back to) this organization. Other organizations aren't affected. */
export async function setUserActive(
  actor: OrgAdmin,
  input: unknown,
  active: boolean,
  ip: string,
): Promise<{ openTaskCount: number }> {
  assertAdmin(actor);
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();
  const { userId } = parsed.data;
  const organizationId = actor.organizationId;
  const change: UserChange = active ? { kind: "reactivate" } : { kind: "deactivate" };

  return db.$transaction(async (tx) => {
    const adminCount = await lockActiveAdmins(tx, organizationId);
    const member = await requireMember(tx, organizationId, userId);
    const target = targetOf(member);
    assertAllowed(checkUserChange(actor, target, change, adminCount));

    const now = new Date();
    await tx.organizationMember.update({
      where: { id: member.id },
      data: active ? { isActive: true, deactivatedAt: null } : { isActive: false, deactivatedAt: now },
    });
    // Access to this organization ends on their next request either way. An
    // account that only lives here is also signed out and its links cancelled.
    if (!active && target.managedHere) {
      await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
      await tx.authToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
    }
    await writeAudit(tx, {
      action: active ? "user.reactivated" : "user.deactivated",
      actorId: actor.id,
      entityType: "User",
      entityId: userId,
      organizationId,
      ipAddress: ip,
    });
    const openTaskCount = await tx.task.count({
      where: { assigneeId: userId, status: { not: "DONE" }, item: { organizationId } },
    });
    return { openTaskCount };
  });
}

export type SetupLinkType = "INVITE" | "PASSWORD_RESET" | "ADDED";

/**
 * Emails the person: a link to choose a password (never chose one), a note
 * that they've been added (has a password, hasn't come in yet), or a reset
 * link. Every option goes to the account's own address, so it's safe for
 * accounts shared with other organizations too.
 */
export async function sendSetupLink(
  actor: OrgAdmin,
  input: unknown,
  ip: string,
): Promise<{ emailSent: boolean; type: SetupLinkType }> {
  assertAdmin(actor);
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();
  const organizationId = actor.organizationId;

  const member = await requireMember(db, organizationId, parsed.data.userId);
  assertAllowed(checkUserChange(actor, targetOf(member), { kind: "sendLink" }, Number.POSITIVE_INFINITY));
  const { user } = member;

  const type: SetupLinkType = !user.passwordHash ? "INVITE" : member.joinedAt ? "PASSWORD_RESET" : "ADDED";
  const token = await db.$transaction(async (tx) => {
    const t = type === "ADDED" ? null : await issueSetupToken(tx, user.id, type, ADMIN_LINK_TTL_MINUTES);
    await writeAudit(tx, {
      action: "user.setup_link_sent",
      actorId: actor.id,
      entityType: "User",
      entityId: user.id,
      organizationId,
      ipAddress: ip,
      data: { type },
    });
    return t;
  });

  const message =
    type === "ADDED" || !token
      ? addedToOrganizationEmail({
          to: user.email,
          name: user.name,
          invitedBy: actor.name,
          organizationName: actor.organization.name,
          link: organizationLink(actor.organization.slug),
        })
      : setupEmail(user, type, token, ADMIN_LINK_TTL_MINUTES, {
          invitedBy: actor.name,
          organizationName: actor.organization.name,
        });
  return { emailSent: await trySendEmail(message), type };
}

export async function setTemporaryPassword(actor: OrgAdmin, input: unknown, ip: string): Promise<void> {
  assertAdmin(actor);
  const parsed = temporaryPasswordSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const { userId, temporaryPassword } = parsed.data;

  const passwordHash = await hashPassword(temporaryPassword);
  const now = new Date();
  await db.$transaction(async (tx) => {
    // Checked inside the transaction: the account can't join another organization in between.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const member = await requireMember(tx, actor.organizationId, userId);
    assertAllowed(checkUserChange(actor, targetOf(member), { kind: "setTemporaryPassword" }, Number.POSITIVE_INFINITY));
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true, sessionVersion: { increment: 1 } },
    });
    await tx.authToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
    await writeAudit(tx, {
      action: "user.temporary_password_set",
      actorId: actor.id,
      entityType: "User",
      entityId: userId,
      organizationId: actor.organizationId,
      ipAddress: ip,
    });
  });
}

export async function signOutEverywhere(actor: OrgAdmin, input: unknown, ip: string): Promise<void> {
  assertAdmin(actor);
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();
  const { userId } = parsed.data;

  await db.$transaction(async (tx) => {
    const member = await requireMember(tx, actor.organizationId, userId);
    assertAllowed(checkUserChange(actor, targetOf(member), { kind: "signOutEverywhere" }, Number.POSITIVE_INFINITY));
    await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    await writeAudit(tx, {
      action: "user.signed_out_everywhere",
      actorId: actor.id,
      entityType: "User",
      entityId: userId,
      organizationId: actor.organizationId,
      ipAddress: ip,
    });
  });
}
