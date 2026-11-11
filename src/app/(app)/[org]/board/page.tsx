import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/layout";
import { BoardSkeleton } from "@/components/ui/skeletons";
import { orgPath } from "@/lib/org-path";
import { requireOrgUser } from "@/server/auth/session";
import type { BoardColumn } from "@/server/board/model";
import { BOARD_COMPLETED_DAYS, getBoard } from "@/server/board/queries";
import { boardFilterSchema } from "@/server/validation/board";
import { BoardCardView } from "./board-card";
import { BoardFilters } from "./board-filters";
import { BoardView } from "./board-view";

export const metadata: Metadata = { title: "Board" };

export default function BoardPage({ params, searchParams }: PageProps<"/[org]/board">) {
  return (
    // data-wide lets the app shell use the full screen width for the columns.
    <div data-wide>
      <PageHeader title="Board" description="Every item, by the stage it's at." />
      <Suspense fallback={<BoardSkeleton />}>
        <Board params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Board({ params, searchParams }: PageProps<"/[org]/board">) {
  const user = await requireOrgUser((await params).org);
  const path = (p: string) => orgPath(user.organization.slug, p);
  const search = boardFilterSchema.parse(await searchParams);
  const filter = { person: search.person, deadline: search.deadline, status: search.status };
  const board = await getBoard(user, { ...filter, dept: search.dept });
  const now = new Date();
  const activeCount = Object.values(filter).filter(Boolean).length;

  if (!board.department) {
    return (
      <EmptyState
        title="You're not in a department yet"
        description={user.isAdmin ? "Give yourself or others a role under People." : "Ask an administrator to give you a role."}
        action={user.isAdmin ? <ButtonLink href={path("/admin/users")} variant="secondary">People</ButtonLink> : undefined}
      />
    );
  }
  if (board.total === 0) {
    return (
      <EmptyState
        title="Nothing on the board yet"
        description="Items show up here as soon as they're created."
        action={board.canCreate ? <ButtonLink href={path("/items/new")}>New item</ButtonLink> : undefined}
      />
    );
  }

  const timeZone = board.department.timeZone;
  const stage = board.columns.some((c) => c.key === search.stage) ? search.stage! : board.defaultStage;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <BoardFilters
          boardPath={path("/board")}
          values={{ dept: board.department.key, person: search.person ?? "", deadline: search.deadline ?? "", status: search.status ?? "" }}
          people={board.people}
          departments={board.departments}
          meId={user.id}
          activeCount={activeCount}
        />
        {board.canCreate && (
          <ButtonLink href={path("/items/new")} className="self-start md:self-auto">
            New item
          </ButtonLink>
        )}
      </div>

      <p className="text-sm text-muted" aria-live="polite">
        {activeCount > 0
          ? `${board.matched} of ${board.total} ${board.total === 1 ? "item matches" : "items match"} these filters.`
          : `${board.total} ${board.total === 1 ? "item" : "items"}.`}
      </p>

      {board.matched === 0 ? (
        <EmptyState
          title="Nothing matches these filters"
          description="Try a different person, deadline or status."
          action={
            <ButtonLink href={path("/board")} variant="secondary">
              Clear filters
            </ButtonLink>
          }
        />
      ) : (
        <BoardView
          boardPath={path("/board")}
          initialStage={stage}
          columns={board.columns.map((column) => ({
            key: column.key,
            name: column.name,
            count: column.cards.length,
            content: <Column column={column} timeZone={timeZone} now={now} path={path} />,
          }))}
        />
      )}
    </div>
  );
}

function Column({ column, timeZone, now, path }: { column: BoardColumn; timeZone: string; now: Date; path: (p: string) => string }) {
  const id = `column-${column.key}`;
  return (
    <section aria-labelledby={id} className="rounded-xl bg-surface-muted p-2">
      <header className="flex items-center justify-between gap-2 px-1.5 pt-1 pb-2.5">
        <h2 id={id} className="text-sm font-semibold">
          {column.name}
        </h2>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted">
          <span className="sr-only">{column.cards.length === 1 ? "1 item" : `${column.cards.length} items`}</span>
          <span aria-hidden="true">{column.cards.length}</span>
        </span>
      </header>
      {column.cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong px-3 py-6 text-center text-sm text-muted">Nothing here</p>
      ) : (
        <ol className="space-y-2">
          {column.cards.map((card) => (
            <li key={card.number}>
              <BoardCardView card={card} href={path(`/items/${card.number}`)} parallel={column.parallel} timeZone={timeZone} now={now} />
            </li>
          ))}
        </ol>
      )}
      {column.kind === "DONE" && (
        <p className="px-1.5 pt-2.5 pb-1 text-xs text-muted">
          The last {BOARD_COMPLETED_DAYS} days.{" "}
          <Link href={path("/items?show=completed")} className="font-medium text-primary underline underline-offset-4">
            All completed items
          </Link>
        </p>
      )}
    </section>
  );
}
