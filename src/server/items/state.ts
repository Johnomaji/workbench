import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { writeAudit } from "@/server/audit";
import type { ItemVisibility } from "@/server/permissions/policy";
import { WorkflowIndex } from "@/server/workflow/definition";
import { loadWorkflowDef } from "@/server/workflow/load";
import type { Effect, EngineResult, ItemState, WorkflowDef } from "@/server/workflow/types";
import { createNotifications } from "./notifications";

type Client = PrismaClient | Prisma.TransactionClient;

export type LoadedItem = {
  organizationId: string;
  state: ItemState;
  def: WorkflowDef;
  number: number;
  title: string;
  createdById: string;
  draftsVisibleToAll: boolean;
  timeZone: string;
};

const itemSelect = {
  id: true,
  organizationId: true,
  number: true,
  title: true,
  departmentId: true,
  workflowId: true,
  stageId: true,
  createdById: true,
  firstSubmittedAt: true,
  completedAt: true,
  archivedAt: true,
  latestScriptVersion: true,
  department: { select: { draftsVisibleToAll: true, timezone: true } },
  tasks: { select: { id: true, templateId: true, assigneeId: true, status: true, changesRequested: true } },
} satisfies Prisma.ContentItemSelect;

/** Loads an item of one organization; another organization's item is simply not found. */
export async function loadItem(
  client: Client,
  organizationId: string,
  where: { id: string } | { number: number },
): Promise<LoadedItem | null> {
  const row = await client.contentItem.findFirst({ where: { ...where, organizationId }, select: itemSelect });
  if (!row) return null;
  const def = await loadWorkflowDef(client, row.workflowId);
  return {
    organizationId: row.organizationId,
    def,
    number: row.number,
    title: row.title,
    createdById: row.createdById,
    draftsVisibleToAll: row.department.draftsVisibleToAll,
    timeZone: row.department.timezone,
    state: {
      id: row.id,
      departmentId: row.departmentId,
      stageId: row.stageId,
      firstSubmittedAt: row.firstSubmittedAt,
      completedAt: row.completedAt,
      archivedAt: row.archivedAt,
      latestScriptVersion: row.latestScriptVersion,
      tasks: row.tasks,
    },
  };
}

/**
 * Locks the item row for the rest of the transaction, then loads it. Two people
 * acting at the same moment (e.g. design and video both finishing) are applied
 * one after the other, each seeing the other's result.
 */
export async function lockItem(tx: Prisma.TransactionClient, organizationId: string, itemId: string): Promise<LoadedItem | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "ContentItem" WHERE "id" = ${itemId} AND "organizationId" = ${organizationId} FOR UPDATE
  `;
  if (rows.length === 0) return null;
  return loadItem(tx, organizationId, { id: itemId });
}

export function visibilityOf(item: LoadedItem): ItemVisibility {
  const ix = new WorkflowIndex(item.def);
  const firstTemplates = new Map(ix.first().tasks.map((t) => [t.id, t]));
  const firstTasks = item.state.tasks.filter((t) => firstTemplates.has(t.templateId));
  return {
    organizationId: item.organizationId,
    departmentId: item.state.departmentId,
    createdById: item.createdById,
    firstSubmittedAt: item.state.firstSubmittedAt,
    draftsVisibleToAll: item.draftsVisibleToAll,
    firstStageAssigneeIds: firstTasks.flatMap((t) => (t.assigneeId ? [t.assigneeId] : [])),
    firstStageOpenRoleIds: firstTasks.filter((t) => !t.assigneeId).map((t) => firstTemplates.get(t.templateId)!.roleId),
  };
}

export type PersistContext = {
  actor: { id: string; name: string };
  loaded: LoadedItem;
  result: Extract<EngineResult, { ok: true }>;
  now: Date;
  ip: string;
};

/** Writes an engine result and all its effects. Call inside the same transaction as lockItem. */
export async function persistResult(tx: Prisma.TransactionClient, ctx: PersistContext): Promise<void> {
  const { actor, loaded, result, now, ip } = ctx;
  const prev = loaded.state;
  const next = result.item;
  const itemId = prev.id;

  // Script snapshots first: they move latestScriptVersion forward.
  let latestScriptVersion = next.latestScriptVersion;
  for (const effect of result.effects) {
    if (effect.kind !== "scriptSnapshot") continue;
    const latest = await tx.scriptVersion.findUnique({
      where: { itemId_number: { itemId, number: latestScriptVersion } },
      select: { content: true, plainText: true },
    });
    if (!latest) throw new Error(`Item ${itemId} has no script version ${latestScriptVersion}`);
    latestScriptVersion += 1;
    await tx.scriptVersion.create({
      data: {
        itemId,
        number: latestScriptVersion,
        content: latest.content as Prisma.InputJsonValue,
        plainText: latest.plainText,
        reason: "SUBMIT",
        authorId: actor.id,
        stageId: prev.stageId,
      },
    });
  }

  for (const task of next.tasks) {
    const before = prev.tasks.find((t) => t.id === task.id);
    if (!before) throw new Error(`Task ${task.id} appeared from nowhere`);
    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (task.status !== before.status) {
      data.status = task.status;
      if (task.status === "READY") data.readyAt = now;
      if (task.status === "IN_PROGRESS") data.startedAt = now;
      data.completedAt = task.status === "DONE" ? now : null;
    }
    if (task.assigneeId !== before.assigneeId) data.assigneeId = task.assigneeId;
    if (task.changesRequested !== before.changesRequested) data.changesRequested = task.changesRequested;
    if (Object.keys(data).length > 0) await tx.task.update({ where: { id: task.id }, data });
  }

  await tx.contentItem.update({
    where: { id: itemId },
    data: {
      stateVersion: { increment: 1 },
      latestScriptVersion,
      ...(next.stageId !== prev.stageId ? { stageId: next.stageId, stageEnteredAt: now } : {}),
      ...(next.firstSubmittedAt !== prev.firstSubmittedAt ? { firstSubmittedAt: next.firstSubmittedAt } : {}),
      ...(next.completedAt !== prev.completedAt ? { completedAt: next.completedAt } : {}),
    },
  });

  const pending: Extract<Effect, { kind: "notify" }>[] = [];
  for (const effect of result.effects) {
    switch (effect.kind) {
      case "assignment":
        await tx.taskAssignment.updateMany({ where: { taskId: effect.taskId, endedAt: null }, data: { endedAt: now } });
        await tx.taskAssignment.create({
          data: { taskId: effect.taskId, userId: effect.toUserId, assignedById: actor.id, note: effect.note },
        });
        break;
      case "comment":
        await tx.comment.create({
          data: { itemId, taskId: effect.taskId, authorId: actor.id, kind: effect.commentKind, body: effect.body },
        });
        break;
      case "resolveChangeRequests":
        await tx.comment.updateMany({
          where: { taskId: effect.taskId, kind: "CHANGE_REQUEST", resolvedAt: null },
          data: { resolvedAt: now, resolvedById: actor.id },
        });
        break;
      case "audit":
        await writeAudit(tx, {
          action: effect.action,
          actorId: actor.id,
          entityType: effect.taskId ? "Task" : "ContentItem",
          entityId: effect.taskId ?? itemId,
          itemId,
          organizationId: loaded.organizationId,
          departmentId: prev.departmentId,
          data: effect.data,
          ipAddress: ip,
        });
        break;
      case "notify":
        pending.push(effect);
        break;
      case "scriptSnapshot":
        break; // handled above
    }
  }

  await createNotifications(tx, {
    organizationId: loaded.organizationId,
    item: { id: itemId, title: loaded.title, departmentId: prev.departmentId },
    def: loaded.def,
    stageId: next.stageId,
    tasks: next.tasks,
    actor,
    pending,
  });
}
