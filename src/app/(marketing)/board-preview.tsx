import { Badge } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";

/*
 * A picture of the board, drawn with the app's own styles so it stays sharp
 * and follows light and dark mode. Every name and item is made up.
 */

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

const DOT: Record<Tone, string> = {
  neutral: "bg-border-strong",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

type Lane = { name?: string; who: string | null; status: string; tone: Tone };
type Card = {
  number: number;
  title: string;
  due: string;
  overdue?: boolean;
  flags?: Array<{ label: string; tone: Tone }>;
  lanes: Lane[];
};
type Column = { name: string; className: string; cards: Card[] };

const COLUMNS: Column[] = [
  {
    name: "Drafting",
    className: "hidden lg:block",
    cards: [
      { number: 18, title: "Spring launch explainer", due: "Due Fri", lanes: [{ who: "Amara Okafor", status: "In progress", tone: "primary" }] },
      {
        number: 19,
        title: "Customer story: Lumen Bakery",
        due: "No deadline",
        lanes: [{ who: null, status: "Ready to start", tone: "primary" }],
      },
    ],
  },
  {
    name: "Editing",
    className: "hidden sm:block",
    cards: [
      { number: 16, title: "How to plan a content calendar", due: "Due tomorrow", lanes: [{ who: "Tunde Bello", status: "In progress", tone: "primary" }] },
      {
        number: 15,
        title: "Behind the scenes at the studio",
        due: "Overdue · Mon",
        overdue: true,
        flags: [{ label: "Changes requested", tone: "warning" }],
        lanes: [{ who: "Sofia Reyes", status: "In progress", tone: "primary" }],
      },
    ],
  },
  {
    name: "Design & video",
    className: "block",
    cards: [
      {
        number: 14,
        title: "Product tour in 60 seconds",
        due: "Due Thu",
        lanes: [
          { name: "Design", who: "Kemi Adeyemi", status: "Done", tone: "success" },
          { name: "Video", who: "Marco Silva", status: "In progress", tone: "primary" },
        ],
      },
      {
        number: 12,
        title: "Webinar promo: autumn roadmap",
        due: "Due next Tue",
        flags: [{ label: "Sent back", tone: "danger" }],
        lanes: [
          { name: "Design", who: "Kemi Adeyemi", status: "Sent back", tone: "danger" },
          { name: "Video", who: "Lena Fischer", status: "In progress", tone: "primary" },
        ],
      },
    ],
  },
  {
    name: "Final review",
    className: "hidden lg:block",
    cards: [{ number: 11, title: "Our year in review", due: "Due today", lanes: [{ who: "Priya Nair", status: "Ready to start", tone: "primary" }] }],
  },
];

function PreviewCard({ card }: { card: Card }) {
  const sentBack = card.flags?.some((f) => f.tone === "danger");
  return (
    <div className={cn("space-y-2 rounded-lg border bg-surface p-3 shadow-xs", sentBack ? "border-danger/40" : "border-border")}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>#{card.number}</span>
        {card.overdue ? <Badge tone="danger">{card.due}</Badge> : <span>{card.due}</span>}
      </div>
      <p className="text-sm leading-snug font-medium">{card.title}</p>
      {card.flags && (
        <div className="flex flex-wrap gap-1">
          {card.flags.map((f) => (
            <Badge key={f.label} tone={f.tone}>
              {f.label}
            </Badge>
          ))}
        </div>
      )}
      <ul className="space-y-1 border-t border-border pt-2 text-xs">
        {card.lanes.map((lane) => (
          <li key={lane.name ?? "only"} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              {lane.name && <span className="font-medium">{lane.name} · </span>}
              {lane.who ?? <span className="text-muted">Nobody yet</span>}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-muted">
              <span className={cn("size-2 rounded-full", DOT[lane.tone])} />
              {lane.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BoardPreview() {
  return (
    <div
      role="img"
      aria-label="An example board. Items move through Drafting, Editing, Design & video, and Final review. One item has design done and video in progress at the same time; another was sent back with a note."
      className="rounded-2xl border border-border bg-surface-muted p-3 shadow-xl shadow-foreground/5 sm:p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
        </div>
        <div className="flex gap-1.5 text-xs">
          <span className="rounded-md border border-border bg-surface px-2 py-1 text-muted">Everyone</span>
          <span className="rounded-md border border-border bg-surface px-2 py-1 text-muted">Any deadline</span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COLUMNS.map((column) => (
          <div key={column.name} className={cn("min-w-0", column.className)}>
            <p className="mb-2 px-1 text-xs font-semibold">
              {column.name} <span className="font-normal text-muted">({column.cards.length})</span>
            </p>
            <div className="space-y-2">
              {column.cards.map((card) => (
                <PreviewCard key={card.number} card={card} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
