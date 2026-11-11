import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { endOfDayIn } from "@/lib/dates";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import {
  canEditItemDetails,
  canManageDepartmentItems,
  canViewItem,
  type Actor,
} from "@/server/permissions/policy";
import { fieldErrors } from "@/server/validation/common";
import { canonicalJson, parseScriptContent } from "@/server/validation/script";
import {
  archiveSchema,
  createItemSchema,
  itemDetailsSchema,
  reassignSchema,
  requestChangesSchema,
  resolveChangeRequestSchema,
  saveScriptSchema,
  sendBackSchema,
  taskCommandSchema,
} from "@/server/validation/items";
import { applyCommand, applyScriptSaved, planNewItem } from "@/server/workflow/engine";
import { loadWorkflowDef } from "@/server/workflow/load";
import type { CandidateUser, Command } from "@/server/workflow/types";
import { createNotifications } from "./notifications";
import { lockItem, persistResult, visibilityOf, type LoadedItem } from "./state";

export type ItemActor = Actor & { name: string };

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(fieldErrors(result.error));
  return result.data;
}

/** Hidden drafts look exactly like items that don't exist. */
function assertVisible(actor: Actor, item: LoadedItem | null): asserts item is LoadedItem {
  if (!item || !canViewItem(actor, visibilityOf(item))) throw new NotFoundError("We couldn't find that item.");
}

/**
 * People who could be given a task, as members of this organization. Anyone
 * outside it is simply missing from the map, so they can never be assigned.
 */
async function candidates(
  tx: Prisma.TransactionClient | typeof db,
  organizationId: string,
  userIds: string[],
): Promise<Map<string, CandidateUser>> {
  if (userIds.length === 0) return new Map();
  const members = await tx.organizationMember.findMany({
    where: { organizationId, userId: { in: userIds } },
    select: { userId: true, isActive: true, user: { select: { isActive: true } }, roles: { select: { roleId: true } } },
  });
  return new Map(
    members.map((m) => [
      m.userId,
      { id: m.userId, isActive: m.isActive && m.user.isActive, roleIds: m.roles.map((r) => r.roleId) },
    ]),
  );
}

/**
 * The next item number in an organization ("#142"). The row lock it takes
 * lasts until the transaction ends, so two items created at the same moment
 * get consecutive numbers; other organizations aren't held up.
 */
async function nextItemNumber(tx: Prisma.TransactionClient, organizationId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ itemCounter: number }[]>`
    UPDATE "Organization" SET "itemCounter" = "itemCounter" + 1 WHERE "id" = ${organizationId} RETURNING "itemCounter"
  `;
  if (rows.length !== 1) throw new Error(`Organization ${organizationId} not found`);
  return rows[0].itemCounter;
}

/**
 * Runs one workflow command: lock the item, re-check everything against the
 * latest state, apply, persist. Each command is checked on its own merits, so
 * the designer and video editor never block each other with "this changed".
 */
async function run(actor: ItemActor, itemId: string, ip: string, build: (tx: Prisma.TransactionClient, item: LoadedItem) => Promise<Command> | Command) {
  return db.$transaction(async (tx) => {
    const item = await lockItem(tx, actor.organizationId, itemId);
    assertVisible(actor, item);
    const command = await build(tx, item);
    const now = new Date();
    const result = applyCommand(item.def, item.state, actor, command, now);
    if (!result.ok) throw new AppError(result.reason);
    await persistResult(tx, { actor, loaded: item, result, now, ip });
    return { number: item.number, stageId: result.item.stageId, completed: Boolean(result.item.completedAt) };
  });
}

// ── Workflow commands ───────────────────────────────────────────────────

export async function runTaskCommand(actor: ItemActor, input: unknown, ip: string) {
  const { itemId, taskId, intent } = parse(taskCommandSchema, input);
  return run(actor, itemId, ip, () => ({ type: intent, taskId }));
}

export async function sendBack(actor: ItemActor, input: unknown, ip: string) {
  const data = parse(sendBackSchema, input);
  return run(actor, data.itemId, ip, () => ({
    type: "sendBack",
    fromTaskId: data.fromTaskId ?? null,
    comment: data.comment,
    targetStageId: data.targetStageId,
    targetTemplateIds: data.targetTemplateIds,
  }));
}

export async function reassignTask(actor: ItemActor, input: unknown, ip: string) {
  const data = parse(reassignSchema, input);
  return run(actor, data.itemId, ip, async (tx) => {
    const to = (await candidates(tx, actor.organizationId, [data.toUserId])).get(data.toUserId);
    if (!to) throw new ValidationError({ toUserId: ["Choose someone from the list."] });
    return { type: "assign", taskId: data.taskId, to, note: data.note };
  });
}

export async function requestChanges(actor: ItemActor, input: unknown, ip: string) {
  const data = parse(requestChangesSchema, input);
  return run(actor, data.itemId, ip, () => ({ type: "requestChanges", taskId: data.taskId, comment: data.comment }));
}

// ── Creating and editing items ──────────────────────────────────────────

export async function createItem(actor: ItemActor, input: unknown, ip: string): Promise<{ number: number }> {
  const data = parse(createItemSchema, input);

  const department = await db.department.findFirst({
    where: { id: data.departmentId, organizationId: actor.organizationId },
    select: { id: true, isActive: true, timezone: true },
  });
  if (!department?.isActive) throw new ValidationError({ departmentId: ["Choose a department."] });

  const workflow = await db.workflow.findFirst({
    where: { departmentId: department.id, isActive: true },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!workflow) throw new AppError("This department doesn't have a workflow set up yet.");
  const def = await loadWorkflowDef(db, workflow.id);

  const people = await candidates(db, actor.organizationId, Object.values(data.assignees));
  const assignees: Record<string, CandidateUser> = {};
  for (const [templateId, userId] of Object.entries(data.assignees)) {
    const person = people.get(userId);
    if (!person) throw new ValidationError({ [`assignee_${templateId}`]: ["Choose someone from the list."] });
    assignees[templateId] = person;
  }

  const planned = planNewItem(def, department.id, actor, assignees);
  if (!planned.ok) throw new ForbiddenError(planned.reason);
  const { plan } = planned;
  const now = new Date();

  return db.$transaction(async (tx) => {
    const number = await nextItemNumber(tx, actor.organizationId);
    const item = await tx.contentItem.create({
      data: {
        organizationId: actor.organizationId,
        number,
        departmentId: department.id,
        workflowId: workflow.id,
        stageId: plan.stageId,
        stageEnteredAt: now,
        title: data.title,
        brief: data.brief,
        deadline: data.deadline ? endOfDayIn(data.deadline, department.timezone) : null,
        createdById: actor.id,
        tasks: {
          create: plan.tasks.map((t) => ({
            templateId: t.templateId,
            assigneeId: t.assigneeId,
            status: t.status,
            readyAt: t.status === "LOCKED" ? null : now,
            startedAt: t.status === "IN_PROGRESS" ? now : null,
          })),
        },
      },
      select: { id: true, number: true, title: true, tasks: { select: { id: true, templateId: true, assigneeId: true, status: true, changesRequested: true } } },
    });
    const taskIdOf = new Map(item.tasks.map((t) => [t.templateId, t.id]));

    if (plan.assignments.length > 0) {
      await tx.taskAssignment.createMany({
        data: plan.assignments.map((a) => ({ taskId: taskIdOf.get(a.templateId)!, userId: a.toUserId, assignedById: actor.id })),
      });
    }
    await writeAudit(tx, {
      action: "item.created",
      actorId: actor.id,
      entityType: "ContentItem",
      entityId: item.id,
      itemId: item.id,
      organizationId: actor.organizationId,
      departmentId: department.id,
      ipAddress: ip,
      data: { title: data.title, deadline: data.deadline, assigned: plan.assignments.length },
    });
    await createNotifications(tx, {
      organizationId: actor.organizationId,
      item: { id: item.id, title: item.title, departmentId: department.id },
      def,
      stageId: plan.stageId,
      tasks: item.tasks,
      actor,
      pending: plan.notifications.map((n) => ({ type: "TASK_READY", taskId: taskIdOf.get(n.templateId)!, to: n.to })),
    });
    return { number: item.number };
  });
}

/**
 * Saves the script as a new version. `baseVersion` is the version the person
 * started from; if someone else saved in the meantime, nothing is overwritten.
 */
export async function saveScript(
  actor: ItemActor,
  input: unknown,
  ip: string,
): Promise<{ version: number; unchanged: boolean }> {
  const data = parse(saveScriptSchema, input);
  const parsed = parseScriptContent(data.content);
  if (!parsed.ok) throw new AppError(parsed.reason);
  const { doc, text } = parsed;

  return db.$transaction(async (tx) => {
    const item = await lockItem(tx, actor.organizationId, data.itemId);
    assertVisible(actor, item);
    const latest = item.state.latestScriptVersion;
    if (data.baseVersion !== latest) {
      throw new AppError(
        "Someone else saved the script while you were editing. Copy your changes, reload the page, and add them again.",
      );
    }
    if (latest > 0) {
      const current = await tx.scriptVersion.findUnique({
        where: { itemId_number: { itemId: item.state.id, number: latest } },
        select: { content: true },
      });
      // Formatting counts as a change, so compare the documents, not just the words.
      if (current && canonicalJson(current.content) === canonicalJson(doc)) return { version: latest, unchanged: true };
    }

    const version = latest + 1;
    const now = new Date();
    const result = applyScriptSaved(item.def, item.state, actor, version);
    if (!result.ok) throw new ForbiddenError(result.reason);
    await tx.scriptVersion.create({
      data: {
        itemId: item.state.id,
        number: version,
        content: doc as unknown as Prisma.InputJsonValue,
        plainText: text,
        reason: "SAVE",
        authorId: actor.id,
        stageId: item.state.stageId,
      },
    });
    await persistResult(tx, { actor, loaded: item, result, now, ip });
    return { version, unchanged: false };
  });
}

export async function resolveChangeRequest(actor: ItemActor, input: unknown, ip: string) {
  const { commentId } = parse(resolveChangeRequestSchema, input);
  const comment = await db.comment.findFirst({
    where: { id: commentId, item: { organizationId: actor.organizationId } },
    select: { id: true, itemId: true, taskId: true, authorId: true, kind: true, resolvedAt: true },
  });
  if (!comment || comment.kind !== "CHANGE_REQUEST" || !comment.taskId) throw new NotFoundError("That request no longer exists.");
  if (comment.resolvedAt) return;
  const taskId = comment.taskId;

  await db.$transaction(async (tx) => {
    const item = await lockItem(tx, actor.organizationId, comment.itemId);
    assertVisible(actor, item);
    const task = item.state.tasks.find((t) => t.id === taskId);
    const allowed =
      task?.assigneeId === actor.id ||
      comment.authorId === actor.id ||
      canManageDepartmentItems(actor, item.state.departmentId);
    if (!allowed) throw new ForbiddenError("Only the person on this task, whoever asked, or a project manager can mark this done.");

    const now = new Date();
    await tx.comment.update({ where: { id: comment.id }, data: { resolvedAt: now, resolvedById: actor.id } });
    const open = await tx.comment.count({ where: { taskId, kind: "CHANGE_REQUEST", resolvedAt: null } });
    if (open === 0) await tx.task.update({ where: { id: taskId }, data: { changesRequested: false } });
    await tx.contentItem.update({ where: { id: item.state.id }, data: { stateVersion: { increment: 1 } } });
    await writeAudit(tx, {
      action: "task.change_request_resolved",
      actorId: actor.id,
      entityType: "Task",
      entityId: taskId,
      itemId: item.state.id,
      organizationId: actor.organizationId,
      departmentId: item.state.departmentId,
      ipAddress: ip,
      data: { commentId: comment.id, remaining: open },
    });
  });
}

export async function updateItemDetails(actor: ItemActor, input: unknown, ip: string) {
  const data = parse(itemDetailsSchema, input);
  await db.$transaction(async (tx) => {
    const item = await lockItem(tx, actor.organizationId, data.itemId);
    assertVisible(actor, item);
    const row = await tx.contentItem.findUniqueOrThrow({
      where: { id: item.state.id },
      select: { title: true, brief: true, deadline: true },
    });
    if (!canEditItemDetails(actor, { ...item.state, createdById: item.createdById })) {
      throw new ForbiddenError("Only a project manager can change this now that it's been submitted.");
    }
    const deadline = data.deadline ? endOfDayIn(data.deadline, item.timeZone) : null;
    await tx.contentItem.update({
      where: { id: item.state.id },
      data: { title: data.title, brief: data.brief, deadline, stateVersion: { increment: 1 } },
    });
    await writeAudit(tx, {
      action: "item.updated",
      actorId: actor.id,
      entityType: "ContentItem",
      entityId: item.state.id,
      itemId: item.state.id,
      organizationId: actor.organizationId,
      departmentId: item.state.departmentId,
      ipAddress: ip,
      data: {
        before: { title: row.title, deadline: row.deadline?.toISOString() ?? null },
        after: { title: data.title, deadline: deadline?.toISOString() ?? null, briefChanged: row.brief !== data.brief },
      },
    });
  });
}

export async function setItemArchived(actor: ItemActor, input: unknown, ip: string) {
  const { itemId, archived } = parse(archiveSchema, input);
  await db.$transaction(async (tx) => {
    const item = await lockItem(tx, actor.organizationId, itemId);
    assertVisible(actor, item);
    if (!canManageDepartmentItems(actor, item.state.departmentId)) {
      throw new ForbiddenError("Only a project manager can archive items.");
    }
    if (Boolean(item.state.archivedAt) === archived) return;
    await tx.contentItem.update({
      where: { id: itemId },
      data: { archivedAt: archived ? new Date() : null, stateVersion: { increment: 1 } },
    });
    await writeAudit(tx, {
      action: archived ? "item.archived" : "item.restored",
      actorId: actor.id,
      entityType: "ContentItem",
      entityId: itemId,
      itemId,
      organizationId: actor.organizationId,
      departmentId: item.state.departmentId,
      ipAddress: ip,
      data: {},
    });
  });
}
