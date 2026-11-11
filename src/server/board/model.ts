/**
 * The board: one column per stage, one card per content item, and the board
 * filters. Pure functions (no database), so grouping and filtering are
 * unit-tested. The queries load items, drop the ones the person can't see,
 * and pass the rest in.
 */
import { isDueThisWeek, isOverdue } from "@/lib/dates";
import { WorkflowIndex } from "@/server/workflow/definition";
import type { StageKind, TaskStatus, WorkflowDef } from "@/server/workflow/types";

export const BOARD_DEADLINES = ["overdue", "week", "none"] as const;
export type BoardDeadline = (typeof BOARD_DEADLINES)[number];

export const BOARD_STATUSES = ["waiting", "inProgress", "sentBack", "changes", "completed"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export type BoardFilter = {
  /** "me", "unassigned", or a user id. */
  person?: string;
  deadline?: BoardDeadline;
  status?: BoardStatus;
};

export type BoardItemInput = {
  number: number;
  title: string;
  deadline: Date | null;
  completedAt: Date | null;
  firstSubmittedAt: Date | null;
  stageId: string;
  def: WorkflowDef;
  tasks: {
    templateId: string;
    assigneeId: string | null;
    assigneeName: string | null;
    status: TaskStatus;
    changesRequested: boolean;
  }[];
};

/** One task of the item's current step. Parallel steps (design and video) have several. */
export type BoardLane = {
  name: string;
  assignee: { id: string; name: string } | null;
  status: TaskStatus;
  changesRequested: boolean;
};

export type BoardCard = {
  number: number;
  title: string;
  deadline: Date | null;
  completedAt: Date | null;
  isDraft: boolean;
  overdue: boolean;
  sentBack: boolean;
  changesRequested: boolean;
  /** Empty once the item is completed. */
  lanes: BoardLane[];
};

export type BoardColumn = {
  key: string;
  name: string;
  kind: StageKind;
  /** More than one task runs at once in this stage. */
  parallel: boolean;
  cards: BoardCard[];
};

export type Board = {
  columns: BoardColumn[];
  /** Items on the board before filtering, and after. */
  total: number;
  matched: number;
};

type Prepared = { card: BoardCard; columnKey: string; input: BoardItemInput; statuses: Set<BoardStatus> };

function prepare(input: BoardItemInput, now: Date): Prepared {
  const ix = new WorkflowIndex(input.def);
  const stageIndex = ix.indexOf(input.stageId);
  const stage = ix.stages[stageIndex];
  const workIndex = input.completedAt ? null : ix.currentWorkIndex(stageIndex);
  const templates = workIndex === null ? [] : [...ix.stages[workIndex].tasks].sort((a, b) => a.position - b.position);

  const lanes: BoardLane[] = templates.flatMap((template) => {
    const task = input.tasks.find((t) => t.templateId === template.id);
    if (!task) return [];
    return [
      {
        name: template.name,
        assignee: task.assigneeId ? { id: task.assigneeId, name: task.assigneeName ?? "Unknown" } : null,
        status: task.status,
        changesRequested: task.changesRequested && task.status !== "DONE",
      },
    ];
  });

  const statuses = new Set<BoardStatus>();
  if (input.completedAt) statuses.add("completed");
  else {
    if (stage.kind === "QUEUE" || lanes.some((l) => l.status === "READY")) statuses.add("waiting");
    if (lanes.some((l) => l.status === "IN_PROGRESS")) statuses.add("inProgress");
    if (lanes.some((l) => l.status === "SENT_BACK")) statuses.add("sentBack");
    if (lanes.some((l) => l.changesRequested)) statuses.add("changes");
  }

  return {
    columnKey: stage.key,
    input,
    statuses,
    card: {
      number: input.number,
      title: input.title,
      deadline: input.deadline,
      completedAt: input.completedAt,
      isDraft: !input.firstSubmittedAt,
      overdue: isOverdue(input.deadline, input.completedAt, now),
      sentBack: statuses.has("sentBack"),
      changesRequested: statuses.has("changes"),
      lanes,
    },
  };
}

function matches(p: Prepared, filter: BoardFilter, actorId: string, timeZone: string, now: Date): boolean {
  if (filter.person) {
    if (filter.person === "unassigned") {
      if (!p.card.lanes.some((l) => !l.assignee && l.status !== "DONE")) return false;
    } else {
      const id = filter.person === "me" ? actorId : filter.person;
      // On the current step; for completed items, anyone who worked on it.
      const onIt = p.input.completedAt
        ? p.input.tasks.some((t) => t.assigneeId === id)
        : p.card.lanes.some((l) => l.assignee?.id === id);
      if (!onIt) return false;
    }
  }
  if (filter.deadline === "overdue" && !p.card.overdue) return false;
  if (filter.deadline === "week" && !isDueThisWeek(p.input.deadline, timeZone, now)) return false;
  if (filter.deadline === "none" && p.input.deadline) return false;
  if (filter.status && !p.statuses.has(filter.status)) return false;
  return true;
}

/** Soonest deadline first (no deadline last); completed: most recent first. */
function compareCards(a: BoardCard, b: BoardCard): number {
  if (a.completedAt && b.completedAt) return b.completedAt.getTime() - a.completedAt.getTime() || a.number - b.number;
  const da = a.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
  const dbt = b.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
  return da === dbt ? a.number - b.number : da - dbt;
}

/**
 * Groups items into columns. Columns come from `layout` (the department's
 * current workflow). Items still on an older workflow version are placed by
 * stage key; a stage that no longer exists gets its own column before the
 * finished one, so nothing disappears from the board.
 */
export function buildBoard({
  layout,
  items,
  filter = {},
  actorId,
  timeZone,
  now = new Date(),
}: {
  layout: WorkflowDef;
  items: BoardItemInput[];
  filter?: BoardFilter;
  actorId: string;
  timeZone: string;
  now?: Date;
}): Board {
  const columns: BoardColumn[] = new WorkflowIndex(layout).stages.map((s) => ({
    key: s.key,
    name: s.name,
    kind: s.kind,
    parallel: s.tasks.length > 1,
    cards: [],
  }));
  const byKey = new Map(columns.map((c) => [c.key, c]));

  let matched = 0;
  for (const input of items) {
    const p = prepare(input, now);
    let column = byKey.get(p.columnKey);
    if (!column) {
      const stage = new WorkflowIndex(input.def).stage(input.stageId);
      column = { key: stage.key, name: stage.name, kind: stage.kind, parallel: stage.tasks.length > 1, cards: [] };
      const doneAt = columns.findIndex((c) => c.kind === "DONE");
      columns.splice(doneAt === -1 ? columns.length : doneAt, 0, column);
      byKey.set(column.key, column);
    }
    if (!matches(p, filter, actorId, timeZone, now)) continue;
    column.cards.push(p.card);
    matched++;
  }
  for (const column of columns) column.cards.sort(compareCards);
  return { columns, total: items.length, matched };
}

/**
 * Which stage a phone shows first: the first one where the person has
 * something to do, then the first with any cards, then the first stage.
 */
export function defaultStage(columns: BoardColumn[], actorId: string): string | null {
  const mine = columns.find((c) => c.cards.some((card) => card.lanes.some((l) => l.assignee?.id === actorId && l.status !== "DONE")));
  const nonEmpty = columns.find((c) => c.kind !== "DONE" && c.cards.length > 0) ?? columns.find((c) => c.cards.length > 0);
  return (mine ?? nonEmpty ?? columns[0])?.key ?? null;
}
