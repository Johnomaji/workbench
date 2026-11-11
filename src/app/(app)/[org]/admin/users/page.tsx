import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { ListSkeleton } from "@/components/ui/skeletons";
import { inputClasses } from "@/components/ui/field";
import { NoAccess, PageHeader } from "@/components/ui/layout";
import { formatRelative } from "@/lib/format";
import { orgPath } from "@/lib/org-path";
import { listUsers, type UserStatus } from "@/server/admin/users";
import { requireOrgUser } from "@/server/auth/session";
import { canManageUsers } from "@/server/permissions/policy";
import { userListFilterSchema } from "@/server/validation/users";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage({ params, searchParams }: PageProps<"/[org]/admin/users">) {
  return (
    <Suspense fallback={<ListSkeleton label="Loading people…" />}>
      <PeopleList params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const STATUS_OPTIONS: Array<{ value: "all" | UserStatus; label: string }> = [
  { value: "all", label: "Everyone" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Invited, not in yet" },
  { value: "deactivated", label: "Deactivated" },
];

async function PeopleList({ params, searchParams }: PageProps<"/[org]/admin/users">) {
  const actor = await requireOrgUser((await params).org);
  if (!canManageUsers(actor)) return <NoAccess />;
  const path = (p: string) => orgPath(actor.organization.slug, p);

  const filter = userListFilterSchema.parse(await searchParams);
  const users = await listUsers(actor, filter);
  const filtered = Boolean(filter.q) || (filter.status && filter.status !== "all");
  const now = new Date();

  return (
    <div className="space-y-4">
      <PageHeader
        title="People"
        description={`Everyone in ${actor.organization.name}, and what they do.`}
        actions={<ButtonLink href={path("/admin/users/new")}>Add a person</ButtonLink>}
      />
      <Form action={path("/admin/users")} className="flex flex-col gap-3 sm:flex-row sm:items-end" role="search">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="q" className="block text-sm font-medium">
            Search
          </label>
          <input id="q" name="q" type="search" defaultValue={filter.q ?? ""} placeholder="Name or email" className={inputClasses} />
        </div>
        <div className="space-y-1.5 sm:w-56">
          <label htmlFor="status" className="block text-sm font-medium">
            Show
          </label>
          <select id="status" name="status" defaultValue={filter.status ?? "all"} className={inputClasses}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClasses("secondary")}>
          Apply
        </button>
      </Form>

      <p className="text-sm text-muted" aria-live="polite">
        {users.length === 1 ? "1 person" : `${users.length} people`}
        {filtered && (
          <>
            {" "}·{" "}
            <Link href={path("/admin/users")} className="font-medium text-primary underline underline-offset-4">
              Clear filters
            </Link>
          </>
        )}
      </p>

      {users.length === 0 ? (
        <EmptyState
          title={filtered ? "No one matches those filters" : "No one here yet"}
          description={filtered ? "Try a different name or email, or show everyone." : "Add the first person to get started."}
          action={!filtered ? <ButtonLink href={path("/admin/users/new")}>Add a person</ButtonLink> : undefined}
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {users.map((user) => (
            <li key={user.id}>
              <Link
                href={path(`/admin/users/${user.id}`)}
                className="flex flex-col gap-2 px-4 py-3 hover:bg-surface-muted focus-visible:-outline-offset-2 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{user.name}</p>
                  <p className="truncate text-sm text-muted">{user.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:w-72 sm:justify-end">
                  {user.isAdmin && <Badge tone="primary">Administrator</Badge>}
                  {user.roles.map((role) => (
                    <Badge key={role}>{role}</Badge>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-sm text-muted sm:w-56 sm:justify-end">
                  <StatusBadge status={user.status} />
                  <span>{user.lastLoginAt ? `Signed in ${formatRelative(user.lastLoginAt, now)}` : "Never signed in"}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
