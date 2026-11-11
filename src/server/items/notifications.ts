import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { WorkflowIndex } from "@/server/workflow/definition";
import type { NotificationKind, Recipient, TaskState, WorkflowDef } from "@/server/workflow/types";

type Pending = { type: NotificationKind; taskId: string; to: Recipient };

type Input = {
  organizationId: string;
  item: { id: string; title: string; departmentId: string };
  def: WorkflowDef;
  /** Stage the item is at after the change. */
  stageId: string;
  tasks: TaskState[];
  actor: { id: string; name: string };
  pending: Pending[];
};

function text(
  type: NotificationKind,
  v: { item: string; task: string; stage: string; actor: string; role: string; pool: boolean; done: boolean },
): { title: string; body: string } {
  const quoted = `"${v.item}"`;
  switch (type) {
    case "TASK_READY":
      return v.pool
        ? { title: `Needs a ${v.role.toLowerCase()}: ${v.task}`, body: `${quoted} is waiting for someone to pick it up.` }
        : { title: `Your turn: ${v.task}`, body: `${quoted} is ready for you.` };
    case "SENT_BACK":
      return { title: `Sent back to you: ${v.task}`, body: `${v.actor} sent ${quoted} back. Their comment says why.` };
    case "REASSIGNED_TO_YOU":
      return { title: `Assigned to you: ${v.task}`, body: `${v.actor} gave you ${quoted}.` };
    case "REASSIGNED_AWAY":
      return { title: `Reassigned: ${v.task}`, body: `${v.actor} moved ${quoted} to someone else.` };
    case "CHANGES_REQUESTED":
      return { title: `Changes requested: ${v.task}`, body: `${v.actor} asked for changes on ${quoted}.` };
    case "ON_HOLD":
      return {
        title: `On hold: ${v.task}`,
        body: `${quoted} was sent back to ${v.stage}. Nothing you've done is lost; it comes back to you after.`,
      };
    case "RESUMED":
      return v.done
        ? { title: `Back again: ${v.task}`, body: `${quoted} is back at ${v.stage}. Your part is still marked done; check whether anything changed.` }
        : { title: `Back with you: ${v.task}`, body: `${quoted} is back at ${v.stage}. Carry on where you left off.` };
  }
}

/**
 * Stores in-app notifications for the engine's notify effects. "Everyone with
 * a role" (unassigned tasks) is expanded to the people with that role who are
 * active in the organization.
 * Nobody is notified about their own action, and nobody gets the same
 * notification twice. Email delivery and the notification centre come in Phase 5.
 */
export async function createNotifications(tx: Prisma.TransactionClient, input: Input): Promise<void> {
  if (input.pending.length === 0) return;
  const ix = new WorkflowIndex(input.def);

  const roleIds = [...new Set(input.pending.flatMap((p) => ("roleId" in p.to ? [p.to.roleId] : [])))];
  const roleMembers = new Map<string, string[]>();
  if (roleIds.length > 0) {
    const memberships = await tx.membership.findMany({
      where: {
        organizationId: input.organizationId,
        roleId: { in: roleIds },
        user: { isActive: true },
        member: { isActive: true },
      },
      select: { roleId: true, userId: true },
    });
    for (const m of memberships) roleMembers.set(m.roleId, [...(roleMembers.get(m.roleId) ?? []), m.userId]);
  }

  const seen = new Set<string>();
  const rows: Prisma.NotificationCreateManyInput[] = [];
  for (const p of input.pending) {
    const task = input.tasks.find((t) => t.id === p.taskId);
    if (!task) continue;
    const template = ix.template(task.templateId);
    const pool = "roleId" in p.to;
    const userIds = "userId" in p.to ? [p.to.userId] : (roleMembers.get(p.to.roleId) ?? []);
    const { title, body } = text(p.type, {
      item: input.item.title,
      task: template.name,
      stage: ix.stage(input.stageId).name,
      actor: input.actor.name,
      role: template.roleName,
      pool,
      done: task.status === "DONE",
    });
    for (const userId of userIds) {
      const key = `${userId}:${p.type}:${p.taskId}`;
      if (userId === input.actor.id || seen.has(key)) continue;
      seen.add(key);
      rows.push({
        organizationId: input.organizationId,
        userId,
        type: p.type,
        itemId: input.item.id,
        actorId: input.actor.id,
        title,
        body,
        emailStatus: "NOT_SENDING",
      });
    }
  }
  if (rows.length > 0) await tx.notification.createMany({ data: rows });
}
