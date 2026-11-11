import type { Metadata } from "next";
import Form from "next/form";
import { Suspense } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { inputClasses } from "@/components/ui/field";
import { NoAccess, PageHeader } from "@/components/ui/layout";
import { ListSkeleton } from "@/components/ui/skeletons";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { listOrganizations } from "@/server/orgs/organizations";
import { OrganizationStatus } from "./organization-status";

export const metadata: Metadata = { title: "Platform" };

/**
 * For whoever runs the service: every customer organization, and a way to
 * suspend one. It shows counts only, never anyone's work.
 */
export default function PlatformPage({ searchParams }: PageProps<"/platform">) {
  return (
    <Suspense fallback={<ListSkeleton label="Loading organizations…" />}>
      <Platform searchParams={searchParams} />
    </Suspense>
  );
}

async function Platform({ searchParams }: Pick<PageProps<"/platform">, "searchParams">) {
  const user = await requireUser();
  if (!user.isPlatformAdmin) return <NoAccess />;
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw.trim().slice(0, 100) : "";
  const organizations = await listOrganizations(user, q || undefined);

  return (
    <div className="space-y-4">
      <PageHeader title="Platform" description="Every organization using this Workbench." />
      <Form action="/platform" className="flex flex-col gap-3 sm:flex-row sm:items-end" role="search">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="q" className="block text-sm font-medium">
            Search
          </label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Name or address" className={inputClasses} />
        </div>
        <button type="submit" className={buttonClasses("secondary")}>
          Search
        </button>
      </Form>
      <p className="text-sm text-muted" aria-live="polite">
        {organizations.length === 1 ? "1 organization" : `${organizations.length} organizations`}
      </p>
      {organizations.length === 0 ? (
        <EmptyState title={q ? "No organization matches" : "No organizations yet"} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {organizations.map((o) => (
            <li key={o.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {o.name}
                  {!o.isActive && <Badge tone="danger">Suspended</Badge>}
                </p>
                <p className="text-sm text-muted">
                  /{o.slug} · {o.activeMembers} {o.activeMembers === 1 ? "member" : "members"} · {o.items}{" "}
                  {o.items === 1 ? "item" : "items"} · since {formatDate(o.createdAt)}
                  {o.suspendedAt ? ` · suspended ${formatDate(o.suspendedAt)}` : ""}
                </p>
              </div>
              <OrganizationStatus id={o.id} name={o.name} isActive={o.isActive} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
