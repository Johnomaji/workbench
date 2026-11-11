/**
 * The workflow state machine. Pure functions over plain data:
 *   (workflow definition, item state, actor, command) -> new state + effects
 *
 * The service layer loads state under a row lock, calls these, and persists
 * the result and effects (audit, comments, notifications, script snapshots)
 * in the same transaction.
 *
 * Invariants:
 * - An item is in exactly one stage. Parallel work is several tasks in one stage.
 * - A task is "active" when the item is at its work stage, or the queue right before it.
 * - READY means "reached, not started" and only occurs on active tasks.
 * - IN_PROGRESS / DONE / SENT_BACK may survive on inactive tasks: that's a lane
 *   put on hold by a send-back, preserved untouched until the item returns.
 */
import {
  canCreateItem,
  canManageDepartmentItems,
  isDepartmentMember,
  type Actor,
  type PolicyResult,
} from "@/server/permissions/policy";
import { WorkflowIndex } from "./definition";
import type {
  AuditData,
  CandidateUser,
  Command,
  Effect,
  EngineResult,
  ItemAuditAction,
  ItemState,
  NotificationKind,
  Recipient,
  TaskState,
  TaskStatus,
  TaskTemplateDef,
  WorkflowDef,
} from "./types";

const allow: PolicyResult = { ok: true };
const deny = (reason: string): PolicyResult => ({ ok: false, reason });

/** Statuses that mean someone has already worked on the task in this pass. */
const STARTED: ReadonlySet<TaskStatus> = new Set(["IN_PROGRESS", "DONE", "SENT_BACK"]);

type Ctx = {
  ix: WorkflowIndex;
  item: ItemState;
  actor: Actor;
  isManager: boolean;
  now: Date;
  effects: Effect[];
};

function makeCtx(def: WorkflowDef, item: ItemState, actor: Actor, now: Date): Ctx {
  return {
    ix: new WorkflowIndex(def),
    // Work on a copy; callers keep their original.
    item: { ...item, tasks: item.tasks.map((t) => ({ ...t })) },
    actor,
    isManager: canManageDepartmentItems(actor, item.departmentId),
    now,
    effects: [],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function hasRole(actor: Actor, roleId: string): boolean {
  return actor.isActive && actor.memberships.some((m) => m.roleId === roleId);
}

function templateOf(c: Ctx, task: TaskState): TaskTemplateDef {
  return c.ix.template(task.templateId);
}

function currentIndex(c: Ctx): number {
  return c.ix.indexOf(c.item.stageId);
}

function tasksOfStage(c: Ctx, stageIndex: number): TaskState[] {
  const ids = new Set(c.ix.stages[stageIndex].tasks.map((t) => t.id));
  return c.item.tasks
    .filter((t) => ids.has(t.templateId))
    .sort((a, b) => c.ix.template(a.templateId).position - c.ix.template(b.templateId).position);
}

export function isTaskActive(ix: WorkflowIndex, item: ItemState, task: TaskState): boolean {
  if (item.completedAt) return false;
  return ix.currentWorkIndex(ix.indexOf(item.stageId)) === ix.templateStageIndex(task.templateId);
}

function active(c: Ctx, task: TaskState): boolean {
  return isTaskActive(c.ix, c.item, task);
}

function recipientOf(c: Ctx, task: TaskState): Recipient {
  return task.assigneeId ? { userId: task.assigneeId } : { roleId: templateOf(c, task).roleId };
}

function notify(c: Ctx, type: NotificationKind, task: TaskState, to: Recipient = recipientOf(c, task)) {
  if ("userId" in to && to.userId === c.actor.id) return; // never notify yourself
  c.effects.push({ kind: "notify", type, taskId: task.id, to });
}

function audit(c: Ctx, action: ItemAuditAction, data: AuditData, task?: TaskState) {
  c.effects.push({
    kind: "audit",
    action,
    taskId: task?.id,
    data: task ? { task: templateOf(c, task).name, ...data } : data,
  });
}

function assign(c: Ctx, task: TaskState, userId: string, note: string | null) {
  c.effects.push({ kind: "assignment", taskId: task.id, fromUserId: task.assigneeId, toUserId: userId, note });
  task.assigneeId = userId;
}

function checkOpen(c: Ctx): PolicyResult {
  if (c.item.archivedAt) return deny("This item is archived. Restore it before making changes.");
  if (c.item.completedAt) return deny("This item is already completed.");
  return allow;
}

function findTask(c: Ctx, taskId: string): TaskState | null {
  return c.item.tasks.find((t) => t.id === taskId) ?? null;
}

function notYourTurn(c: Ctx, task: TaskState): string {
  const stage = c.ix.stages[c.ix.templateStageIndex(task.templateId)];
  if (task.status === "LOCKED") return `This task isn't ready yet. It starts when the item reaches ${stage.name}.`;
  return `This item is back at ${c.ix.stage(c.item.stageId).name}. Your task carries on when it returns.`;
}

/** Moves the item forward from stage index `start`, skipping stages that need nothing. */
function advance(c: Ctx, start: number) {
  const from = c.ix.stage(c.item.stageId).name;
  const woken = new Set<string>();

  const wake = (task: TaskState) => {
    if (woken.has(task.id)) return;
    woken.add(task.id);
    if (task.status === "LOCKED") {
      task.status = "READY";
      notify(c, "TASK_READY", task);
    } else if (task.status === "READY") {
      notify(c, "TASK_READY", task);
    } else {
      // A lane that was on hold (in progress, done, or sent back) picks up where it left off.
      notify(c, "RESUMED", task);
    }
  };

  let i = start;
  for (;;) {
    const stage = c.ix.stages[i];
    if (stage.kind === "DONE") {
      c.item.stageId = stage.id;
      c.item.completedAt = c.now;
      break;
    }
    const workIndex = stage.kind === "QUEUE" ? i + 1 : i;
    const tasks = tasksOfStage(c, workIndex);
    tasks.forEach(wake);

    if (stage.kind === "QUEUE") {
      // Someone already worked on the next stage (we're returning after a send-back):
      // don't make them press Start again.
      if (tasks.some((t) => STARTED.has(t.status))) {
        i += 1;
        continue;
      }
      c.item.stageId = stage.id;
      break;
    }
    if (tasks.every((t) => t.status === "DONE")) {
      i += 1;
      continue;
    }
    c.item.stageId = stage.id;
    break;
  }

  audit(c, "item.stage_changed", { from, to: c.ix.stage(c.item.stageId).name, completed: Boolean(c.item.completedAt) });
}

// ── Checks (shared by apply and by the UI's list of available actions) ──

function checkStart(c: Ctx, task: TaskState): PolicyResult {
  const open = checkOpen(c);
  if (!open.ok) return open;
  if (task.status === "DONE") return deny("This task is already done.");
  if (!active(c, task)) return deny(notYourTurn(c, task));
  if (task.status !== "READY") return deny("This task has already been started.");
  const template = templateOf(c, task);
  if (task.assigneeId) {
    if (task.assigneeId === c.actor.id || c.isManager) return allow;
    return deny("This task is assigned to someone else.");
  }
  if (hasRole(c.actor, template.roleId)) return allow;
  return deny(`Only a ${template.roleName.toLowerCase()} can start this task.`);
}

function checkSubmit(c: Ctx, task: TaskState): PolicyResult {
  const open = checkOpen(c);
  if (!open.ok) return open;
  if (task.status === "DONE") return deny("This task is already done.");
  const template = templateOf(c, task);
  const stageIndex = c.ix.templateStageIndex(task.templateId);
  const cur = currentIndex(c);
  if (c.ix.stages[cur].kind === "QUEUE" && cur + 1 === stageIndex) return deny("Start this task first.");
  if (cur !== stageIndex) return deny(notYourTurn(c, task));
  if (!task.assigneeId) {
    // Unassigned: anyone with the role can just do it (they become the assignee); managers can act on behalf.
    if (!hasRole(c.actor, template.roleId) && !c.isManager) {
      return deny(`Only a ${template.roleName.toLowerCase()} can do this task.`);
    }
  } else if (task.assigneeId !== c.actor.id && !c.isManager) {
    return deny("This task is assigned to someone else.");
  }
  if (template.canEditScript && c.item.latestScriptVersion === 0) {
    return deny("Write the script before sending it on.");
  }
  return allow;
}

function checkReopen(c: Ctx, task: TaskState): PolicyResult {
  const open = checkOpen(c);
  if (!open.ok) return open;
  if (task.status !== "DONE") return deny("Only finished tasks can be reopened.");
  if (currentIndex(c) !== c.ix.templateStageIndex(task.templateId)) {
    return deny(`This can't be reopened now: the item is at ${c.ix.stage(c.item.stageId).name}.`);
  }
  if (task.assigneeId !== c.actor.id && !c.isManager) return deny("This task is assigned to someone else.");
  return allow;
}

function checkPickUp(c: Ctx, task: TaskState): PolicyResult {
  const open = checkOpen(c);
  if (!open.ok) return open;
  if (task.assigneeId) return deny("Someone is already on this task.");
  if (task.status === "DONE") return deny("This task is already done.");
  const template = templateOf(c, task);
  if (!hasRole(c.actor, template.roleId)) return deny(`Only a ${template.roleName.toLowerCase()} can pick this up.`);
  return allow;
}

function checkReassign(c: Ctx, task: TaskState, to?: CandidateUser): PolicyResult {
  const open = checkOpen(c);
  if (!open.ok) return open;
  if (task.status === "DONE") return deny("Finished tasks can't be reassigned.");
  if (!c.isManager && task.assigneeId !== c.actor.id) {
    return deny("Only a project manager or the person on this task can reassign it.");
  }
  if (!to) return allow;
  const template = templateOf(c, task);
  if (to.id === task.assigneeId) return deny("They're already on this task.");
  if (!to.isActive) return deny("That person's account is deactivated.");
  if (!to.roleIds.includes(template.roleId)) {
    return deny(`That person can't take this task: it needs a ${template.roleName.toLowerCase()}.`);
  }
  return allow;
}

function checkRequestChanges(c: Ctx, task: TaskState, comment: string): PolicyResult {
  const open = checkOpen(c);
  if (!open.ok) return open;
  if (!isDepartmentMember(c.actor, c.item.departmentId)) return deny("You're not part of this department.");
  if (task.status === "LOCKED") return deny("This task hasn't started yet.");
  if (task.status === "DONE") return deny("This task is already done. To change finished work, send it back.");
  if (!comment.trim()) return deny("Say what needs to change.");
  return allow;
}

type SendBackPlan = { targetIndex: number; targets: TaskState[]; multiStep: boolean; workIndex: number };

function planSendBack(
  c: Ctx,
  command: Extract<Command, { type: "sendBack" }>,
): { ok: true; plan: SendBackPlan } | { ok: false; reason: string } {
  const open = checkOpen(c);
  if (!open.ok) return open;
  if (!command.comment.trim()) return deny("Explain why you're sending it back.") as { ok: false; reason: string };

  const cur = currentIndex(c);
  const workIndex = c.ix.currentWorkIndex(cur);
  const defaultTarget = c.ix.previousWorkIndex(cur);
  if (workIndex === null || defaultTarget === null) {
    return { ok: false, reason: "This is the first step, so there's nothing to send it back to." };
  }

  if (command.fromTaskId) {
    const from = findTask(c, command.fromTaskId);
    if (!from) return { ok: false, reason: "That task doesn't belong to this item." };
    if (c.ix.templateStageIndex(from.templateId) !== workIndex) {
      return { ok: false, reason: "You can only send work back from a task that's currently active." };
    }
    if (from.status === "DONE") return { ok: false, reason: "Reopen your task before sending the item back." };
    if (from.assigneeId !== c.actor.id && !c.isManager) {
      return { ok: false, reason: "Only the person on this task or a project manager can send it back." };
    }
  } else if (!c.isManager) {
    return { ok: false, reason: "Choose your task to send this back from." };
  }

  let targetIndex = defaultTarget;
  if (command.targetStageId) {
    let requested: number;
    try {
      requested = c.ix.indexOf(command.targetStageId);
    } catch {
      return { ok: false, reason: "That stage isn't part of this workflow." };
    }
    if (c.ix.stages[requested].kind !== "WORK" || requested > defaultTarget) {
      return { ok: false, reason: "You can only send work back to an earlier step." };
    }
    if (requested !== defaultTarget && !c.isManager) {
      return { ok: false, reason: "Only a project manager can send work back more than one step." };
    }
    targetIndex = requested;
  }

  const stageTasks = tasksOfStage(c, targetIndex);
  let targets = stageTasks;
  if (stageTasks.length > 1) {
    const wanted = new Set(command.targetTemplateIds ?? []);
    targets = stageTasks.filter((t) => wanted.has(t.templateId));
    if (targets.length === 0 || targets.length !== wanted.size) {
      const names = stageTasks.map((t) => templateOf(c, t).name.toLowerCase()).join(" or ");
      return { ok: false, reason: `Choose which part needs changes: ${names}.` };
    }
  }

  return { ok: true, plan: { targetIndex, targets, multiStep: targetIndex !== defaultTarget, workIndex } };
}

// ── Apply ────────────────────────────────────────────────────────────────

function applyStart(c: Ctx, task: TaskState) {
  const picked = !task.assigneeId;
  if (picked) assign(c, task, c.actor.id, null);
  task.status = "IN_PROGRESS";
  audit(c, "task.started", { pickedUp: picked }, task);
  const cur = currentIndex(c);
  if (c.ix.stages[cur].kind === "QUEUE") {
    const from = c.ix.stages[cur].name;
    c.item.stageId = c.ix.stages[cur + 1].id;
    audit(c, "item.stage_changed", { from, to: c.ix.stages[cur + 1].name, completed: false });
  }
}

function applySubmit(c: Ctx, task: TaskState) {
  const template = templateOf(c, task);
  if (!task.assigneeId && hasRole(c.actor, template.roleId)) assign(c, task, c.actor.id, null);
  if (template.canEditScript) c.effects.push({ kind: "scriptSnapshot", taskId: task.id });
  task.status = "DONE";
  // Submitting answers any open change requests on this task.
  task.changesRequested = false;
  c.effects.push({ kind: "resolveChangeRequests", taskId: task.id });
  c.item.firstSubmittedAt ??= c.now;
  audit(c, "task.submitted", { label: template.submitLabel }, task);

  const stageIndex = c.ix.templateStageIndex(task.templateId);
  if (tasksOfStage(c, stageIndex).every((t) => t.status === "DONE")) advance(c, stageIndex + 1);
}

function applySendBack(c: Ctx, plan: SendBackPlan, command: Extract<Command, { type: "sendBack" }>) {
  const fromStage = c.ix.stage(c.item.stageId).name;
  const notifyHold = (t: TaskState) => {
    if (t.assigneeId) notify(c, "ON_HOLD", t, { userId: t.assigneeId });
  };

  if (plan.multiStep) {
    // A manager jumping further back: everything after the target is redone.
    for (let j = plan.targetIndex + 1; j <= plan.workIndex; j++) {
      if (c.ix.stages[j].kind !== "WORK") continue;
      for (const t of tasksOfStage(c, j)) {
        if (t.status === "LOCKED") continue;
        t.status = "LOCKED";
        notifyHold(t);
      }
    }
  } else {
    // One step back: only the sender's task (and lanes that hadn't started) reset.
    // Other lanes keep exactly what they had, so their work isn't lost.
    for (const t of tasksOfStage(c, plan.workIndex)) {
      if (t.id === command.fromTaskId || t.status === "READY") {
        t.status = "LOCKED";
      } else if (STARTED.has(t.status)) {
        notifyHold(t);
      }
    }
  }

  for (const t of plan.targets) {
    t.status = "SENT_BACK";
    notify(c, "SENT_BACK", t);
  }
  c.item.stageId = c.ix.stages[plan.targetIndex].id;

  c.effects.push({
    kind: "comment",
    commentKind: "SEND_BACK",
    taskId: plan.targets.length === 1 ? plan.targets[0].id : null,
    body: command.comment.trim(),
  });
  const fromTask = command.fromTaskId ? findTask(c, command.fromTaskId) : null;
  audit(
    c,
    "task.sent_back",
    {
      from: fromStage,
      to: c.ix.stages[plan.targetIndex].name,
      targets: plan.targets.map((t) => templateOf(c, t).name),
      multiStep: plan.multiStep,
    },
    fromTask ?? undefined,
  );
}

// ── Public API ───────────────────────────────────────────────────────────

/** Applies one command. Never mutates the input. */
export function applyCommand(
  def: WorkflowDef,
  item: ItemState,
  actor: Actor,
  command: Command,
  now: Date = new Date(),
): EngineResult {
  const c = makeCtx(def, item, actor, now);
  const fail = (r: PolicyResult): EngineResult => ({ ok: false, reason: r.ok ? "Not allowed." : r.reason });

  if (!isDepartmentMember(actor, item.departmentId)) return fail(deny("You're not part of this department."));

  if (command.type === "sendBack") {
    const planned = planSendBack(c, command);
    if (!planned.ok) return { ok: false, reason: planned.reason };
    applySendBack(c, planned.plan, command);
    return { ok: true, item: c.item, effects: c.effects };
  }

  const task = findTask(c, command.taskId);
  if (!task) return fail(deny("That task doesn't belong to this item."));

  let check: PolicyResult;
  switch (command.type) {
    case "start":
      check = checkStart(c, task);
      if (check.ok) applyStart(c, task);
      break;
    case "submit":
      check = checkSubmit(c, task);
      if (check.ok) applySubmit(c, task);
      break;
    case "reopen":
      check = checkReopen(c, task);
      if (check.ok) {
        task.status = "IN_PROGRESS";
        audit(c, "task.reopened", {}, task);
      }
      break;
    case "pickUp":
      check = checkPickUp(c, task);
      if (check.ok) {
        assign(c, task, actor.id, null);
        audit(c, "task.picked_up", {}, task);
      }
      break;
    case "assign":
      check = checkReassign(c, task, command.to);
      if (check.ok) {
        const from = task.assigneeId;
        assign(c, task, command.to.id, command.note);
        notify(c, "REASSIGNED_TO_YOU", task, { userId: command.to.id });
        if (from) notify(c, "REASSIGNED_AWAY", task, { userId: from });
        audit(c, "task.reassigned", { fromUserId: from, toUserId: command.to.id, note: command.note }, task);
      }
      break;
    case "requestChanges":
      check = checkRequestChanges(c, task, command.comment);
      if (check.ok) {
        task.changesRequested = true;
        c.effects.push({ kind: "comment", commentKind: "CHANGE_REQUEST", taskId: task.id, body: command.comment.trim() });
        if (task.assigneeId) notify(c, "CHANGES_REQUESTED", task, { userId: task.assigneeId });
        audit(c, "task.changes_requested", {}, task);
      }
      break;
  }

  if (!check.ok) return fail(check);
  return { ok: true, item: c.item, effects: c.effects };
}

export type NewItemPlan = {
  stageId: string;
  tasks: { templateId: string; assigneeId: string | null; status: TaskStatus }[];
  /** Effects keyed by template id: the tasks don't have ids until they're saved. */
  notifications: { templateId: string; to: Recipient }[];
  assignments: { templateId: string; toUserId: string }[];
};

/**
 * Plans a new content item: one task per template, the first stage's tasks
 * ready. A creator who holds a first-stage role (e.g. a script writer) is
 * assigned that task. Only managers can assign other people.
 */
export function planNewItem(
  def: WorkflowDef,
  departmentId: string,
  actor: Actor,
  assignees: Record<string, CandidateUser>,
): { ok: true; plan: NewItemPlan } | { ok: false; reason: string } {
  if (!canCreateItem(actor, departmentId)) {
    return { ok: false, reason: "You can't create content items in this department." };
  }
  const ix = new WorkflowIndex(def);
  const isManager = canManageDepartmentItems(actor, departmentId);
  const templates = ix.stages.flatMap((s) => s.tasks);

  for (const [templateId, candidate] of Object.entries(assignees)) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return { ok: false, reason: "One of those tasks isn't part of this workflow." };
    if (!isManager && candidate.id !== actor.id) {
      return { ok: false, reason: "Only a project manager can assign other people." };
    }
    if (!candidate.isActive || !candidate.roleIds.includes(template.roleId)) {
      return { ok: false, reason: `${template.name} needs a ${template.roleName.toLowerCase()}.` };
    }
  }

  const first = ix.first();
  const firstIds = new Set(first.tasks.map((t) => t.id));
  const plan: NewItemPlan = { stageId: first.id, tasks: [], notifications: [], assignments: [] };

  for (const template of templates) {
    let assigneeId = assignees[template.id]?.id ?? null;
    let status: TaskStatus = firstIds.has(template.id) ? "READY" : "LOCKED";
    if (firstIds.has(template.id) && !assigneeId && hasRole(actor, template.roleId)) {
      assigneeId = actor.id;
      status = "IN_PROGRESS";
    }
    plan.tasks.push({ templateId: template.id, assigneeId, status });
    if (assigneeId) plan.assignments.push({ templateId: template.id, toUserId: assigneeId });
    if (firstIds.has(template.id) && assigneeId !== actor.id) {
      plan.notifications.push({
        templateId: template.id,
        to: assigneeId ? { userId: assigneeId } : { roleId: template.roleId },
      });
    }
  }
  return { ok: true, plan };
}

/** Who may edit the script right now, and through which task. */
export function checkEditScript(
  def: WorkflowDef,
  item: ItemState,
  actor: Actor,
): { ok: true; taskId: string } | { ok: false; reason: string } {
  const c = makeCtx(def, item, actor, new Date());
  const open = checkOpen(c);
  if (!open.ok) return open;
  if (!isDepartmentMember(actor, item.departmentId)) return { ok: false, reason: "You're not part of this department." };

  const cur = currentIndex(c);
  const stage = c.ix.stages[cur];
  const locked = "The script is locked. It can only change if it's sent back to writing or editing.";
  if (stage.kind === "QUEUE") {
    const next = tasksOfStage(c, cur + 1).find((t) => templateOf(c, t).canEditScript);
    return { ok: false, reason: next ? "Start this task before editing the script." : locked };
  }
  const task = tasksOfStage(c, cur).find((t) => templateOf(c, t).canEditScript && t.status !== "DONE");
  if (!task) return { ok: false, reason: locked };
  if (!task.assigneeId) return { ok: false, reason: "Pick up this task before editing the script." };
  if (task.assigneeId !== actor.id && !c.isManager) {
    return { ok: false, reason: "Only the person on this task can edit the script right now." };
  }
  return { ok: true, taskId: task.id };
}

/** Saving the script counts as starting work on that task. */
export function applyScriptSaved(def: WorkflowDef, item: ItemState, actor: Actor, version: number): EngineResult {
  const check = checkEditScript(def, item, actor);
  if (!check.ok) return check;
  const c = makeCtx(def, item, actor, new Date());
  const task = findTask(c, check.taskId)!;
  if (task.status === "READY") task.status = "IN_PROGRESS";
  c.item.latestScriptVersion = version;
  audit(c, "script.saved", { version }, task);
  return { ok: true, item: c.item, effects: c.effects };
}

export type TaskActions = {
  start: boolean;
  submit: boolean;
  reopen: boolean;
  pickUp: boolean;
  reassign: boolean;
  requestChanges: boolean;
  sendBack: boolean;
};

export type ItemActions = {
  tasks: Record<string, TaskActions>;
  editScript: { ok: true; taskId: string } | { ok: false; reason: string };
  sendBack: {
    defaultStageId: string;
    /** Parallel tasks in the default target: the sender picks which need changes. */
    laneTemplateIds: string[];
    /** Further-back options, managers only. */
    managerStageIds: string[];
    /** Managers can send back without holding a task. */
    managerWithoutTask: boolean;
  } | null;
};

/** What this person can do right now. Used to decide which buttons to show. */
export function describeActions(def: WorkflowDef, item: ItemState, actor: Actor): ItemActions {
  const c = makeCtx(def, item, actor, new Date());
  const member = isDepartmentMember(actor, item.departmentId);
  const tasks: Record<string, TaskActions> = {};

  const cur = currentIndex(c);
  const defaultTarget = item.completedAt ? null : c.ix.previousWorkIndex(cur);
  const laneTemplateIds = defaultTarget === null ? [] : tasksOfStage(c, defaultTarget).map((t) => t.templateId);

  for (const task of c.item.tasks) {
    const sendBack =
      member &&
      defaultTarget !== null &&
      planSendBack(c, { type: "sendBack", fromTaskId: task.id, comment: "x", targetTemplateIds: laneTemplateIds }).ok;
    tasks[task.id] = {
      start: member && checkStart(c, task).ok,
      submit: member && checkSubmit(c, task).ok,
      reopen: member && checkReopen(c, task).ok,
      pickUp: member && checkPickUp(c, task).ok,
      reassign: member && checkReassign(c, task).ok,
      requestChanges: member && checkRequestChanges(c, task, "x").ok,
      sendBack,
    };
  }

  const anyone = Object.values(tasks).some((t) => t.sendBack);
  const managerWithoutTask =
    member && c.isManager && defaultTarget !== null && checkOpen(c).ok;
  return {
    tasks,
    editScript: checkEditScript(def, item, actor),
    sendBack:
      defaultTarget !== null && (anyone || managerWithoutTask)
        ? {
            defaultStageId: c.ix.stages[defaultTarget].id,
            laneTemplateIds: laneTemplateIds.length > 1 ? laneTemplateIds : [],
            managerStageIds: c.isManager
              ? c.ix.earlierWorkIndexes(defaultTarget).map((i) => c.ix.stages[i].id)
              : [],
            managerWithoutTask,
          }
        : null,
  };
}
