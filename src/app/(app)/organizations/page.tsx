import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/layout";
import { ListSkeleton } from "@/components/ui/skeletons";
import { firstName } from "@/lib/format";
import { orgPath } from "@/lib/org-path";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Your organizations" };

/**
 * Where signing in lands. Someone in one organization goes straight into it;
 * anyone else picks one (or creates their first).
 */
export default function OrganizationsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense fallback={<ListSkeleton rows={3} label="Loading your organizations…" filters={false} />}>
        <Organizations />
      </Suspense>
    </div>
  );
}

async function Organizations() {
  const user = await requireUser();
  if (user.organizations.length === 1) redirect(orgPath(user.organizations[0].slug));

  if (user.organizations.length === 0) {
    return (
      <>
        <PageHeader title={`Welcome, ${firstName(user.name)}`} />
        <EmptyState
          title="You're not in an organization yet"
          description="Create one for your team, or ask an administrator of an existing one to add you. Invitations arrive by email."
          action={<ButtonLink href="/organizations/new">Create an organization</ButtonLink>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Your organizations"
        description="Pick one to open."
        actions={
          <ButtonLink href="/organizations/new" variant="secondary">
            Create an organization
          </ButtonLink>
        }
      />
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {user.organizations.map((o) => (
          <li key={o.id}>
            <Link
              href={orgPath(o.slug)}
              className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-surface-muted focus-visible:-outline-offset-2"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{o.name}</span>
                <span className="block truncate text-sm text-muted">/{o.slug}</span>
              </span>
              {o.isAdmin && <Badge tone="primary">Administrator</Badge>}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
