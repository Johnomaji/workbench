import type { Metadata } from "next";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { FormSkeleton } from "@/components/ui/skeletons";
import { getSignupInfo } from "@/server/auth/signup";
import { CompleteSignupForm } from "./complete-signup-form";

export const metadata: Metadata = { title: "Finish signing up" };

/**
 * Opened from the confirmation email. Nothing happens on opening it (email
 * scanners open links too); the organization is created when the form is sent.
 */
export default function CompleteSignupPage({ params }: PageProps<"/signup/[token]">) {
  return (
    <Suspense fallback={<FormSkeleton fields={2} card={false} label="Checking your link…" />}>
      <CompleteSignup params={params} />
    </Suspense>
  );
}

async function CompleteSignup({ params }: Pick<PageProps<"/signup/[token]">, "params">) {
  const { token } = await params;
  const info = await getSignupInfo(token);

  if (info.state !== "valid") {
    const message =
      info.state === "used"
        ? "This link has already been used. If you finished signing up, sign in instead."
        : info.state === "expired"
          ? "This link has expired."
          : "This link isn't valid. It may have been copied incompletely.";
    return (
      <>
        <h1 className="text-xl font-semibold">This link doesn&apos;t work any more</h1>
        <p className="mt-1 mb-5 text-sm text-muted">{message}</p>
        <div className="space-y-2">
          <ButtonLink href="/signup" className="w-full">
            Sign up again
          </ButtonLink>
          <ButtonLink href="/login" variant="secondary" className="w-full">
            Sign in
          </ButtonLink>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Welcome, {info.name}</h1>
      <p className="mt-1 mb-5 text-sm text-muted">
        Choose a password to finish creating <span className="font-medium text-foreground">{info.organizationName}</span>.
        You&apos;ll sign in as <span className="font-medium text-foreground">{info.email}</span>.
      </p>
      <CompleteSignupForm token={token} email={info.email} />
    </>
  );
}
