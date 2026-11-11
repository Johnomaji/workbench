import "server-only";
import { after } from "next/server";
import type { AuthTokenType, Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db";
import { inviteEmail, passwordResetEmail } from "@/server/email-templates";
import { appUrl } from "@/server/env";
import { AppError, ValidationError } from "@/server/errors";
import { emailProvider, type EmailMessage } from "@/server/providers/email";
import {
  enforceRateLimit,
  RATE_LIMITS,
  rateLimitKey,
  rateLimiter,
} from "@/server/providers/rate-limit";
import { changePasswordSchema, forgotPasswordSchema, setPasswordSchema } from "@/server/validation/auth";
import { fieldErrors } from "@/server/validation/common";
import { profileSchema } from "@/server/validation/organizations";
import { hashPassword, verifyPassword } from "./password";
import { generateToken, hashToken, INVITE_TTL_HOURS, RESET_TTL_MINUTES, tokenState } from "./tokens";

export function setPasswordLink(token: string): string {
  return `${appUrl()}/set-password/${token}`;
}

/**
 * Creates a one-time set-password link for a user and invalidates any older
 * ones. Returns the raw token (only ever sent by email, never stored).
 */
export async function issueSetupToken(
  tx: Prisma.TransactionClient,
  userId: string,
  type: AuthTokenType,
  ttlMinutes: number,
): Promise<string> {
  const now = new Date();
  await tx.authToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
  const { token, tokenHash } = generateToken();
  await tx.authToken.create({
    data: { userId, type, tokenHash, expiresAt: new Date(now.getTime() + ttlMinutes * 60_000) },
  });
  return token;
}

export function setupEmail(
  user: { email: string; name: string },
  type: AuthTokenType,
  token: string,
  ttlMinutes: number,
  invite: { invitedBy?: string; organizationName?: string } = {},
): EmailMessage {
  const link = setPasswordLink(token);
  return type === "INVITE"
    ? inviteEmail({
        to: user.email,
        name: user.name,
        invitedBy: invite.invitedBy ?? "Your administrator",
        organizationName: invite.organizationName,
        link,
        expiresInHours: Math.round(ttlMinutes / 60),
      })
    : passwordResetEmail({ to: user.email, name: user.name, link, expiresInMinutes: ttlMinutes });
}

/** Sends an email and reports success instead of throwing. Failures are logged. */
export async function trySendEmail(message: EmailMessage): Promise<boolean> {
  try {
    await emailProvider().send(message);
    return true;
  } catch (error) {
    console.error("Email delivery failed", { to: message.to, subject: message.subject, error });
    return false;
  }
}

/**
 * "Forgot password". Always behaves the same whether or not the email has an
 * account; the lookup and email happen after the response is sent.
 */
export async function requestPasswordReset(input: unknown, ip: string): Promise<void> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const { email } = parsed.data;

  await enforceRateLimit(rateLimitKey.passwordResetByIp(ip), RATE_LIMITS.passwordResetByIp);
  const perEmail = await rateLimiter.hit(
    rateLimitKey.passwordResetByEmail(email),
    RATE_LIMITS.passwordResetByEmail,
  );
  if (!perEmail.ok) return; // silently stop sending; don't reveal anything

  after(async () => {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, isActive: true, passwordHash: true },
    });
    if (!user || !user.isActive) return;
    // Someone who never accepted their invite gets a fresh invite instead.
    const type: AuthTokenType = user.passwordHash ? "PASSWORD_RESET" : "INVITE";
    const ttl = type === "INVITE" ? INVITE_TTL_HOURS * 60 : RESET_TTL_MINUTES;
    const token = await db.$transaction((tx) => issueSetupToken(tx, user.id, type, ttl));
    await trySendEmail(setupEmail(user, type, token, ttl));
  });
}

export type SetupTokenInfo =
  | { state: "invalid" }
  | { state: "expired" | "used"; type: AuthTokenType }
  | { state: "valid"; type: AuthTokenType; name: string; email: string };

export async function getSetupTokenInfo(rawToken: string): Promise<SetupTokenInfo> {
  if (rawToken.length < 20 || rawToken.length > 200) return { state: "invalid" };
  const record = await db.authToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: {
      type: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { name: true, email: true, isActive: true } },
    },
  });
  if (!record || !record.user.isActive) return { state: "invalid" };
  const state = tokenState(record);
  if (state !== "valid") return { state, type: record.type };
  return { state, type: record.type, name: record.user.name, email: record.user.email };
}

/** Completes an invite or reset link. Returns the email so the caller can sign the person in. */
export async function setPasswordWithToken(input: unknown, ip: string): Promise<{ email: string }> {
  await enforceRateLimit(rateLimitKey.setPasswordByIp(ip), RATE_LIMITS.setPasswordByIp);

  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const { token, password } = parsed.data;

  const expired = new AppError("This link has expired or has already been used. Ask for a new one.");
  const record = await db.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, type: true, expiresAt: true, usedAt: true, user: { select: { id: true, email: true, isActive: true } } },
  });
  if (!record || !record.user.isActive || tokenState(record) !== "valid") throw expired;

  const passwordHash = await hashPassword(password);
  const now = new Date();
  await db.$transaction(async (tx) => {
    // Claim the token atomically so it can only ever be used once.
    const claimed = await tx.authToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw expired;
    await tx.authToken.updateMany({ where: { userId: record.user.id, usedAt: null }, data: { usedAt: now } });
    await tx.user.update({
      where: { id: record.user.id },
      data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
    });
    await writeAudit(tx, {
      action: "auth.password_set",
      actorId: record.user.id,
      entityType: "User",
      entityId: record.user.id,
      ipAddress: ip,
      data: { via: record.type },
    });
  });

  return { email: record.user.email };
}

/** Change password while signed in (also used to replace a temporary password). */
export async function changePassword(
  user: { id: string; email: string },
  input: unknown,
  ip: string,
): Promise<{ email: string }> {
  await enforceRateLimit(rateLimitKey.changePasswordByUser(user.id), RATE_LIMITS.changePasswordByUser);

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  const { currentPassword, password } = parsed.data;

  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row?.passwordHash || !(await verifyPassword(currentPassword, row.passwordHash))) {
    throw new ValidationError({ currentPassword: ["That isn't your current password."] });
  }

  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      // Bumping sessionVersion signs out every other device.
      data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
    });
    await writeAudit(tx, {
      action: "auth.password_changed",
      actorId: user.id,
      entityType: "User",
      entityId: user.id,
      ipAddress: ip,
    });
  });

  return { email: user.email };
}

/** The signed-in person changes their own name (shown to everyone in their organizations). */
export async function updateProfile(user: { id: string }, input: unknown, ip: string): Promise<void> {
  await enforceRateLimit(rateLimitKey.accountActionsByUser(user.id), RATE_LIMITS.accountActionsByUser);
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
  await db.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } });
    if (before.name === parsed.data.name) return;
    await tx.user.update({ where: { id: user.id }, data: { name: parsed.data.name } });
    await writeAudit(tx, {
      action: "account.profile_updated",
      actorId: user.id,
      entityType: "User",
      entityId: user.id,
      ipAddress: ip,
      data: { before: { name: before.name }, after: { name: parsed.data.name } },
    });
  });
}
