import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink, Card, PageHeader } from "@/components/ui/layout";
import { FormSkeleton } from "@/components/ui/skeletons";
import { HOME_PATH } from "@/lib/org-path";
import { requireUser } from "@/server/auth/session";
import { CreateOrganizationForm } from "./create-organization-form";

export const metadata: Metadata = { title: "Create an organization" };

export default function NewOrganizationPage() {
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href={HOME_PATH}>Your organizations</BackLink>
      <PageHeader
        title="Create an organization"
        description="A separate space for another company or team, with its own people, items and settings. You'll be its administrator."
      />
      <Suspense fallback={<FormSkeleton fields={2} label="Loading the form…" />}>
        <NewOrganization />
      </Suspense>
    </div>
  );
}

async function NewOrganization() {
  // Signed-in people only; the form itself needs nothing else.
  await requireUser();
  return (
    <Card>
      <CreateOrganizationForm />
    </Card>
  );
}
