import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/feedback";
import { PageHeader, Section } from "@/components/ui/layout";
import { SectionsSkeleton } from "@/components/ui/skeletons";
import { orgPath } from "@/lib/org-path";
import { requireUser } from "@/server/auth/session";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your account" description="One account for every organization you're in." />
      <Suspense fallback={<SectionsSkeleton sections={3} label="Loading your account…" />}>
        <Account />
      </Suspense>
    </div>
  );
}

async function Account() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <Section id="profile" title="Profile" description={`You sign in as ${user.email}.`}>
        <ProfileForm name={user.name} />
      </Section>

      <Section id="password" title="Password">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">Changing it signs you out on your other devices.</p>
          <Link href="/account/password" className="text-sm font-medium text-primary underline underline-offset-4">
            Change password
          </Link>
        </div>
      </Section>

      <Section id="organizations" title="Organizations" description="Where this account can sign in.">
        {user.organizations.length === 0 ? (
          <p className="text-sm text-muted">
            None yet.{" "}
            <Link href="/organizations/new" className="font-medium text-primary underline underline-offset-4">
              Create one
            </Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {user.organizations.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3">
                <Link href={orgPath(o.slug)} className="font-medium hover:underline">
                  {o.name}
                </Link>
                {o.isAdmin && <Badge tone="primary">Administrator</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
