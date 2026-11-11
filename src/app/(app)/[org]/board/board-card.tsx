import Link from "next/link";
import { taskStatusLabel } from "@/components/task-status";
import { Badge } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { formatShortDay } from "@/lib/dates";
import { formatRelative } from "@/lib/format";
import type { BoardCard, BoardLane } from "@/server/board/model";

const DOT: Record<ReturnType<typeof taskStatusLabel>["tone"], string> = {
  neutral: "bg-border-strong",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

function Lane({ lane, showName }: { lane: BoardLane; showName: boolean }) {
  const { label, tone } = taskStatusLabel(lane.status, true);
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate">
        {showName && <span className="font-medium">{lane.name} · </span>}
        {lane.assignee ? lane.assignee.name : <span className="text-muted">Nobody yet</span>}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted">
        <span aria-hidden="true" className={cn("size-2 rounded-full", DOT[tone])} />
        {label}
      </span>
    </li>
  );
}

/** One item on the board. The title is the link; the whole card is clickable. */
export function BoardCardView({
  card,
  href,
  parallel,
  timeZone,
  now,
}: {
  card: BoardCard;
  href: string;
  parallel: boolean;
  timeZone: string;
  now: Date;
}) {
  const flags = card.isDraft || card.sentBack || card.changesRequested;
  return (
    <article
      className={cn(
        "relative space-y-2 rounded-lg border bg-surface p-3 shadow-xs transition-colors",
        "hover:border-border-strong has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus",
        card.sentBack ? "border-danger/40" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>#{card.number}</span>
        {card.completedAt ? (
          <span>Completed {formatRelative(card.completedAt, now)}</span>
        ) : card.overdue && card.deadline ? (
          <Badge tone="danger">Overdue · {formatShortDay(card.deadline, timeZone, now)}</Badge>
        ) : card.deadline ? (
          <span>Due {formatShortDay(card.deadline, timeZone, now)}</span>
        ) : (
          <span>No deadline</span>
        )}
      </div>

      <h3 className="leading-snug font-medium break-words">
        <Link href={href} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none">
          {card.title}
        </Link>
      </h3>

      {flags && (
        <div className="flex flex-wrap gap-1">
          {card.sentBack && <Badge tone="danger">Sent back</Badge>}
          {card.changesRequested && <Badge tone="warning">Changes requested</Badge>}
          {card.isDraft && <Badge>Draft</Badge>}
        </div>
      )}

      {card.lanes.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-2 text-sm" aria-label={parallel ? "Tasks" : "Who's on it"}>
          {card.lanes.map((lane) => (
            <Lane key={lane.name} lane={lane} showName={parallel} />
          ))}
        </ul>
      )}
    </article>
  );
}
