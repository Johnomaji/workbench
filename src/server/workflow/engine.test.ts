import { describe, expect, it } from "vitest";
import { validateWorkflow } from "./definition";
import { applyCommand, applyScriptSaved, checkEditScript, describeActions, planNewItem } from "./engine";
import {
  candidate,
  DEPT,
  Flow,
  itemAtScriptApproved,
  itemInProduction,
  mediaDef,
  newItem,
  NOW,
  people,
  S,
  task,
  tpl,
} from "./test-helpers";
import type { Command, WorkflowDef } from "./types";

const def = mediaDef();

describe("workflow definition", () => {
  it("the seeded Media workflow is valid", () => {
    expect(validateWorkflow(def)).toEqual([]);
  });

  it("catches broken workflows", () => {
    const broken: WorkflowDef = {
      id: "wf_bad",
      stages: [
        { id: "a", key: "A", name: "Waiting", position: 1, kind: "QUEUE", tasks: [] },
        { id: "b", key: "B", name: "Empty work", position: 2, kind: "WORK", tasks: [] },
        { id: "c", key: "C", name: "Waiting again", position: 3, kind: "QUEUE", tasks: [] },
      ],
    };
    const problems = validateWorkflow(broken);
    expect(problems).toContain("The first stage must be a work stage.");
    expect(problems).toContain("The last stage must be the finished stage.");
    expect(problems).toContain('"Empty work" needs at least one task.');
    expect(problems.some((p) => p.includes("must be followed by a work stage"))).toBe(true);
  });
});

describe("creating an item", () => {
  it("a script writer creates an item and gets the script task", () => {
    const flow = new Flow(newItem(people.writer));
    expect(flow.stage()).toBe(S.DRAFTING);
    expect(flow.statuses()).toEqual({ SCRIPT: "IN_PROGRESS", EDIT: "LOCKED", DESIGN: "LOCKED", VIDEO: "LOCKED", REVIEW: "LOCKED" });
    expect(flow.assignee("SCRIPT")).toBe(people.writer.id);
    expect(flow.assignee("EDIT")).toBeNull();
  });

  it("a project manager can pre-assign every task", () => {
    const flow = new Flow(newItem(people.pm, { SCRIPT: people.writer2, EDIT: people.editor, DESIGN: people.designer }));
    expect(flow.assignee("SCRIPT")).toBe(people.writer2.id);
    expect(flow.status("SCRIPT")).toBe("READY");
    expect(flow.assignee("DESIGN")).toBe(people.designer.id);
    expect(flow.status("DESIGN")).toBe("LOCKED");
  });

  it("notifies the writer (or every writer, if nobody is assigned)", () => {
    const assigned = planNewItem(def, DEPT, people.pm, { [tpl("SCRIPT")]: candidate(people.writer) });
    expect(assigned.ok && assigned.plan.notifications).toEqual([{ templateId: tpl("SCRIPT"), to: { userId: people.writer.id } }]);
    const pool = planNewItem(def, DEPT, people.pm, {});
    expect(pool.ok && pool.plan.notifications).toEqual([{ templateId: tpl("SCRIPT"), to: { roleId: "role:SCRIPT_WRITER" } }]);
  });

  it("only project managers, script writers and admins can create items", () => {
    for (const who of [people.editor, people.designer, people.video, people.outsider, people.formerVideo]) {
      expect(planNewItem(def, DEPT, who, {}).ok).toBe(false);
    }
    for (const who of [people.pm, people.writer, people.admin]) {
      expect(planNewItem(def, DEPT, who, {}).ok).toBe(true);
    }
  });

  it("a writer can't assign other people", () => {
    const result = planNewItem(def, DEPT, people.writer, { [tpl("EDIT")]: candidate(people.editor) });
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("project manager") });
  });

  it("refuses assignees without the right role, or deactivated", () => {
    expect(planNewItem(def, DEPT, people.pm, { [tpl("DESIGN")]: candidate(people.video) }).ok).toBe(false);
    expect(planNewItem(def, DEPT, people.pm, { [tpl("VIDEO")]: candidate(people.formerVideo) }).ok).toBe(false);
  });
});

describe("the standard path", () => {
  it("goes from drafting to completed, notifying each next person", () => {
    const flow = new Flow(
      newItem(people.pm, { SCRIPT: people.writer, EDIT: people.editor, DESIGN: people.designer, VIDEO: people.video, REVIEW: people.pm }),
    );

    // Writer can't submit an empty script.
    expect(flow.try(people.writer, { type: "submit", taskId: task("SCRIPT") })).toMatchObject({ ok: false, reason: expect.stringContaining("Write the script") });

    flow.withScript().do(people.writer, { type: "submit", taskId: task("SCRIPT") });
    expect(flow.stage()).toBe(S.READY_FOR_EDITING);
    expect(flow.item.firstSubmittedAt).toEqual(NOW);
    expect(flow.statuses()).toMatchObject({ SCRIPT: "DONE", EDIT: "READY" });
    expect(flow.notified("TASK_READY").map((n) => n.to)).toEqual([{ userId: people.editor.id }]);
    expect(flow.lastEffects).toContainEqual({ kind: "scriptSnapshot", taskId: task("SCRIPT") });

    // Waiting in the queue: the editor has to start before approving.
    expect(flow.try(people.editor, { type: "submit", taskId: task("EDIT") })).toMatchObject({ ok: false, reason: "Start this task first." });
    flow.do(people.editor, { type: "start", taskId: task("EDIT") });
    expect(flow.stage()).toBe(S.IN_EDITING);

    flow.do(people.editor, { type: "submit", taskId: task("EDIT") });
    expect(flow.stage()).toBe(S.APPROVED_SCRIPT);
    expect(flow.statuses()).toMatchObject({ DESIGN: "READY", VIDEO: "READY" });
    expect(flow.notified("TASK_READY").map((n) => n.to)).toEqual([{ userId: people.designer.id }, { userId: people.video.id }]);

    flow.do(people.designer, { type: "start", taskId: task("DESIGN") });
    expect(flow.stage()).toBe(S.IN_PRODUCTION);
    flow.do(people.video, { type: "start", taskId: task("VIDEO") });
    flow.do(people.designer, { type: "submit", taskId: task("DESIGN") });
    flow.do(people.video, { type: "submit", taskId: task("VIDEO") });
    expect(flow.stage()).toBe(S.READY_FOR_REVIEW);
    expect(flow.status("REVIEW")).toBe("READY");

    flow.do(people.pm, { type: "submit", taskId: task("REVIEW") });
    expect(flow.stage()).toBe(S.COMPLETED);
    expect(flow.item.completedAt).toEqual(NOW);
  });

  it("doesn't change the input state (pure)", () => {
    const flow = new Flow(newItem(people.writer)).withScript();
    const before = structuredClone(flow.item);
    applyCommand(def, flow.item, people.writer, { type: "submit", taskId: task("SCRIPT") }, NOW);
    expect(flow.item).toEqual(before);
  });

  it("any editor can pick up an unassigned edit task by starting it", () => {
    const flow = new Flow(newItem(people.writer)).withScript().do(people.writer, { type: "submit", taskId: task("SCRIPT") });
    expect(flow.notified("TASK_READY").map((n) => n.to)).toEqual([{ roleId: "role:CONTENT_EDITOR" }]);
    expect(flow.try(people.designer, { type: "start", taskId: task("EDIT") }).ok).toBe(false);
    flow.do(people.editor2, { type: "start", taskId: task("EDIT") });
    expect(flow.assignee("EDIT")).toBe(people.editor2.id);
    expect(flow.lastEffects).toContainEqual({ kind: "assignment", taskId: task("EDIT"), fromUserId: null, toUserId: people.editor2.id, note: null });
  });

  it("an unassigned task can be done by anyone with the role, who then owns it", () => {
    const flow = new Flow(newItem(people.writer)); // only the script is assigned
    flow.withScript().do(people.writer, { type: "submit", taskId: task("SCRIPT") });
    flow.do(people.editor, { type: "start", taskId: task("EDIT") }).do(people.editor, { type: "submit", taskId: task("EDIT") });
    flow.do(people.designer, { type: "start", taskId: task("DESIGN") });
    flow.do(people.video, { type: "submit", taskId: task("VIDEO") }); // never started, never assigned
    expect(flow.assignee("VIDEO")).toBe(people.video.id);
    flow.do(people.designer, { type: "submit", taskId: task("DESIGN") });

    // Final review is unassigned: a writer can't approve it, a project manager can in one click.
    expect(flow.try(people.writer, { type: "submit", taskId: task("REVIEW") })).toMatchObject({ ok: false, reason: expect.stringContaining("project manager") });
    flow.do(people.pm, { type: "submit", taskId: task("REVIEW") });
    expect(flow.stage()).toBe(S.COMPLETED);
    expect(flow.assignee("REVIEW")).toBe(people.pm.id);
  });

  it("work stages can be submitted without pressing start", () => {
    const flow = itemAtScriptApproved()
      .do(people.designer, { type: "start", taskId: task("DESIGN") })
      .do(people.video, { type: "submit", taskId: task("VIDEO") }); // READY -> DONE directly
    expect(flow.status("VIDEO")).toBe("DONE");
  });
});

describe("parallel design and video", () => {
  it("waits for both: design first", () => {
    const flow = itemAtScriptApproved()
      .do(people.designer, { type: "start", taskId: task("DESIGN") })
      .do(people.designer, { type: "submit", taskId: task("DESIGN") });
    expect(flow.stage()).toBe(S.IN_PRODUCTION);
    expect(flow.status("REVIEW")).toBe("LOCKED");
    flow.do(people.video, { type: "submit", taskId: task("VIDEO") });
    expect(flow.stage()).toBe(S.READY_FOR_REVIEW);
  });

  it("waits for both: video first", () => {
    const flow = itemAtScriptApproved()
      .do(people.video, { type: "start", taskId: task("VIDEO") })
      .do(people.video, { type: "submit", taskId: task("VIDEO") });
    expect(flow.stage()).toBe(S.IN_PRODUCTION);
    flow.do(people.designer, { type: "submit", taskId: task("DESIGN") });
    expect(flow.stage()).toBe(S.READY_FOR_REVIEW);
  });

  it("each lane is independent: one person can't finish the other's task", () => {
    const flow = itemAtScriptApproved().do(people.designer, { type: "start", taskId: task("DESIGN") });
    expect(flow.try(people.designer, { type: "submit", taskId: task("VIDEO") }).ok).toBe(false);
    expect(flow.try(people.video, { type: "submit", taskId: task("DESIGN") }).ok).toBe(false);
  });

  it("a finished lane can be reopened while the other is still going", () => {
    const flow = itemAtScriptApproved()
      .do(people.designer, { type: "start", taskId: task("DESIGN") })
      .do(people.designer, { type: "submit", taskId: task("DESIGN") })
      .do(people.designer, { type: "reopen", taskId: task("DESIGN") });
    expect(flow.status("DESIGN")).toBe("IN_PROGRESS");
    flow.do(people.video, { type: "submit", taskId: task("VIDEO") });
    expect(flow.stage()).toBe(S.IN_PRODUCTION); // still waiting for design
  });

  it("send-back from design keeps the video lane exactly as it was", () => {
    const flow = itemAtScriptApproved()
      .do(people.designer, { type: "start", taskId: task("DESIGN") })
      .do(people.video, { type: "start", taskId: task("VIDEO") })
      .do(people.designer, { type: "sendBack", fromTaskId: task("DESIGN"), comment: "Scene 2 contradicts the brief." });

    expect(flow.stage()).toBe(S.IN_EDITING);
    expect(flow.statuses()).toMatchObject({ EDIT: "SENT_BACK", DESIGN: "LOCKED", VIDEO: "IN_PROGRESS" });
    expect(flow.assignee("VIDEO")).toBe(people.video.id);
    expect(flow.notified("SENT_BACK").map((n) => n.to)).toEqual([{ userId: people.editor.id }]);
    expect(flow.notified("ON_HOLD").map((n) => n.to)).toEqual([{ userId: people.video.id }]);
    expect(flow.lastEffects).toContainEqual({ kind: "comment", commentKind: "SEND_BACK", taskId: task("EDIT"), body: "Scene 2 contradicts the brief." });

    // The video editor can't finish while the script is being fixed.
    expect(flow.try(people.video, { type: "submit", taskId: task("VIDEO") })).toMatchObject({ ok: false, reason: expect.stringContaining("back at Editing") });

    // Editor fixes and re-approves: the queue is skipped because video already started.
    flow.do(people.editor, { type: "submit", taskId: task("EDIT") });
    expect(flow.stage()).toBe(S.IN_PRODUCTION);
    expect(flow.statuses()).toMatchObject({ DESIGN: "READY", VIDEO: "IN_PROGRESS" });
    expect(flow.notified("TASK_READY").map((n) => n.to)).toEqual([{ userId: people.designer.id }]);
    expect(flow.notified("RESUMED").map((n) => n.to)).toEqual([{ userId: people.video.id }]);

    // Review only once both are done.
    flow.do(people.video, { type: "submit", taskId: task("VIDEO") });
    expect(flow.stage()).toBe(S.IN_PRODUCTION);
    flow.do(people.designer, { type: "submit", taskId: task("DESIGN") });
    expect(flow.stage()).toBe(S.READY_FOR_REVIEW);
  });

  it("send-back from design keeps a finished video lane finished", () => {
    const flow = itemInProduction()
      .do(people.video, { type: "submit", taskId: task("VIDEO") })
      .do(people.designer, { type: "sendBack", fromTaskId: task("DESIGN"), comment: "Logo missing from brief." });
    expect(flow.statuses()).toMatchObject({ EDIT: "SENT_BACK", DESIGN: "LOCKED", VIDEO: "DONE" });

    flow.do(people.editor, { type: "submit", taskId: task("EDIT") });
    expect(flow.stage()).toBe(S.IN_PRODUCTION);
    expect(flow.status("VIDEO")).toBe("DONE");
    flow.do(people.designer, { type: "submit", taskId: task("DESIGN") });
    expect(flow.stage()).toBe(S.READY_FOR_REVIEW);
  });

  it("send-back before either lane started returns to the waiting stage", () => {
    const flow = itemAtScriptApproved().do(people.designer, {
      type: "sendBack",
      fromTaskId: task("DESIGN"),
      comment: "Needs a call to action.",
    });
    expect(flow.statuses()).toMatchObject({ DESIGN: "LOCKED", VIDEO: "LOCKED", EDIT: "SENT_BACK" });
    flow.do(people.editor, { type: "submit", taskId: task("EDIT") });
    expect(flow.stage()).toBe(S.APPROVED_SCRIPT);
    expect(flow.statuses()).toMatchObject({ DESIGN: "READY", VIDEO: "READY" });
  });

  it("the PM can send back only the design; the finished video stays finished", () => {
    const flow = itemInProduction()
      .do(people.designer, { type: "submit", taskId: task("DESIGN") })
      .do(people.video, { type: "submit", taskId: task("VIDEO") });
    expect(flow.stage()).toBe(S.READY_FOR_REVIEW);

    // Must say which lane.
    expect(flow.try(people.pm, { type: "sendBack", fromTaskId: task("REVIEW"), comment: "Colours are off." })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("design or video"),
    });

    flow.do(people.pm, { type: "sendBack", fromTaskId: task("REVIEW"), comment: "Colours are off.", targetTemplateIds: [tpl("DESIGN")] });
    expect(flow.stage()).toBe(S.IN_PRODUCTION);
    expect(flow.statuses()).toMatchObject({ DESIGN: "SENT_BACK", VIDEO: "DONE", REVIEW: "LOCKED" });
    expect(flow.notified("SENT_BACK").map((n) => n.to)).toEqual([{ userId: people.designer.id }]);
    expect(flow.notified("ON_HOLD")).toEqual([]); // the PM sent it; nobody else was mid-way

    flow.do(people.designer, { type: "submit", taskId: task("DESIGN") });
    expect(flow.stage()).toBe(S.READY_FOR_REVIEW);
    expect(flow.statuses()).toMatchObject({ VIDEO: "DONE", REVIEW: "READY" });
  });

  it("the PM can send back both lanes at once", () => {
    const flow = itemInProduction()
      .do(people.designer, { type: "submit", taskId: task("DESIGN") })
      .do(people.video, { type: "submit", taskId: task("VIDEO") })
      .do(people.pm, {
        type: "sendBack",
        fromTaskId: task("REVIEW"),
        comment: "Both need the new tagline.",
        targetTemplateIds: [tpl("DESIGN"), tpl("VIDEO")],
      });
    expect(flow.statuses()).toMatchObject({ DESIGN: "SENT_BACK", VIDEO: "SENT_BACK" });
    expect(flow.lastEffects).toContainEqual(expect.objectContaining({ kind: "comment", taskId: null }));
  });

  it("refuses lanes that aren't in the target stage", () => {
    const flow = itemInProduction()
      .do(people.designer, { type: "submit", taskId: task("DESIGN") })
      .do(people.video, { type: "submit", taskId: task("VIDEO") });
    const result = flow.try(people.pm, { type: "sendBack", fromTaskId: task("REVIEW"), comment: "x", targetTemplateIds: [tpl("EDIT")] });
    expect(result.ok).toBe(false);
  });
});

describe("sending back", () => {
  it("needs a reason", () => {
    const flow = new Flow(newItem(people.writer)).withScript().do(people.writer, { type: "submit", taskId: task("SCRIPT") });
    flow.do(people.editor, { type: "start", taskId: task("EDIT") });
    expect(flow.try(people.editor, { type: "sendBack", fromTaskId: task("EDIT"), comment: "   " })).toMatchObject({ ok: false });
  });

  it("goes to the previous work stage, skipping waiting stages", () => {
    const flow = new Flow(newItem(people.writer))
      .withScript()
      .do(people.writer, { type: "submit", taskId: task("SCRIPT") })
      .do(people.editor, { type: "start", taskId: task("EDIT") })
      .do(people.editor, { type: "sendBack", fromTaskId: task("EDIT"), comment: "Too long." });
    expect(flow.stage()).toBe(S.DRAFTING);
    expect(flow.statuses()).toMatchObject({ SCRIPT: "SENT_BACK", EDIT: "LOCKED" });
    expect(flow.assignee("EDIT")).toBe(people.editor.id); // still theirs when it comes back
    expect(flow.notified("SENT_BACK").map((n) => n.to)).toEqual([{ userId: people.writer.id }]);

    // Writer resubmits: it waits for the editor again.
    flow.do(people.writer, { type: "submit", taskId: task("SCRIPT") });
    expect(flow.stage()).toBe(S.READY_FOR_EDITING);
    expect(flow.status("EDIT")).toBe("READY");
    expect(flow.notified("TASK_READY").map((n) => n.to)).toEqual([{ userId: people.editor.id }]);
  });

  it("an editor can send back from the waiting stage without starting", () => {
    const flow = new Flow(newItem(people.writer)).withScript().do(people.writer, { type: "submit", taskId: task("SCRIPT") });
    flow.do(people.editor, { type: "pickUp", taskId: task("EDIT") });
    flow.do(people.editor, { type: "sendBack", fromTaskId: task("EDIT"), comment: "Wrong brief attached." });
    expect(flow.stage()).toBe(S.DRAFTING);
  });

  it("can't go back from the first stage", () => {
    const flow = new Flow(newItem(people.writer));
    expect(flow.try(people.pm, { type: "sendBack", fromTaskId: null, comment: "x" })).toMatchObject({ ok: false, reason: expect.stringContaining("first step") });
  });

  it("only the person on the task, or a manager, can send it back", () => {
    const flow = itemAtScriptApproved().do(people.designer, { type: "start", taskId: task("DESIGN") });
    for (const who of [people.designer2, people.video, people.editor, people.writer]) {
      expect(flow.try(who, { type: "sendBack", fromTaskId: task("DESIGN"), comment: "x" }).ok).toBe(false);
    }
    expect(flow.try(people.writer, { type: "sendBack", fromTaskId: null, comment: "x" }).ok).toBe(false);
    expect(flow.try(people.pm, { type: "sendBack", fromTaskId: null, comment: "PM says redo" }).ok).toBe(true);
  });

  it("only managers can send back more than one step", () => {
    const flow = itemAtScriptApproved().do(people.designer, { type: "start", taskId: task("DESIGN") });
    const tooFar: Command = { type: "sendBack", fromTaskId: task("DESIGN"), comment: "x", targetStageId: S.DRAFTING };
    expect(flow.try(people.designer, tooFar)).toMatchObject({ ok: false, reason: expect.stringContaining("more than one step") });
    expect(flow.try(people.pm, { ...tooFar, targetStageId: S.APPROVED_SCRIPT })).toMatchObject({ ok: false }); // not a work stage
    expect(flow.try(people.pm, { ...tooFar, targetStageId: S.READY_FOR_REVIEW })).toMatchObject({ ok: false }); // not earlier
  });

  it("a manager's long jump back reopens everything after the target, keeping assignees", () => {
    const flow = itemInProduction()
      .do(people.designer, { type: "submit", taskId: task("DESIGN") })
      .do(people.video, { type: "start", taskId: task("VIDEO") })
      .do(people.pm, { type: "sendBack", fromTaskId: null, comment: "The client changed the concept.", targetStageId: S.DRAFTING });

    expect(flow.stage()).toBe(S.DRAFTING);
    expect(flow.statuses()).toEqual({ SCRIPT: "SENT_BACK", EDIT: "LOCKED", DESIGN: "LOCKED", VIDEO: "LOCKED", REVIEW: "LOCKED" });
    expect(flow.assignee("DESIGN")).toBe(people.designer.id);
    expect(flow.notified("ON_HOLD").map((n) => n.to)).toEqual([
      { userId: people.editor.id },
      { userId: people.designer.id },
      { userId: people.video.id },
    ]);

    // Everyone has to go again, in order.
    flow
      .do(people.writer, { type: "submit", taskId: task("SCRIPT") })
      .do(people.editor, { type: "start", taskId: task("EDIT") })
      .do(people.editor, { type: "submit", taskId: task("EDIT") });
    expect(flow.stage()).toBe(S.APPROVED_SCRIPT);
  });

  it("a finished lane must be reopened before it can send back", () => {
    const flow = itemInProduction().do(people.designer, { type: "submit", taskId: task("DESIGN") });
    expect(flow.try(people.designer, { type: "sendBack", fromTaskId: task("DESIGN"), comment: "x" })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("Reopen"),
    });
  });
});

describe("reassigning", () => {
  it("mid-task keeps the status and records the handover", () => {
    const flow = itemAtScriptApproved().do(people.video, { type: "start", taskId: task("VIDEO") });
    flow.do(people.pm, { type: "assign", taskId: task("VIDEO"), to: candidate(people.video2), note: "Drew is off sick." });

    expect(flow.status("VIDEO")).toBe("IN_PROGRESS");
    expect(flow.assignee("VIDEO")).toBe(people.video2.id);
    expect(flow.lastEffects).toContainEqual({
      kind: "assignment",
      taskId: task("VIDEO"),
      fromUserId: people.video.id,
      toUserId: people.video2.id,
      note: "Drew is off sick.",
    });
    expect(flow.notified("REASSIGNED_TO_YOU").map((n) => n.to)).toEqual([{ userId: people.video2.id }]);
    expect(flow.notified("REASSIGNED_AWAY").map((n) => n.to)).toEqual([{ userId: people.video.id }]);

    // The old assignee loses the task; the new one carries on.
    expect(flow.try(people.video, { type: "submit", taskId: task("VIDEO") }).ok).toBe(false);
    flow.do(people.video2, { type: "submit", taskId: task("VIDEO") });
    expect(flow.status("VIDEO")).toBe("DONE");
  });

  it("the person on a task can hand it to a colleague with the same role", () => {
    const flow = itemAtScriptApproved();
    flow.do(people.designer, { type: "assign", taskId: task("DESIGN"), to: candidate(people.designer2), note: null });
    expect(flow.assignee("DESIGN")).toBe(people.designer2.id);
    expect(flow.notified("REASSIGNED_AWAY")).toEqual([]); // they did it themselves
  });

  it("refuses the wrong role, deactivated people, and outsiders", () => {
    const flow = itemAtScriptApproved();
    expect(flow.try(people.pm, { type: "assign", taskId: task("DESIGN"), to: candidate(people.video), note: null }).ok).toBe(false);
    expect(flow.try(people.pm, { type: "assign", taskId: task("VIDEO"), to: candidate(people.formerVideo), note: null }).ok).toBe(false);
    expect(flow.try(people.pm, { type: "assign", taskId: task("DESIGN"), to: candidate(people.designer), note: null }).ok).toBe(false); // already theirs
  });

  it("only a manager or the current assignee can reassign", () => {
    const flow = itemAtScriptApproved();
    for (const who of [people.designer2, people.video, people.writer, people.outsider]) {
      expect(flow.try(who, { type: "assign", taskId: task("DESIGN"), to: candidate(people.designer2), note: null }).ok).toBe(false);
    }
  });

  it("finished tasks can't be reassigned, future ones can", () => {
    const flow = itemAtScriptApproved();
    expect(flow.try(people.pm, { type: "assign", taskId: task("SCRIPT"), to: candidate(people.writer2), note: null }).ok).toBe(false);
    expect(flow.try(people.pm, { type: "assign", taskId: task("REVIEW"), to: candidate(people.admin), note: null }).ok).toBe(false); // admin isn't a PM
  });

  it("anyone with the role can pick up an unassigned task", () => {
    const flow = new Flow(newItem(people.writer));
    expect(flow.try(people.video, { type: "pickUp", taskId: task("EDIT") }).ok).toBe(false);
    flow.do(people.editor, { type: "pickUp", taskId: task("EDIT") });
    expect(flow.assignee("EDIT")).toBe(people.editor.id);
    expect(flow.status("EDIT")).toBe("LOCKED"); // picked up early; starts when it's their turn
    expect(flow.try(people.editor2, { type: "pickUp", taskId: task("EDIT") }).ok).toBe(false);
  });
});

describe("requesting changes", () => {
  it("flags the task and tells the person on it, without moving the item", () => {
    const flow = itemAtScriptApproved().do(people.designer, { type: "start", taskId: task("DESIGN") });
    flow.do(people.video, { type: "requestChanges", taskId: task("DESIGN"), comment: "Use the 9:16 frame." });
    expect(flow.stage()).toBe(S.IN_PRODUCTION);
    expect(flow.item.tasks.find((t) => t.id === task("DESIGN"))!.changesRequested).toBe(true);
    expect(flow.notified("CHANGES_REQUESTED").map((n) => n.to)).toEqual([{ userId: people.designer.id }]);

    // Submitting answers it.
    flow.do(people.designer, { type: "submit", taskId: task("DESIGN") });
    expect(flow.item.tasks.find((t) => t.id === task("DESIGN"))!.changesRequested).toBe(false);
    expect(flow.lastEffects).toContainEqual({ kind: "resolveChangeRequests", taskId: task("DESIGN") });
  });

  it("isn't possible on finished or not-yet-started tasks, or from outside the department", () => {
    const flow = itemAtScriptApproved();
    expect(flow.try(people.pm, { type: "requestChanges", taskId: task("SCRIPT"), comment: "x" })).toMatchObject({ ok: false, reason: expect.stringContaining("send it back") });
    expect(flow.try(people.pm, { type: "requestChanges", taskId: task("REVIEW"), comment: "x" }).ok).toBe(false);
    expect(flow.try(people.outsider, { type: "requestChanges", taskId: task("DESIGN"), comment: "x" }).ok).toBe(false);
    expect(flow.try(people.pm, { type: "requestChanges", taskId: task("DESIGN"), comment: " " }).ok).toBe(false);
  });
});

describe("script editing", () => {
  it("is open to the writer while drafting, then the editor while editing", () => {
    const flow = new Flow(newItem(people.pm, { SCRIPT: people.writer, EDIT: people.editor }));
    expect(checkEditScript(def, flow.item, people.writer).ok).toBe(true);
    expect(checkEditScript(def, flow.item, people.editor).ok).toBe(false);
    expect(checkEditScript(def, flow.item, people.pm).ok).toBe(true);

    flow.withScript().do(people.writer, { type: "submit", taskId: task("SCRIPT") });
    expect(checkEditScript(def, flow.item, people.writer).ok).toBe(false);
    expect(checkEditScript(def, flow.item, people.editor)).toMatchObject({ ok: false, reason: expect.stringContaining("Start") });

    flow.do(people.editor, { type: "start", taskId: task("EDIT") });
    expect(checkEditScript(def, flow.item, people.editor)).toEqual({ ok: true, taskId: task("EDIT") });
  });

  it("is locked for everyone once the script is approved", () => {
    const flow = itemAtScriptApproved();
    for (const who of Object.values(people)) {
      expect(checkEditScript(def, flow.item, who).ok).toBe(false);
    }
  });

  it("saving counts as starting the task", () => {
    const flow = new Flow(newItem(people.pm, { SCRIPT: people.writer }));
    expect(flow.status("SCRIPT")).toBe("READY");
    const result = applyScriptSaved(def, flow.item, people.writer, 1);
    expect(result.ok && result.item.tasks.find((t) => t.id === task("SCRIPT"))!.status).toBe("IN_PROGRESS");
    expect(result.ok && result.item.latestScriptVersion).toBe(1);
  });
});

describe("archived and completed items", () => {
  it("refuse every change", () => {
    const flow = itemAtScriptApproved();
    const archived = { ...flow.item, archivedAt: NOW };
    expect(applyCommand(def, archived, people.designer, { type: "start", taskId: task("DESIGN") }).ok).toBe(false);
    expect(checkEditScript(def, archived, people.pm).ok).toBe(false);

    const done = itemInProduction()
      .do(people.designer, { type: "submit", taskId: task("DESIGN") })
      .do(people.video, { type: "submit", taskId: task("VIDEO") })
      .do(people.pm, { type: "submit", taskId: task("REVIEW") });
    expect(done.try(people.pm, { type: "sendBack", fromTaskId: null, comment: "x" }).ok).toBe(false);
    expect(done.try(people.pm, { type: "reopen", taskId: task("REVIEW") }).ok).toBe(false);
  });
});

describe("who can do what (at 'Design & video', both lanes started)", () => {
  const flow = itemAtScriptApproved()
    .do(people.designer, { type: "start", taskId: task("DESIGN") })
    .do(people.video, { type: "start", taskId: task("VIDEO") });

  const cases: Array<[string, keyof typeof people, Command, boolean]> = [
    ["designer submits design", "designer", { type: "submit", taskId: task("DESIGN") }, true],
    ["other designer submits design", "designer2", { type: "submit", taskId: task("DESIGN") }, false],
    ["video editor submits design", "video", { type: "submit", taskId: task("DESIGN") }, false],
    ["PM submits design on their behalf", "pm", { type: "submit", taskId: task("DESIGN") }, true],
    ["admin submits design on their behalf", "admin", { type: "submit", taskId: task("DESIGN") }, true],
    ["PM from another department", "outsider", { type: "submit", taskId: task("DESIGN") }, false],
    ["deactivated video editor", "formerVideo", { type: "submit", taskId: task("VIDEO") }, false],
    ["writer submits the finished script again", "writer", { type: "submit", taskId: task("SCRIPT") }, false],
    ["PM approves review too early", "pm", { type: "submit", taskId: task("REVIEW") }, false],
    ["editor starts edit again", "editor", { type: "start", taskId: task("EDIT") }, false],
    ["designer sends back", "designer", { type: "sendBack", fromTaskId: task("DESIGN"), comment: "x" }, true],
    ["writer sends back someone else's task", "writer", { type: "sendBack", fromTaskId: task("DESIGN"), comment: "x" }, false],
    ["editor requests changes on design", "editor", { type: "requestChanges", taskId: task("DESIGN"), comment: "x" }, true],
    ["designer reassigns own task", "designer", { type: "assign", taskId: task("DESIGN"), to: candidate(people.designer2), note: null }, true],
    ["video editor reassigns design", "video", { type: "assign", taskId: task("DESIGN"), to: candidate(people.designer2), note: null }, false],
  ];

  it.each(cases)("%s", (_name, who, command, allowed) => {
    expect(applyCommand(def, flow.item, people[who], command, NOW).ok).toBe(allowed);
  });
});

describe("describeActions (what buttons to show)", () => {
  it("shows the designer their own options only", () => {
    const flow = itemAtScriptApproved().do(people.designer, { type: "start", taskId: task("DESIGN") });
    const actions = describeActions(def, flow.item, people.designer);
    expect(actions.tasks[task("DESIGN")]).toMatchObject({ submit: true, start: false, sendBack: true, reassign: true });
    // Anyone in the department may flag changes on someone else's in-progress work.
    expect(actions.tasks[task("VIDEO")]).toMatchObject({ submit: false, start: false, sendBack: false, reassign: false, requestChanges: true });
    expect(actions.editScript.ok).toBe(false);
    expect(actions.sendBack).toMatchObject({ defaultStageId: S.IN_EDITING, laneTemplateIds: [], managerStageIds: [] });
  });

  it("gives the PM lane choices and longer jumps at final review", () => {
    const flow = itemInProduction()
      .do(people.designer, { type: "submit", taskId: task("DESIGN") })
      .do(people.video, { type: "submit", taskId: task("VIDEO") });
    const actions = describeActions(def, flow.item, people.pm);
    expect(actions.tasks[task("REVIEW")]).toMatchObject({ submit: true, sendBack: true });
    expect(actions.sendBack).toMatchObject({
      defaultStageId: S.IN_PRODUCTION,
      laneTemplateIds: [tpl("DESIGN"), tpl("VIDEO")],
      managerStageIds: [S.DRAFTING, S.IN_EDITING],
    });
  });

  it("offers 'pick up' to anyone with the role when a task is unassigned", () => {
    const flow = new Flow(newItem(people.writer)).withScript().do(people.writer, { type: "submit", taskId: task("SCRIPT") });
    expect(describeActions(def, flow.item, people.editor2).tasks[task("EDIT")]).toMatchObject({ pickUp: true, start: true });
    expect(describeActions(def, flow.item, people.designer).tasks[task("EDIT")]).toMatchObject({ pickUp: false, start: false });
  });
});
