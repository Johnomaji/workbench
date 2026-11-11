/**
 * Helpers for the tests that run against a real Postgres (TEST_DATABASE_URL).
 * Imported by *.db.test.ts files only.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { OrgUser } from "@/server/auth/session";
import { provisionMediaDepartment, type ProvisionedDepartment } from "@/server/orgs/provision";
import type { MediaRoleKey } from "@/server/workflow/media-template";

/** Every table, children first. Tests wipe the whole (separate) database before they start. */
export const ALL_TABLES = [
  "AuditLog",
  "Notification",
  "Attachment",
  "Comment",
  "ScriptVersion",
  "TaskAssignment",
  "Task",
  "ContentItem",
  "TaskTemplate",
  "Stage",
  "Workflow",
  "Membership",
  "Role",
  "Department",
  "OrganizationMember",
  "Organization",
  "PendingSignup",
  "AuthToken",
  "RateLimitBucket",
  "User",
];

export async function resetDatabase(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(`TRUNCATE ${ALL_TABLES.map((t) => `"${t}"`).join(",")} RESTART IDENTITY CASCADE`);
}

export type TestOrg = ProvisionedDepartment & { id: string; slug: string; name: string };

/** An organization with the starter Media department, like a fresh sign-up gets. */
export async function createTestOrg(db: PrismaClient, slug: string, name: string): Promise<TestOrg> {
  const org = await db.organization.create({ data: { slug, name } });
  return { id: org.id, slug: org.slug, name: org.name, ...(await provisionMediaDepartment(db, org.id)) };
}

/**
 * Adds someone to an organization with the given Media roles, creating the
 * account if the email is new. Returns the user id.
 */
export async function addPerson(
  db: PrismaClient,
  org: TestOrg,
  person: { email: string; name: string; roles?: MediaRoleKey[]; isAdmin?: boolean; passwordHash?: string | null },
): Promise<string> {
  const user =
    (await db.user.findUnique({ where: { email: person.email }, select: { id: true } })) ??
    (await db.user.create({
      data: { email: person.email, name: person.name, passwordHash: person.passwordHash ?? null },
      select: { id: true },
    }));
  await db.organizationMember.create({
    data: { organizationId: org.id, userId: user.id, isAdmin: person.isAdmin ?? false, joinedAt: new Date() },
  });
  if (person.roles?.length) {
    await db.membership.createMany({
      data: person.roles.map((key) => ({ organizationId: org.id, userId: user.id, roleId: org.roleIds[key] })),
    });
  }
  return user.id;
}

/** Someone as the session layer would hand them to an organization's pages and actions. */
export async function orgUser(db: PrismaClient, email: string, organizationId: string): Promise<OrgUser> {
  const u = await db.user.findUniqueOrThrow({
    where: { email },
    include: {
      orgMemberships: { include: { organization: true } },
      memberships: { where: { organizationId }, include: { role: { include: { department: true } } } },
    },
  });
  const member = u.orgMemberships.find((m) => m.organizationId === organizationId);
  if (!member) throw new Error(`${email} isn't a member of ${organizationId}`);
  const departments = await db.department.findMany({ where: { organizationId, isActive: true }, select: { id: true } });
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isPlatformAdmin: u.isPlatformAdmin,
    mustChangePassword: u.mustChangePassword,
    organizations: u.orgMemberships
      .filter((m) => m.isActive && m.organization.isActive)
      .map((m) => ({ id: m.organization.id, slug: m.organization.slug, name: m.organization.name, isAdmin: m.isAdmin })),
    isAdmin: member.isAdmin,
    isActive: u.isActive && member.isActive,
    organizationId,
    organization: { id: member.organization.id, slug: member.organization.slug, name: member.organization.name },
    orgDepartmentIds: departments.map((d) => d.id),
    memberships: u.memberships.map(({ role }) => ({
      roleId: role.id,
      roleKey: role.key,
      roleName: role.name,
      departmentId: role.departmentId,
      departmentName: role.department.name,
      canCreateItems: role.canCreateItems,
      canManageItems: role.canManageItems,
    })),
  };
}
