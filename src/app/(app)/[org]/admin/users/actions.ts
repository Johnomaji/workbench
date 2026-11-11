"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { orgPath } from "@/lib/org-path";
import { toErrorState } from "@/server/action-errors";
import {
  createUser,
  sendSetupLink,
  setTemporaryPassword,
  setUserActive,
  signOutEverywhere,
  updateUser,
} from "@/server/admin/users";
import { signOut } from "@/server/auth";
import { requireOrgAdminForAction } from "@/server/auth/session";
import { enforceRateLimit, RATE_LIMITS, rateLimitKey } from "@/server/providers/rate-limit";
import { getClientIp } from "@/server/request";
import { formToObject } from "@/server/validation/users";

/** Every admin action: re-check the session and admin rights in the form's organization, rate limit, capture the IP. */
async function adminContext(formData: FormData) {
  const actor = await requireOrgAdminForAction(formData.get("org"));
  await enforceRateLimit(rateLimitKey.adminActionsByUser(actor.id), RATE_LIMITS.adminActionsByUser);
  const ip = getClientIp(await headers());
  return { actor, ip };
}

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let result: Awaited<ReturnType<typeof createUser>>;
  let slug: string;
  try {
    const { actor, ip } = await adminContext(formData);
    slug = actor.organization.slug;
    result = await createUser(actor, formToObject(formData, ["roleIds"]), ip);
  } catch (error) {
    return toErrorState(error);
  }
  const notice =
    result.emailSent === null ? "created-temporary" : result.emailSent ? "created-invited" : "created-email-failed";
  redirect(orgPath(slug, `/admin/users/${result.userId}?notice=${notice}`));
}

export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor, ip } = await adminContext(formData);
    await updateUser(actor, formToObject(formData, ["roleIds"]), ip);
  } catch (error) {
    return toErrorState(error);
  }
  refresh();
  return { status: "success", message: "Changes saved." };
}

export async function setUserActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const activate = formData.get("intent") === "reactivate";
  try {
    const { actor, ip } = await adminContext(formData);
    const { openTaskCount } = await setUserActive(actor, { userId: formData.get("userId") }, activate, ip);
    refresh();
    if (activate) return { status: "success", message: "Account reactivated. They can sign in again." };
    const tasks =
      openTaskCount > 0
        ? ` They still have ${openTaskCount} open ${openTaskCount === 1 ? "task" : "tasks"}. Reassign ${openTaskCount === 1 ? "it" : "them"} so work isn't stuck.`
        : "";
    return { status: "success", message: `Account deactivated and signed out everywhere.${tasks}` };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function sendSetupLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor, ip } = await adminContext(formData);
    const { emailSent, type } = await sendSetupLink(actor, { userId: formData.get("userId") }, ip);
    refresh();
    if (!emailSent) {
      return {
        status: "error",
        message: "We couldn't send the email. Check the email settings, or set a temporary password instead.",
      };
    }
    return {
      status: "success",
      message:
        type === "INVITE"
          ? "Invite sent. The link works once and expires in 72 hours."
          : type === "ADDED"
            ? "Email sent. It tells them they've been added and links straight here."
            : "Password reset link sent. It works once and expires in 72 hours.",
    };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function setTemporaryPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor, ip } = await adminContext(formData);
    await setTemporaryPassword(
      actor,
      { userId: formData.get("userId"), temporaryPassword: formData.get("temporaryPassword") },
      ip,
    );
    refresh();
    return {
      status: "success",
      message:
        "Temporary password set and all their sessions signed out. Share it privately; they'll be asked to choose their own when they sign in.",
    };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function signOutEverywhereAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let isSelf = false;
  try {
    const { actor, ip } = await adminContext(formData);
    const userId = formData.get("userId");
    isSelf = userId === actor.id;
    await signOutEverywhere(actor, { userId }, ip);
  } catch (error) {
    return toErrorState(error);
  }
  // Their own session is now revoked: drop its cookie too, or the proxy would keep treating them as signed in.
  if (isSelf) await signOut({ redirectTo: "/login?reason=signed-out" });
  return { status: "success", message: "Signed out of all devices. They'll need to sign in again." };
}
