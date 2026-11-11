import type { Metadata } from "next";
import { Suspense } from "react";
import { Alert } from "@/components/ui/feedback";
import { NoAccess, PageHeader, Section } from "@/components/ui/layout";
import { SectionsSkeleton } from "@/components/ui/skeletons";
import { requireOrgUser } from "@/server/auth/session";
import { canManageUsers } from "@/server/permissions/policy";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage({ params, searchParams }: PageProps<"/[org]/admin/settings">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<SectionsSkeleton sections={1} label="Loading settings…" />}>
        <Settings params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Settings({ params, searchParams }: PageProps<"/[org]/admin/settings">) {
  const [{ org }, query] = await Promise.all([params, searchParams]);
  const actor = await requireOrgUser(org);
  if (!canManageUsers(actor)) return <NoAccess />;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description={`How ${actor.organization.name} appears to everyone in it.`} />
      {query.moved === "1" && (
        <Alert tone="success">Saved. This is the organization&apos;s new address; let people know their old links won&apos;t work.</Alert>
      )}
      <Section id="organization" title="Organization">
        <SettingsForm name={actor.organization.name} slug={actor.organization.slug} />
      </Section>
    </div>
  );
}
