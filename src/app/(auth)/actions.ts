"use server";

import { CredentialsSignin } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { HOME_PATH, orgPath } from "@/lib/org-path";
import { toErrorState } from "@/server/action-errors";
import { requestPasswordReset, setPasswordWithToken } from "@/server/auth/account";
import { signIn } from "@/server/auth";
import { completeSignup, requestSignup } from "@/server/auth/signup";
import { getClientIp, safeRedirectPath } from "@/server/request";

const LOGIN_MESSAGES: Record<string, string> = {
  invalid: "That email and password don't match. Check them and try again.",
  deactivated: "This account has been suspended. If you think that's a mistake, contact support.",
  rate_limited: "Too many sign-in attempts. Please wait 15 minutes and try again.",
};

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const redirectTo = safeRedirectPath(formData.get("callbackUrl"), HOME_PATH);
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo,
    });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      return { status: "error", message: LOGIN_MESSAGES[error.code] ?? LOGIN_MESSAGES.invalid };
    }
    return toErrorState(error); // re-throws the success redirect
  }
  return { status: "idle" };
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ip = getClientIp(await headers());
    await requestPasswordReset({ email: formData.get("email") }, ip);
    return {
      status: "success",
      message:
        "If there's an account for that email, we've sent it a link to choose a new password. " +
        "It can take a few minutes. Check your spam folder too.",
    };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function setPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = formData.get("password");
  let email: string;
  try {
    const ip = getClientIp(await headers());
    ({ email } = await setPasswordWithToken(
      { token: formData.get("token"), password, confirmPassword: formData.get("confirmPassword") },
      ip,
    ));
  } catch (error) {
    return toErrorState(error);
  }

  // Sign them straight in with the password they just chose.
  try {
    await signIn("credentials", { email, password, redirectTo: HOME_PATH });
  } catch (error) {
    if (error instanceof CredentialsSignin) redirect("/login?reason=password-set");
    throw error;
  }
  return { status: "idle" };
}

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ip = getClientIp(await headers());
    await requestSignup(
      {
        name: formData.get("name"),
        email: formData.get("email"),
        organizationName: formData.get("organizationName"),
        organizationSlug: formData.get("organizationSlug"),
        timeZone: formData.get("timeZone"),
      },
      ip,
    );
    return {
      status: "success",
      message:
        "Check your email. We've sent a link to confirm your address and choose a password; your organization is created when you use it. " +
        "It can take a few minutes. Check your spam folder too.",
    };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function completeSignupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = formData.get("password");
  let result: { email: string; slug: string };
  try {
    const ip = getClientIp(await headers());
    result = await completeSignup(
      { token: formData.get("token"), password, confirmPassword: formData.get("confirmPassword") },
      ip,
    );
  } catch (error) {
    return toErrorState(error);
  }

  // Straight into the new organization.
  try {
    await signIn("credentials", { email: result.email, password, redirectTo: orgPath(result.slug) });
  } catch (error) {
    if (error instanceof CredentialsSignin) redirect("/login?reason=signed-up");
    throw error;
  }
  return { status: "idle" };
}
