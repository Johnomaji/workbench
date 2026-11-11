"use server";

import { CredentialsSignin } from "next-auth";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { HOME_PATH } from "@/lib/org-path";
import { toErrorState } from "@/server/action-errors";
import { changePassword, updateProfile } from "@/server/auth/account";
import { signIn, signOut } from "@/server/auth";
import { requireUserForAction } from "@/server/auth/session";
import { getClientIp } from "@/server/request";

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login?reason=goodbye" });
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = formData.get("password");
  const wasRequired = formData.get("required") === "1";
  let email: string;
  try {
    const user = await requireUserForAction({ allowPendingPasswordChange: true });
    const ip = getClientIp(await headers());
    ({ email } = await changePassword(
      user,
      {
        currentPassword: formData.get("currentPassword"),
        password,
        confirmPassword: formData.get("confirmPassword"),
      },
      ip,
    ));
  } catch (error) {
    return toErrorState(error);
  }

  // The change signed out every session (including this one). Sign back in here.
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: wasRequired ? HOME_PATH : "/account/password?changed=1",
    });
  } catch (error) {
    if (error instanceof CredentialsSignin) redirect("/login?reason=password-set");
    throw error;
  }
  return { status: "idle" };
}

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUserForAction();
    await updateProfile(user, { name: formData.get("name") }, getClientIp(await headers()));
  } catch (error) {
    return toErrorState(error);
  }
  refresh();
  return { status: "success", message: "Saved. Everyone in your organizations sees the new name." };
}
