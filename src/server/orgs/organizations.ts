import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { isValidTimeZone } from "@/lib/dates";
import { RESERVED_SLUGS, slugWithSuffix } from "@/lib/org-slug";
import { writeAudit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { canManageUsers, type Actor } from "@/server/permissions/policy";
import { enforceRateLimit, RATE_LIMITS, rateLimitKey } from "@/server/providers/rate-limit";
import { fieldErrors } from "@/server/validation/common";
import { organizationIdSchema, organizationSchema } from "@/server/validation/organizations";
import { provisionMediaDepartment } from "./provision";

type Client = PrismaClient | Prisma.TransactionClient;

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const slugTaken = (field = "slug") => new ValidationError({ [field]: ["That address is taken. Try another."] });

/** A time zone from the browser, or UTC when it's missing or unknown. */
export function cleanTimeZone(value: unknown): string {
  return typeof value === "string" && isValidTimeZone(value) ? value : "UTC";
}

export async function isSlugAvailable(client: Client, slug: string): Promise<boolean> {
  if (RESERVED_SLUGS.has(slug)) return false;
  return !(await client.organization.findUnique({ where: { slug }, select: { id: true } }));
}

/** The wanted slug if it's free, otherwise the first free one of wanted-2, wanted-3, … */
export async function availableSlug(client: Client, wanted: string): Promise<string> {
  const candidates = [wanted, ...Array.from({ length: 30 }, (_, i) => slugWithSuffix(wanted, i + 2))];
  const taken = new Set(
    (await client.organization.findMany({ where: { slug: { in: candidates } }, select: { slug: true } })).map((o) => o.slug),
  );
  const free = candidates.find((slug) => !taken.has(slug) && !RESERVED_SLUGS.has(slug));
  // Thirty in a row taken is someone squatting; a random suffix gets past them.
  return free ?? slugWithSuffix(wanted, 100 + Math.floor(Math.random() * 900_000));
}

/**
 * Creates an organization with its first administrator and the starter Media
 * department. Run inside a transaction; a taken slug fails with P2002.
 */
export async function createOrganizationRecord(
  tx: Prisma.TransactionClient,
  input: { name: string; slug: string; ownerId: string; timeZone: string; ip: string },
): Promise<{ id: string; slug: string }> {
  const now = new Date();
  const organization = await tx.organization.create({
    data: { name: input.name, slug: input.slug },
    select: { id: true, slug: true },
  });
  await tx.organizationMember.create({
    data: { organizationId: organization.id, userId: input.ownerId, isAdmin: true, joinedAt: now },
  });
  await provisionMediaDepartment(tx, organization.id, { timeZone: input.timeZone });
  await writeAudit(tx, {
    action: "organization.created",
    actorId: input.ownerId,
    entityType: "Organization",
    entityId: organization.id,
    organizationId: organization.id,
    ipAddress: input.ip,
    data: { name: input.name, slug: input.slug },
  });
  return organization;
}

/** A signed-in person starts another organization; they become its administrator. */
export async function createOrganization(user: CurrentUser, input: unknown, ip: string): Promise<{ slug: string }> {
  await enforceRateLimit(rateLimitKey.createOrganizationByUser(user.id), RATE_LIMITS.createOrganizationByUser);
  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const { name, slug } = parsed.data;
  const timeZone = cleanTimeZone((input as { timeZone?: unknown } | null)?.timeZone);

  if (!(await isSlugAvailable(db, slug))) throw slugTaken();
  try {
    return await db.$transaction((tx) => createOrganizationRecord(tx, { name, slug, ownerId: user.id, timeZone, ip }));
  } catch (error) {
    if (isUniqueViolation(error)) throw slugTaken();
    throw error;
  }
}

/** Rename an organization or change its address. Old links stop working when the address changes. */
export async function updateOrganization(
  actor: Actor & { organization: { id: string; slug: string; name: string } },
  input: unknown,
  ip: string,
): Promise<{ slug: string }> {
  if (!canManageUsers(actor)) throw new ForbiddenError("Only administrators can change the organization's settings.");
  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const { name, slug } = parsed.data;
  const before = actor.organization;

  if (slug !== before.slug && !(await isSlugAvailable(db, slug))) throw slugTaken();
  try {
    await db.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: actor.organizationId }, data: { name, slug } });
      await writeAudit(tx, {
        action: "organization.updated",
        actorId: actor.id,
        entityType: "Organization",
        entityId: actor.organizationId,
        organizationId: actor.organizationId,
        ipAddress: ip,
        data: { before: { name: before.name, slug: before.slug }, after: { name, slug } },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw slugTaken();
    throw error;
  }
  return { slug };
}

// ── Platform administration ──────────────────────────────────────────────

export type PlatformOrganization = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  suspendedAt: Date | null;
  activeMembers: number;
  items: number;
};

function assertPlatformAdmin(user: CurrentUser) {
  if (!user.isPlatformAdmin) throw new ForbiddenError("Only platform administrators can do that.");
}

/** Every organization with a few counts. No customer content: names of items, scripts or people stay private. */
export async function listOrganizations(user: CurrentUser, q?: string): Promise<PlatformOrganization[]> {
  assertPlatformAdmin(user);
  const rows = await db.organization.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q.toLowerCase() } }] }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      suspendedAt: true,
      itemCounter: true,
      _count: { select: { members: { where: { isActive: true } } } },
    },
  });
  return rows.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    isActive: o.isActive,
    createdAt: o.createdAt,
    suspendedAt: o.suspendedAt,
    activeMembers: o._count.members,
    items: o.itemCounter,
  }));
}

/** Suspends an organization (nobody can open it; nothing is deleted) or lifts the suspension. */
export async function setOrganizationActive(user: CurrentUser, input: unknown, active: boolean, ip: string): Promise<void> {
  assertPlatformAdmin(user);
  const parsed = organizationIdSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();
  const { organizationId } = parsed.data;

  await db.$transaction(async (tx) => {
    const updated = await tx.organization.updateMany({
      where: { id: organizationId, isActive: !active },
      data: active ? { isActive: true, suspendedAt: null } : { isActive: false, suspendedAt: new Date() },
    });
    if (updated.count === 0) {
      const exists = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
      if (!exists) throw new NotFoundError("That organization no longer exists.");
      return; // already in that state
    }
    await writeAudit(tx, {
      action: active ? "organization.reactivated" : "organization.suspended",
      actorId: user.id,
      entityType: "Organization",
      entityId: organizationId,
      organizationId,
      ipAddress: ip,
    });
  });
}
