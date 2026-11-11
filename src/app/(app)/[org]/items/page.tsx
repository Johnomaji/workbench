import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TaskStatusBadges } from "@/components/task-status";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/layout";
import { ListSkeleton } from "@/components/ui/skeletons";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { orgPath } from "@/lib/org-path";
import { requireOrgUser } from "@/server/auth/session";
import { listItems } from "@/server/items/queries";
import { canCreateItem } from "@/server/permissions/policy";
import { itemListFilterSchema } from "@/server/validation/items";

export const metadata: Metadata = { title: "All items" };

const TABS = [
  { value: "open", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
] as const;

export default function ItemsPage({ params, searchParams }: PageProps<"/[org]/items">) {
  return (
    <>
      <PageHeader title="All items" description="Everything your department is working on." />
      <Suspense fallback={<ListSkeleton label="Loading items…" filters={false} />}>
        <Items params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Items({ params, searchParams }: PageProps<"/[org]/items">) {
  const user = await requireOrgUser((await params).org);
  const path = (p: string) => orgPath(user.organization.slug, p);
  const show = itemListFilterSchema.parse(await searchParams).show ?? "open";
  const items = await listItems(user, show);
  const canCreate = user.isAdmin || user.memberships.some((m) => canCreateItem(user, m.departmentId));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filter items" className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface-muted p-0.5">
          {TABS.map((tab) => (
            <Link
              key={tab.value}
              href={path(tab.value === "open" ? "/items" : `/items?show=${tab.value}`)}
              aria-current={show === tab.value ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted",
                "aria-[current=page]:bg-surface aria-[current=page]:text-foreground aria-[current=page]:shadow-sm",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        {canCreate && <ButtonLink href={path("/items/new")}>New item</ButtonLink>}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={show === "open" ? "Nothing in progress" : show === "completed" ? "Nothing completed yet" : "Nothing archived"}
          description={show === "open" ? "New items show up here as soon as they're created." : undefined}
          action={show === "open" && canCreate ? <ButtonLink href={path("/items/new")}>New item</ButtonLink> : undefined}
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {items.map((item) => (
            <li key={item.number}>
              <Link
                href={path(`/items/${item.number}`)}
                className="flex flex-col gap-2 px-4 py-3 hover:bg-surface-muted focus-visible:-outline-offset-2 md:flex-row md:items-center md:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    <span className="text-muted">#{item.number}</span> {item.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                    <Badge tone={item.completedAt ? "success" : "primary"}>{item.stageName}</Badge>
                    {item.isDraft && <Badge>Draft</Badge>}
                    {item.deadline && (
                      <Badge tone={item.overdue ? "danger" : "neutral"}>
                        {item.overdue ? "Overdue: " : "Due "}
                        {formatDay(item.deadline, item.timeZone)}
                      </Badge>
                    )}
                  </div>
                </div>
                {item.current.length > 0 && (
                  <ul className="flex flex-col gap-1 text-sm md:w-80">
                    {item.current.map((t) => (
                      <li key={t.taskName} className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{t.taskName}:</span>
                        <span className="text-muted">{t.assigneeName ?? "Nobody yet"}</span>
                        <TaskStatusBadges status={t.status} active changesRequested={t.changesRequested} />
                      </li>
                    ))}
                  </ul>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
