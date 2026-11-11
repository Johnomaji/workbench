import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { after, connection } from "next/server";
import { SESSION_ENDED_PATH } from "@/lib/session-cookie";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { canManageUsers, type Actor, type ActorMembership } from "@/server/permissions/policy";
import { orgParamSchema } from "@/server/validation/organizations";
import { auth } from "./index";

export type OrganizationSummary = { id: string; slug: string; name: string; isAdmin: boolean };

/** The signed-in person, wherever they are in the app. */
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  /** Organizations they can open (active membership of an active organization), by name. */
  organizations: OrganizationSummary[];
};

/**
 * The signed-in person acting inside one organization: their admin rights and
 * roles there, and nothing from any other organization. Every organization
 * page and action works with one of these.
 */
export type OrgUser = Actor &
  CurrentUser & {
    organization: { id: string; slug: string; name: string };
  };

type MemberRecord = {
  id: string;
  isAdmin: boolean;
  joinedAt: Date | null;
  organization: { id: string; slug: string; name: string };
  memberships: ActorMembership[];
};

/**
 * Reads the session and re-checks it against the database: deactivation,
 * suspension, "sign out everywhere", password changes, role changes and
 * removal from an organization all take effect on the next request.
 * Deduplicated per render with React cache().
 */
const loadSession = cache(async (): Promise<{ user: CurrentUser; members: MemberRecord[] } | null> => {
  // Session reads always happen at request time. Without this, Auth.js generates
  // a CSRF token (crypto.getRandomValues) while Next prerenders the page shell,
  // which Cache Components rejects.
  await connection();
  const session = await auth();
  const userId = session?.user?.id;
  const sessionVersion = session?.sessionVersion;
  if (!userId || typeof sessionVersion !== "number") return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isPlatformAdmin: true,
      isActive: true,
      sessionVersion: true,
      mustChangePassword: true,
      orgMemberships: {
        where: { isActive: true, organization: { isActive: true } },
        orderBy: { organization: { name: "asc" } },
        select: {
          id: true,
          isAdmin: true,
          joinedAt: true,
          organization: { select: { id: true, slug: true, name: true } },
          roles: {
            where: { role: { department: { isActive: true } } },
            select: {
              role: {
                select: {
                  id: true,
                  key: true,
                  name: true,
                  canCreateItems: true,
                  canManageItems: true,
                  department: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive || user.sessionVersion !== sessionVersion) return null;

  const members: MemberRecord[] = user.orgMemberships.map((m) => ({
    id: m.id,
    isAdmin: m.isAdmin,
    joinedAt: m.joinedAt,
    organization: m.organization,
    memberships: m.roles.map(({ role }) => ({
      roleId: role.id,
      roleKey: role.key,
      roleName: role.name,
      departmentId: role.department.id,
      departmentName: role.department.name,
      canCreateItems: role.canCreateItems,
      canManageItems: role.canManageItems,
    })),
  }));

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
      mustChangePassword: user.mustChangePassword,
      organizations: members.map((m) => ({ ...m.organization, isAdmin: m.isAdmin })),
    },
    members,
  };
});

/** Data Access Layer entry point: the signed-in user, or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => (await loadSession())?.user ?? null);

/**
 * The signed-in user inside the organization with this slug, or null when
 * they aren't an active member of it (or it doesn't exist, or is suspended).
 * The three look the same on purpose: nobody learns which organizations exist.
 */
export const getOrgUser = cache(async (slug: string): Promise<OrgUser | null> => {
  const parsed = orgParamSchema.safeParse(slug);
  if (!parsed.success) return null;
  const session = await loadSession();
  const member = session?.members.find((m) => m.organization.slug === parsed.data);
  if (!session || !member) return null;

  const departments = await db.department.findMany({
    where: { organizationId: member.organization.id, isActive: true },
    select: { id: true },
  });

  if (!member.joinedAt) {
    // First visit after being invited: they're in now.
    const memberId = member.id;
    after(() => db.organizationMember.updateMany({ where: { id: memberId, joinedAt: null }, data: { joinedAt: new Date() } }));
  }

  return {
    ...session.user,
    isActive: true,
    isAdmin: member.isAdmin,
    organizationId: member.organization.id,
    organization: member.organization,
    orgDepartmentIds: departments.map((d) => d.id),
    memberships: member.memberships,
  };
});

/** For pages: the signed-in user, or a redirect to sign-in. */
export async function requireUser(options: { allowPendingPasswordChange?: boolean } = {}) {
  const user = await getCurrentUser();
  // The proxy only lets visitors with a session cookie this far, so that cookie
  // is dead: clear it on the way to sign-in.
  if (!user) redirect(SESSION_ENDED_PATH);
  if (user.mustChangePassword && !options.allowPendingPasswordChange) {
    redirect("/account/password?required=1");
  }
  return user;
}

/** For organization pages: the user inside that organization, or a 404 when they can't open it. */
export async function requireOrgUser(slug: string): Promise<OrgUser> {
  await requireUser();
  const orgUser = await getOrgUser(slug);
  if (!orgUser) notFound();
  return orgUser;
}

/** For server actions: the signed-in user, or a ForbiddenError (never a redirect mid-form). */
export async function requireUserForAction(
  options: { allowPendingPasswordChange?: boolean } = {},
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("Your session has ended. Please sign in again.");
  if (user.mustChangePassword && !options.allowPendingPasswordChange) {
    throw new ForbiddenError("Please change your temporary password first.");
  }
  return user;
}

/**
 * For organization actions. `slug` comes from the form, so it's only a hint:
 * membership is checked here, and everything the action touches is then
 * looked up inside this organization.
 */
export async function requireOrgUserForAction(slug: unknown): Promise<OrgUser> {
  await requireUserForAction();
  const orgUser = typeof slug === "string" ? await getOrgUser(slug) : null;
  if (!orgUser) throw new ForbiddenError("You don't have access to this organization any more. Reload the page.");
  return orgUser;
}

export async function requireOrgAdminForAction(slug: unknown): Promise<OrgUser> {
  const user = await requireOrgUserForAction(slug);
  if (!canManageUsers(user)) throw new ForbiddenError("Only administrators can do that.");
  return user;
}

export async function requirePlatformAdminForAction(): Promise<CurrentUser> {
  const user = await requireUserForAction();
  if (!user.isPlatformAdmin) throw new ForbiddenError("Only platform administrators can do that.");
  return user;
}
