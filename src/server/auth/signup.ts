import "server-only";
import { after } from "next/server";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db";
import { signupExistingAccountEmail, signupVerifyEmail } from "@/server/email-templates";
import { appUrl } from "@/server/env";
import { AppError, ValidationError } from "@/server/errors";
import { availableSlug, cleanTimeZone, createOrganizationRecord, isSlugAvailable, isUniqueViolation } from "@/server/orgs/organizations";
import { enforceRateLimit, RATE_LIMITS, rateLimitKey, rateLimiter } from "@/server/providers/rate-limit";
import { fieldErrors } from "@/server/validation/common";
import { completeSignupSchema, signupSchema } from "@/server/validation/organizations";
import { trySendEmail } from "./account";
import { hashPassword } from "./password";
import { generateToken, hashToken, tokenState } from "./tokens";

/**
 * Self-service sign-up, in two steps:
 *  1. The form asks for a name, email and organization. We email a link and
 *     store nothing but a pending request (no user, no organization yet).
 *  2. The link opens a page to choose a password. Only then are the account,
 *     the organization and its starter department created, in one transaction.
 *
 * Step 1 always answers the same way. When the address already has an account,
 * its owner gets an email saying so instead, so the form never reveals who has
 * an account, and nobody can create an account for an address they don't own.
 */

export const SIGNUP_TTL_HOURS = 24;

export function signupLink(token: string): string {
  return `${appUrl()}/signup/${token}`;
}

export async function requestSignup(input: unknown, ip: string): Promise<void> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const data = parsed.data;
  const timeZone = cleanTimeZone((input as { timeZone?: unknown } | null)?.timeZone);

  await enforceRateLimit(rateLimitKey.signupByIp(ip), RATE_LIMITS.signupByIp);
  // Organization addresses are public (they're in every link), so saying one is taken reveals nothing.
  if (!(await isSlugAvailable(db, data.organizationSlug))) {
    throw new ValidationError({ organizationSlug: ["That address is taken. Try another."] });
  }
  const perEmail = await rateLimiter.hit(rateLimitKey.signupByEmail(data.email), RATE_LIMITS.signupByEmail);
  if (!perEmail.ok) return; // stop sending quietly; the answer stays the same

  after(async () => {
    const now = new Date();
    const existing = await db.user.findUnique({ where: { email: data.email }, select: { name: true, isActive: true } });
    if (existing) {
      if (!existing.isActive) return;
      await trySendEmail(
        signupExistingAccountEmail({
          to: data.email,
          name: existing.name,
          loginLink: `${appUrl()}/login`,
          resetLink: `${appUrl()}/forgot-password`,
        }),
      );
      return;
    }

    const { token, tokenHash } = generateToken();
    await db.$transaction([
      // Only the newest link works.
      db.pendingSignup.updateMany({ where: { email: data.email, usedAt: null }, data: { usedAt: now } }),
      db.pendingSignup.create({
        data: {
          email: data.email,
          name: data.name,
          organizationName: data.organizationName,
          organizationSlug: data.organizationSlug,
          timeZone,
          tokenHash,
          expiresAt: new Date(now.getTime() + SIGNUP_TTL_HOURS * 3600_000),
        },
      }),
      // Housekeeping: old requests serve no purpose.
      db.pendingSignup.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 24 * 3600_000) } } }),
    ]);
    await trySendEmail(
      signupVerifyEmail({
        to: data.email,
        name: data.name,
        organizationName: data.organizationName,
        link: signupLink(token),
        expiresInHours: SIGNUP_TTL_HOURS,
      }),
    );
  });
}

export type SignupInfo =
  | { state: "invalid" | "expired" | "used" }
  | { state: "valid"; name: string; email: string; organizationName: string };

export async function getSignupInfo(rawToken: string): Promise<SignupInfo> {
  if (rawToken.length < 20 || rawToken.length > 200) return { state: "invalid" };
  const record = await db.pendingSignup.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { name: true, email: true, organizationName: true, expiresAt: true, usedAt: true },
  });
  if (!record) return { state: "invalid" };
  const state = tokenState(record);
  if (state !== "valid") return { state };
  return { state, name: record.name, email: record.email, organizationName: record.organizationName };
}

/** Step 2: creates the account and the organization. Returns what the caller needs to sign them in. */
export async function completeSignup(input: unknown, ip: string): Promise<{ email: string; slug: string }> {
  await enforceRateLimit(rateLimitKey.completeSignupByIp(ip), RATE_LIMITS.completeSignupByIp);
  const parsed = completeSignupSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const { token, password } = parsed.data;

  const expired = new AppError("This link has expired or has already been used. Sign up again to get a new one.");
  const pending = await db.pendingSignup.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!pending || tokenState(pending) !== "valid") throw expired;

  const passwordHash = await hashPassword(password);
  const attempt = () =>
    db.$transaction(async (tx) => {
      const now = new Date();
      // Claim the link atomically so it can only ever be used once.
      const claimed = await tx.pendingSignup.updateMany({
        where: { id: pending.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw expired;
      if (await tx.user.findUnique({ where: { email: pending.email }, select: { id: true } })) {
        throw new AppError(
          "There's already an account for this email address. Sign in, then create your organization from your list of organizations.",
        );
      }
      const user = await tx.user.create({
        data: { email: pending.email, name: pending.name, passwordHash },
        select: { id: true },
      });
      const slug = await availableSlug(tx, pending.organizationSlug);
      const organization = await createOrganizationRecord(tx, {
        name: pending.organizationName,
        slug,
        ownerId: user.id,
        timeZone: pending.timeZone,
        ip,
      });
      await writeAudit(tx, {
        action: "auth.signed_up",
        actorId: user.id,
        entityType: "User",
        entityId: user.id,
        ipAddress: ip,
        data: { organizationId: organization.id },
      });
      return { email: pending.email, slug: organization.slug };
    });

  // Two sign-ups finishing at the same moment can pick the same free address;
  // the loser rolls back (the link is unclaimed again) and picks the next one.
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (error) {
      if (i < 2 && isUniqueViolation(error)) continue;
      throw error;
    }
  }
}
