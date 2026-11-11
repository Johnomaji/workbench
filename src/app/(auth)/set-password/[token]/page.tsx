import type { Metadata } from "next";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { FormSkeleton } from "@/components/ui/skeletons";
import { getSetupTokenInfo } from "@/server/auth/account";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Choose a password" };

export default function SetPasswordPage({ params }: PageProps<"/set-password/[token]">) {
  return (
    <Suspense fallback={<FormSkeleton fields={2} card={false} label="Checking your link…" />}>
      <SetPassword params={params} />
    </Suspense>
  );
}

async function SetPassword({ params }: Pick<PageProps<"/set-password/[token]">, "params">) {
  const { token } = await params;
  const info = await getSetupTokenInfo(token);

  if (info.state !== "valid") {
    const message =
      info.state === "used"
        ? "This link has already been used. Each link works once."
        : info.state === "expired"
          ? "This link has expired."
          : "This link isn't valid. It may have been copied incompletely.";
    return (
      <>
        <h1 className="text-xl font-semibold">This link doesn&apos;t work any more</h1>
        <p className="mt-1 mb-5 text-sm text-muted">
          {message} You can ask for a new one, or ask your administrator to send it again.
        </p>
        <ButtonLink href="/forgot-password" className="w-full">
          Get a new link
        </ButtonLink>
      </>
    );
  }

  const isInvite = info.type === "INVITE";
  return (
    <>
      <h1 className="text-xl font-semibold">{isInvite ? `Welcome, ${info.name}` : "Choose a new password"}</h1>
      <p className="mt-1 mb-5 text-sm text-muted">
        {isInvite ? "Choose a password to finish setting up your account." : "Pick something you haven't used before."}{" "}
        You&apos;ll sign in as <span className="font-medium text-foreground">{info.email}</span>.
      </p>
      <SetPasswordForm token={token} email={info.email} />
    </>
  );
}
