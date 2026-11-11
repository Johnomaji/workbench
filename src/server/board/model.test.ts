import { describe, expect, it } from "vitest";
import { endOfDayIn } from "@/lib/dates";
import {
  Flow,
  itemAtScriptApproved,
  itemInProduction,
  mediaDef,
  newItem,
  NOW,
  people,
  task,
} from "@/server/workflow/test-helpers";
import type { ItemState, WorkflowDef } from "@/server/workflow/types";
import { buildBoard, defaultStage, type BoardFilter, type BoardItemInput } from "./model";

const def = mediaDef();
const NAMES: Record<string, string> = Object.fromEntries(Object.values(people).map((p) => [p.id, p.id.replace("u_", "")]));

let counter = 0;
function input(
  item: ItemState,
  extra: Partial<Pick<BoardItemInput, "deadline" | "title" | "number">> & { workflow?: WorkflowDef } = {},
): BoardItemInput {
  return {
    number: extra.number ?? ++counter,
    title: extra.title ?? `Item ${counter}`,
    deadline: extra.deadline ?? null,
    completedAt: item.completedAt,
    firstSubmittedAt: item.firstSubmittedAt,
    stageId: item.stageId,
    def: extra.workflow ?? def,
    tasks: item.tasks.map((t) => ({
      templateId: t.templateId,
      assigneeId: t.assigneeId,
      assigneeName: t.assigneeId ? NAMES[t.assigneeId] : null,
      status: t.status,
      changesRequested: t.changesRequested,
    })),
  };
}

const board = (items: BoardItemInput[], filter: BoardFilter = {}, actorId = people.pm.id) =>
  buildBoard({ layout: def, items, filter, actorId, timeZone: "UTC", now: NOW });

const numbersIn = (b: ReturnType<typeof board>, key: string) => b.columns.find((c) => c.key === key)!.cards.map((c) => c.number);

// Items at different places in the workflow.
function drafting() {
  return new Flow(newItem(people.writer)).item; // writer working on it, a private draft
}
function waitingForEditor() {
  return new Flow(newItem(people.pm, { SCRIPT: people.writer })).withScript().do(people.writer, { type: "submit", taskId: task("SCRIPT") }).item;
}
function designDoneVideoInProgress() {
  return itemInProduction()
    .do(people.video, { type: "start", taskId: task("VIDEO") })
    .do(people.designer, { type: "submit", taskId: task("DESIGN") }).item;
}
function completed() {
  const flow = itemInProduction()
    .do(people.designer, { type: "submit", taskId: task("DESIGN") })
    .do(people.video, { type: "submit", taskId: task("VIDEO") })
    .do(people.pm, { type: "submit", taskId: task("REVIEW") });
  return { ...flow.item, completedAt: NOW };
}
function sentBackToWriter() {
  const flow = new Flow(newItem(people.pm, { SCRIPT: people.writer, EDIT: people.editor }))
    .withScript()
    .do(people.writer, { type: "submit", taskId: task("SCRIPT") })
    .do(people.editor, { type: "start", taskId: task("EDIT") })
    .do(people.editor, { type: "sendBack", fromTaskId: task("EDIT"), comment: "Too long" });
  return flow.item;
}

describe("board columns", () => {
  it("has one column per stage, in order, with design and video as one parallel column", () => {
    const b = board([]);
    expect(b.columns.map((c) => c.name)).toEqual([
      "Drafting",
      "Ready for editing",
      "Editing",
      "Script approved",
      "Design & video",
      "Final review",
      "Completed",
    ]);
    expect(b.columns.filter((c) => c.parallel).map((c) => c.key)).toEqual(["IN_PRODUCTION"]);
  });

  it("puts each item in its stage's column", () => {
    const b = board([
      input(drafting(), { number: 1 }),
      input(waitingForEditor(), { number: 2 }),
      input(itemAtScriptApproved().item, { number: 3 }),
      input(designDoneVideoInProgress(), { number: 4 }),
      input(completed(), { number: 5 }),
    ]);
    expect(numbersIn(b, "DRAFTING")).toEqual([1]);
    expect(numbersIn(b, "READY_FOR_EDITING")).toEqual([2]);
    expect(numbersIn(b, "APPROVED_SCRIPT")).toEqual([3]);
    expect(numbersIn(b, "IN_PRODUCTION")).toEqual([4]);
    expect(numbersIn(b, "COMPLETED")).toEqual([5]);
    expect(b.total).toBe(5);
    expect(b.matched).toBe(5);
  });

  it("shows design and video as two lanes, each with its own status and person", () => {
    const card = board([input(designDoneVideoInProgress())]).columns.find((c) => c.key === "IN_PRODUCTION")!.cards[0];
    expect(card.lanes).toEqual([
      { name: "Design", assignee: { id: "u_designer", name: "designer" }, status: "DONE", changesRequested: false },
      { name: "Video", assignee: { id: "u_video", name: "video" }, status: "IN_PROGRESS", changesRequested: false },
    ]);
  });

  it("shows who's up next while an item waits in a queue", () => {
    const card = board([input(waitingForEditor())]).columns.find((c) => c.key === "READY_FOR_EDITING")!.cards[0];
    expect(card.lanes).toEqual([{ name: "Edit", assignee: null, status: "READY", changesRequested: false }]);
  });

  it("flags drafts, send-backs, change requests and overdue items", () => {
    const changes = new Flow(waitingForEditor())
      .do(people.editor, { type: "start", taskId: task("EDIT") })
      .do(people.pm, { type: "requestChanges", taskId: task("EDIT"), comment: "Shorter intro" }).item;
    const b = board([
      input(drafting(), { number: 1, deadline: new Date("2026-11-01T23:59:59Z") }),
      input(sentBackToWriter(), { number: 2 }),
      input(changes, { number: 3 }),
    ]);
    const [draft, sentBack] = b.columns.find((c) => c.key === "DRAFTING")!.cards;
    expect(draft).toMatchObject({ isDraft: true, overdue: true, sentBack: false });
    expect(sentBack).toMatchObject({ isDraft: false, sentBack: true });
    expect(b.columns.find((c) => c.key === "IN_EDITING")!.cards[0]).toMatchObject({ changesRequested: true, sentBack: false });
  });

  it("completed items have no lanes", () => {
    expect(board([input(completed())]).columns.at(-1)!.cards[0].lanes).toEqual([]);
  });

  it("sorts by soonest deadline, no deadline last; completed by most recent", () => {
    const b = board([
      input(drafting(), { number: 1 }),
      input(drafting(), { number: 2, deadline: endOfDayIn("2026-11-20", "UTC") }),
      input(drafting(), { number: 3, deadline: endOfDayIn("2026-11-10", "UTC") }),
      input({ ...completed(), completedAt: new Date("2026-11-01T10:00:00Z") }, { number: 4 }),
      input({ ...completed(), completedAt: new Date("2026-11-06T10:00:00Z") }, { number: 5 }),
    ]);
    expect(numbersIn(b, "DRAFTING")).toEqual([3, 2, 1]);
    expect(numbersIn(b, "COMPLETED")).toEqual([5, 4]);
  });

  it("keeps items on an older workflow version, placing them by stage key", () => {
    const old = mediaDef();
    old.id = "wf_old";
    for (const s of old.stages) s.id = s.id.replace("stage:", "old:");
    // The old version has an extra stage that the current one dropped.
    old.stages.splice(5, 0, { id: "old:LEGAL", key: "LEGAL", name: "Legal check", position: 5.5, kind: "QUEUE", tasks: [] });

    const editing = waitingForEditor();
    const b = board([
      input({ ...editing, stageId: "old:READY_FOR_EDITING" }, { number: 1, workflow: old }),
      input({ ...editing, stageId: "old:LEGAL" }, { number: 2, workflow: old }),
    ]);
    expect(numbersIn(b, "READY_FOR_EDITING")).toEqual([1]);
    expect(b.columns.map((c) => c.key).slice(-2)).toEqual(["LEGAL", "COMPLETED"]);
    expect(numbersIn(b, "LEGAL")).toEqual([2]);
  });
});

describe("board filters", () => {
  const items = () => [
    input(drafting(), { number: 1 }), // writer, in progress
    input(waitingForEditor(), { number: 2, deadline: endOfDayIn("2026-11-05", "UTC") }), // nobody on Edit, overdue
    input(designDoneVideoInProgress(), { number: 3, deadline: endOfDayIn("2026-11-08", "UTC") }), // designer done, video in progress
    input(sentBackToWriter(), { number: 4, deadline: endOfDayIn("2026-11-30", "UTC") }),
    input(completed(), { number: 5, deadline: endOfDayIn("2026-11-06", "UTC") }),
  ];
  const visible = (filter: BoardFilter, actorId?: string) =>
    board(items(), filter, actorId)
      .columns.flatMap((c) => c.cards.map((card) => card.number))
      .sort((a, b) => a - b);

  it("by person: me, someone else, or nobody yet", () => {
    expect(visible({ person: "me" }, people.writer.id)).toEqual([1, 4, 5]);
    expect(visible({ person: people.video.id })).toEqual([3, 5]);
    // The designer's lane is done but they're still on the current step.
    expect(visible({ person: people.designer.id })).toEqual([3, 5]);
    expect(visible({ person: "unassigned" })).toEqual([2]);
    expect(visible({ person: "u_nobody" })).toEqual([]);
  });

  it("by deadline: overdue, this week, no deadline", () => {
    // NOW is Saturday 7 November; the week runs Monday 2 to Sunday 8.
    expect(visible({ deadline: "overdue" })).toEqual([2]);
    expect(visible({ deadline: "week" })).toEqual([2, 3, 5]);
    expect(visible({ deadline: "none" })).toEqual([1]);
  });

  it("by status", () => {
    expect(visible({ status: "waiting" })).toEqual([2]);
    expect(visible({ status: "inProgress" })).toEqual([1, 3]);
    expect(visible({ status: "sentBack" })).toEqual([4]);
    expect(visible({ status: "completed" })).toEqual([5]);
    expect(visible({ status: "changes" })).toEqual([]);
  });

  it("combines filters and counts what matched", () => {
    const b = board(items(), { person: people.writer.id, deadline: "week" });
    expect(b.matched).toBe(1);
    expect(b.total).toBe(5);
    // Columns stay even when a filter empties them.
    expect(b.columns).toHaveLength(7);
  });
});

describe("default stage on a phone", () => {
  it("opens where the person has something to do, else the first stage with cards", () => {
    const b = board([input(drafting(), { number: 1 }), input(designDoneVideoInProgress(), { number: 2 })]);
    expect(defaultStage(b.columns, people.video.id)).toBe("IN_PRODUCTION");
    // The designer's lane is done, so nothing waits for them.
    expect(defaultStage(b.columns, people.designer.id)).toBe("DRAFTING");
    expect(defaultStage(board([]).columns, people.pm.id)).toBe("DRAFTING");
    expect(defaultStage(board([input(completed())]).columns, people.pm.id)).toBe("COMPLETED");
  });
});
