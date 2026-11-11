import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TaskStatusBadges } from "@/components/task-status";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/layout";
import { WorkSkeleton } from "@/components/ui/skeletons";
import { formatDay } from "@/lib/dates";
import { firstName } from "@/lib/format";
import { orgPath } from "@/lib/org-path";
import { requireOrgUser } from "@/server/auth/session";
import { getMyWork, type WorkCard } from "@/server/items/queries";
import { canCreateItem } from "@/server/permissions/policy";

export const metadata: Metadata = { title: "My work" };

export default function HomePage({ params }: PageProps<"/[org]">) {
  return (
    <Suspense fallback={<WorkSkeleton />}>
      <Home params={params} />
    </Suspense>
  );
}

async function Home({ params }: Pick<PageProps<"/[org]">, "params">) {
  const user = await requireOrgUser((await params).org);
  const path = (p: string) => orgPath(user.organization.slug, p);
  const work = await getMyWork(user);
  const canCreate = user.isAdmin || user.memberships.some((m) => canCreateItem(user, m.departmentId));
  const nothing = work.yourTurn.length + work.upForGrabs.length + work.comingUp.length === 0;

  return (
    <>
      <PageHeader
        title={`Hi, ${firstName(user.name)}`}
        description={
          work.yourTurn.length > 0
            ? `${work.yourTurn.length} ${work.yourTurn.length === 1 ? "thing needs" : "things need"} you right now.`
            : "Nothing needs you right now."
        }
        meta={
          <>
            {user.isAdmin && <Badge tone="primary">Administrator</Badge>}
            {user.memberships.map((m) => (
              <Badge key={m.roleId}>
                {m.roleName} · {m.departmentName}
              </Badge>
            ))}
          </>
        }
        actions={canCreate ? <ButtonLink href={path("/items/new")}>New item</ButtonLink> : undefined}
      />

      {nothing ? (
        <EmptyState
          title="Nothing assigned to you yet"
          description="When a script, edit, design or video is waiting for you, it'll show up here."
          action={
            <ButtonLink href={path("/items")} variant="secondary">
              See all items
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-8">
          <WorkSection
            title="Your turn"
            description="Waiting for you to work on."
            cards={work.yourTurn}
            path={path}
            empty="You're all caught up."
          />
          {work.upForGrabs.length > 0 && (
            <WorkSection
              title="Up for grabs"
              description="Nobody has picked these up yet. Open one and pick it up if you can take it."
              cards={work.upForGrabs}
              path={path}
            />
          )}
          {work.comingUp.length > 0 && (
            <WorkSection
              title="Coming up"
              description="Assigned to you, waiting for earlier steps, or on hold."
              cards={work.comingUp}
              path={path}
            />
          )}
        </div>
      )}
    </>
  );
}

function WorkSection({
  title,
  description,
  cards,
  path,
  empty,
}: {
  title: string;
  description: string;
  cards: WorkCard[];
  path: (p: string) => string;
  empty?: string;
}) {
  const id = `section-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h2 id={id} className="text-lg font-semibold">
          {title} <span className="text-muted">({cards.length})</span>
        </h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.taskId}>
              <Link
                href={path(`/items/${card.itemNumber}`)}
                className="block h-full space-y-2 rounded-xl border border-border bg-surface p-4 hover:border-border-strong hover:bg-surface-muted"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">
                    {card.taskName} <span className="font-normal text-muted">· {card.stageName}</span>
                  </p>
                  <span className="text-sm text-muted">#{card.itemNumber}</span>
                </div>
                <p className="text-sm">{card.itemTitle}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <TaskStatusBadges
                    status={card.status}
                    active={title !== "Coming up"}
                    changesRequested={card.changesRequested}
                  />
                  {card.deadline && (
                    <Badge tone={card.overdue ? "danger" : "neutral"}>
                      {card.overdue ? "Overdue: " : "Due "}
                      {formatDay(card.deadline, card.timeZone)}
                    </Badge>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
