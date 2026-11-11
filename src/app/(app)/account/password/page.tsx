import type { Metadata } from "next";
import { Suspense } from "react";
import { Alert } from "@/components/ui/feedback";
import { FormSkeleton } from "@/components/ui/skeletons";
import { PageHeader } from "@/components/ui/layout";
import { requireUser } from "@/server/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default function ChangePasswordPage({ searchParams }: PageProps<"/account/password">) {
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Change password" />
      <Suspense fallback={<FormSkeleton fields={3} label="Loading…" />}>
        <ChangePassword searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ChangePassword({ searchParams }: Pick<PageProps<"/account/password">, "searchParams">) {
  const user = await requireUser({ allowPendingPasswordChange: true });
  const params = await searchParams;
  const required = user.mustChangePassword;

  return (
    <div className="space-y-4">
      {required && (
        <Alert tone="warning" title="Choose your own password to continue">
          You signed in with a temporary password from your administrator.
        </Alert>
      )}
      {params.changed === "1" && !required && (
        <Alert tone="success">Your password has been changed. Other devices have been signed out.</Alert>
      )}
      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <ChangePasswordForm email={user.email} required={required} />
      </div>
    </div>
  );
}
