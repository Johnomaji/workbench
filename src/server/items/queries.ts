import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { dateInputValue, isOverdue } from "@/lib/dates";
import { docToText, isScriptDoc, textToDoc, type ScriptDoc } from "@/lib/script-doc";
import { db } from "@/server/db";
import {
  canCreateItem,
  canEditItemDetails,
  canManageDepartmentItems,
  canViewItem,
  type Actor,
} from "@/server/permissions/policy";
import { itemNumberSchema } from "@/server/validation/items";
import { WorkflowIndex } from "@/server/workflow/definition";
import { describeActions, isTaskActive, type ItemActions } from "@/server/workflow/engine";
import { loadWorkflowDef } from "@/server/workflow/load";
import type { ItemState, TaskStatus, WorkflowDef } from "@/server/workflow/types";
import { visibilityOf, type LoadedItem } from "./state";

// ── Shared loading ───────────────────────────────────────────────────────

export const listItemSelect = {
  id: true,
  organizationId: true,
  number: true,
  title: true,
  deadline: true,
  departmentId: true,
  workflowId: true,
  stageId: true,
  createdById: true,
  firstSubmittedAt: true,
  completedAt: true,
  archivedAt: true,
  latestScriptVersion: true,
  department: { select: { draftsVisibleToAll: true, timezone: true, name: true } },
  tasks: {
    select: {
      id: true,
      templateId: true,
      assigneeId: true,
      status: true,
      changesRequested: true,
      assignee: { select: { name: true } },
    },
  },
} satisfies Prisma.ContentItemSelect;

export type ListRow = Prisma.ContentItemGetPayload<{ select: typeof listItemSelect }>;

/** Loads each workflow definition once per request. */
export function workflowCache() {
  const cache = new Map<string, Promise<WorkflowDef>>();
  return (id: string) => {
    if (!cache.has(id)) cache.set(id, loadWorkflowDef(db, id));
    return cache.get(id)!;
  };
}

export function toLoaded(row: ListRow, def: WorkflowDef): LoadedItem {
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
      tasks: row.tasks.map(({ id, templateId, assigneeId, status, changesRequested }) => ({
        id,
        templateId,
        assigneeId,
        status,
        changesRequested,
      })),
    },
  };
}

/** Items of the actor's organization, in departments they can see. */
function departmentScope(actor: Actor): Prisma.ContentItemWhereInput {
  if (actor.isAdmin) return { organizationId: actor.organizationId, departmentId: { in: actor.orgDepartmentIds } };
  return {
    organizationId: actor.organizationId,
    departmentId: { in: [...new Set(actor.memberships.map((m) => m.departmentId))] },
  };
}

/** Active people with a role, as members of the organization. */
function activeRoleHolders(organizationId: string): Prisma.MembershipWhereInput {
  return { organizationId, user: { isActive: true }, member: { isActive: true } };
}

export function creatableDepartments(actor: Actor & { memberships: { departmentId: string; departmentName: string }[] }) {
  const seen = new Map<string, string>();
  for (const m of actor.memberships) if (canCreateItem(actor, m.departmentId)) seen.set(m.departmentId, m.departmentName);
  return [...seen].map(([id, name]) => ({ id, name }));
}

export type NewItemOptions = {
  departments: { id: string; name: string }[];
  /** Pre-assignment choices; only for managers, and only when there's one department to pick from. */
  assignable: { templateId: string; name: string; stageName: string; roleName: string; candidates: { id: string; name: string }[] }[];
  /** The first task the creator will be given automatically (e.g. "Script" for a writer). */
  selfTaskName: string | null;
};

export async function getNewItemOptions(
  actor: Actor & { memberships: { departmentId: string; departmentName: string }[] },
): Promise<NewItemOptions> {
  const departments = actor.isAdmin
    ? await db.department.findMany({
        where: { organizationId: actor.organizationId, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : creatableDepartments(actor);
  const empty: NewItemOptions = { departments, assignable: [], selfTaskName: null };
  if (departments.length !== 1) return empty;

  const departmentId = departments[0].id;
  const workflow = await db.workflow.findFirst({
    where: { departmentId, isActive: true },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!workflow) return empty;
  const ix = new WorkflowIndex(await loadWorkflowDef(db, workflow.id));
  const roleIds = actor.memberships.map((m) => m.roleId);
  const self = ix.first().tasks.find((t) => roleIds.includes(t.roleId));

  if (!canManageDepartmentItems(actor, departmentId)) {
    return { ...empty, selfTaskName: self?.name ?? null };
  }

  const memberships = await db.membership.findMany({
    where: { ...activeRoleHolders(actor.organizationId), role: { departmentId } },
    orderBy: { user: { name: "asc" } },
    select: { roleId: true, user: { select: { id: true, name: true } } },
  });
  return {
    departments,
    selfTaskName: null,
    assignable: ix.stages.flatMap((stage) =>
      stage.tasks.map((t) => ({
        templateId: t.id,
        name: t.name,
        stageName: stage.name,
        roleName: t.roleName,
        candidates: memberships.filter((m) => m.roleId === t.roleId).map((m) => m.user),
      })),
    ),
  };
}

// ── Home: my work ────────────────────────────────────────────────────────

export type WorkCard = {
  taskId: string;
  taskName: string;
  roleName: string;
  status: TaskStatus;
  changesRequested: boolean;
  itemNumber: number;
  itemTitle: string;
  stageName: string;
  deadline: Date | null;
  timeZone: string;
  overdue: boolean;
};

export async function getMyWork(actor: Actor): Promise<{ yourTurn: WorkCard[]; upForGrabs: WorkCard[]; comingUp: WorkCard[] }> {
  const roleIds = actor.memberships.map((m) => m.roleId);
  const rows = await db.contentItem.findMany({
    where: {
      ...departmentScope(actor),
      archivedAt: null,
      completedAt: null,
      tasks: {
        some: {
          OR: [
            { assigneeId: actor.id, status: { not: "DONE" } },
            { assigneeId: null, status: { in: ["READY", "SENT_BACK"] }, template: { roleId: { in: roleIds } } },
          ],
        },
      },
    },
    orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 300,
    select: listItemSelect,
  });

  const defOf = workflowCache();
  const now = new Date();
  const out = { yourTurn: [] as WorkCard[], upForGrabs: [] as WorkCard[], comingUp: [] as WorkCard[] };

  for (const row of rows) {
    const loaded = toLoaded(row, await defOf(row.workflowId));
    if (!canViewItem(actor, visibilityOf(loaded))) continue;
    const ix = new WorkflowIndex(loaded.def);
    for (const task of loaded.state.tasks) {
      const template = ix.template(task.templateId);
      const mine = task.assigneeId === actor.id;
      const pool = !task.assigneeId && roleIds.includes(template.roleId);
      if ((!mine && !pool) || task.status === "DONE") continue;
      const card: WorkCard = {
        taskId: task.id,
        taskName: template.name,
        roleName: template.roleName,
        status: task.status,
        changesRequested: task.changesRequested,
        itemNumber: row.number,
        itemTitle: row.title,
        stageName: ix.stage(row.stageId).name,
        deadline: row.deadline,
        timeZone: row.department.timezone,
        overdue: isOverdue(row.deadline, row.completedAt, now),
      };
      const isActive = isTaskActive(ix, loaded.state, task);
      if (mine) (isActive ? out.yourTurn : out.comingUp).push(card);
      else if (isActive) out.upForGrabs.push(card);
    }
  }
  return out;
}

// ── Item list ────────────────────────────────────────────────────────────

export type ItemRow = {
  number: number;
  title: string;
  deadline: Date | null;
  timeZone: string;
  overdue: boolean;
  stageName: string;
  stagePosition: number;
  isDraft: boolean;
  completedAt: Date | null;
  current: { taskName: string; assigneeName: string | null; status: TaskStatus; changesRequested: boolean }[];
};

export async function listItems(actor: Actor, show: "open" | "completed" | "archived" = "open"): Promise<ItemRow[]> {
  const where: Prisma.ContentItemWhereInput = {
    ...departmentScope(actor),
    ...(show === "archived"
      ? { archivedAt: { not: null } }
      : { archivedAt: null, completedAt: show === "completed" ? { not: null } : null }),
  };
  const rows = await db.contentItem.findMany({
    where,
    orderBy: show === "completed" ? [{ completedAt: "desc" }] : [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 500,
    select: listItemSelect,
  });

  const defOf = workflowCache();
  const now = new Date();
  const out: ItemRow[] = [];
  for (const row of rows) {
    const loaded = toLoaded(row, await defOf(row.workflowId));
    if (!canViewItem(actor, visibilityOf(loaded))) continue;
    const ix = new WorkflowIndex(loaded.def);
    const stage = ix.stage(row.stageId);
    const workIndex = ix.currentWorkIndex(ix.indexOf(row.stageId));
    const currentTemplates = workIndex === null ? [] : ix.stages[workIndex].tasks;
    out.push({
      number: row.number,
      title: row.title,
      deadline: row.deadline,
      timeZone: row.department.timezone,
      overdue: isOverdue(row.deadline, row.completedAt, now),
      stageName: stage.name,
      stagePosition: stage.position,
      isDraft: !row.firstSubmittedAt,
      completedAt: row.completedAt,
      current: currentTemplates.map((template) => {
        const task = row.tasks.find((t) => t.templateId === template.id)!;
        return {
          taskName: template.name,
          assigneeName: task.assignee?.name ?? null,
          status: task.status,
          changesRequested: task.changesRequested,
        };
      }),
    });
  }
  if (show === "open") out.sort((a, b) => a.stagePosition - b.stagePosition);
  return out;
}

// ── Item page ────────────────────────────────────────────────────────────

export type TaskView = {
  id: string;
  templateId: string;
  name: string;
  roleId: string;
  roleName: string;
  stageName: string;
  submitLabel: string;
  status: TaskStatus;
  active: boolean;
  changesRequested: boolean;
  assignee: { id: string; name: string } | null;
};

export type ItemDetail = {
  id: string;
  number: number;
  title: string;
  brief: string;
  deadline: Date | null;
  deadlineInput: string;
  timeZone: string;
  departmentName: string;
  createdByName: string;
  createdAt: Date;
  isDraft: boolean;
  archivedAt: Date | null;
  completedAt: Date | null;
  overdue: boolean;
  stageId: string;
  stageName: string;
  stages: { id: string; name: string; kind: string; state: "done" | "current" | "upcoming" }[];
  tasks: TaskView[];
  script: { version: number; content: ScriptDoc; text: string; authorName: string; savedAt: Date } | null;
  changeRequests: { id: string; taskName: string; body: string; authorName: string; createdAt: Date; canResolve: boolean }[];
  sendBackNotes: { id: string; taskName: string | null; body: string; authorName: string; createdAt: Date }[];
  activity: { id: string; text: string; actorName: string; createdAt: Date }[];
  candidatesByRole: Record<string, { id: string; name: string }[]>;
  stageNames: Record<string, string>;
  templateNames: Record<string, string>;
  actions: ItemActions;
  canEditDetails: boolean;
  canArchive: boolean;
};

const ACTIVITY: Record<string, (d: Record<string, unknown>, name: (id: unknown) => string) => string> = {
  "item.created": () => "created this item",
  "item.updated": () => "edited the title, brief or deadline",
  "item.archived": () => "archived this item",
  "item.restored": () => "restored this item",
  "item.stage_changed": (d) => (d.completed ? "marked it completed" : `moved it from ${d.from} to ${d.to}`),
  "task.started": (d) => (d.pickedUp ? `picked up and started ${d.task}` : `started ${d.task}`),
  "task.submitted": (d) => `${String(d.label ?? "submitted").toLowerCase()} (${d.task})`,
  "task.reopened": (d) => `reopened ${d.task}`,
  "task.picked_up": (d) => `picked up ${d.task}`,
  "task.reassigned": (d, name) =>
    d.fromUserId ? `reassigned ${d.task} from ${name(d.fromUserId)} to ${name(d.toUserId)}` : `assigned ${d.task} to ${name(d.toUserId)}`,
  "task.changes_requested": (d) => `requested changes on ${d.task}`,
  "task.change_request_resolved": () => "marked a change request as done",
  "task.sent_back": (d) =>
    `sent it back from ${d.from} to ${d.to}${Array.isArray(d.targets) && d.targets.length > 1 ? ` (${d.targets.join(" and ")})` : ""}`,
  "script.saved": (d) => `saved script version ${d.version}`,
};

export async function getItemDetail(actor: Actor, numberParam: string): Promise<ItemDetail | null> {
  const parsed = itemNumberSchema.safeParse(numberParam);
  if (!parsed.success) return null;

  const row = await db.contentItem.findFirst({
    where: { organizationId: actor.organizationId, number: parsed.data },
    select: {
      ...listItemSelect,
      brief: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });
  if (!row) return null;
  const def = await loadWorkflowDef(db, row.workflowId);
  const loaded = toLoaded(row, def);
  if (!canViewItem(actor, visibilityOf(loaded))) return null;

  const ix = new WorkflowIndex(def);
  const state: ItemState = loaded.state;
  const currentIndex = ix.indexOf(row.stageId);
  const isManager = canManageDepartmentItems(actor, row.departmentId);

  const [script, comments, audit, memberships] = await Promise.all([
    row.latestScriptVersion > 0
      ? db.scriptVersion.findUnique({
          where: { itemId_number: { itemId: row.id, number: row.latestScriptVersion } },
          select: { number: true, content: true, plainText: true, createdAt: true, author: { select: { name: true } } },
        })
      : null,
    db.comment.findMany({
      where: {
        itemId: row.id,
        deletedAt: null,
        OR: [{ kind: "CHANGE_REQUEST", resolvedAt: null }, { kind: "SEND_BACK" }],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, kind: true, body: true, taskId: true, authorId: true, createdAt: true, author: { select: { name: true } } },
    }),
    db.auditLog.findMany({
      where: { itemId: row.id },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, action: true, data: true, createdAt: true, actor: { select: { name: true } } },
    }),
    db.membership.findMany({
      where: {
        ...activeRoleHolders(actor.organizationId),
        roleId: { in: [...new Set(ix.stages.flatMap((s) => s.tasks.map((t) => t.roleId)))] },
      },
      orderBy: { user: { name: "asc" } },
      select: { roleId: true, user: { select: { id: true, name: true } } },
    }),
  ]);

  const taskById = new Map(row.tasks.map((t) => [t.id, t]));
  const templateName = (taskId: string | null) => (taskId ? ix.template(taskById.get(taskId)!.templateId).name : null);

  // Names for people mentioned in audit data (reassignments).
  const mentioned = new Set<string>();
  for (const a of audit) {
    const d = (a.data ?? {}) as Record<string, unknown>;
    for (const key of ["fromUserId", "toUserId"]) if (typeof d[key] === "string") mentioned.add(d[key] as string);
  }
  const names = new Map(
    (mentioned.size
      ? await db.user.findMany({
          where: { id: { in: [...mentioned] }, orgMemberships: { some: { organizationId: actor.organizationId } } },
          select: { id: true, name: true },
        })
      : []
    ).map((u) => [u.id, u.name]),
  );

  const candidatesByRole: Record<string, { id: string; name: string }[]> = {};
  for (const m of memberships) (candidatesByRole[m.roleId] ??= []).push(m.user);

  return {
    id: row.id,
    number: row.number,
    title: row.title,
    brief: row.brief,
    deadline: row.deadline,
    deadlineInput: row.deadline ? dateInputValue(row.deadline, row.department.timezone) : "",
    timeZone: row.department.timezone,
    departmentName: row.department.name,
    createdByName: row.createdBy.name,
    createdAt: row.createdAt,
    isDraft: !row.firstSubmittedAt,
    archivedAt: row.archivedAt,
    completedAt: row.completedAt,
    overdue: isOverdue(row.deadline, row.completedAt),
    stageId: row.stageId,
    stageName: ix.stage(row.stageId).name,
    stages: ix.stages.map((s, i) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      state: row.completedAt || i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming",
    })),
    tasks: ix.stages.flatMap((stage) =>
      stage.tasks.map((template) => {
        const task = row.tasks.find((t) => t.templateId === template.id)!;
        return {
          id: task.id,
          templateId: template.id,
          name: template.name,
          roleId: template.roleId,
          roleName: template.roleName,
          stageName: stage.name,
          submitLabel: template.submitLabel,
          status: task.status,
          active: isTaskActive(ix, state, task),
          changesRequested: task.changesRequested,
          assignee: task.assigneeId ? { id: task.assigneeId, name: task.assignee?.name ?? "Unknown" } : null,
        };
      }),
    ),
    script: script
      ? {
          version: script.number,
          content: isScriptDoc(script.content) ? script.content : textToDoc(script.plainText),
          text: script.plainText || docToText(script.content),
          authorName: script.author.name,
          savedAt: script.createdAt,
        }
      : null,
    changeRequests: comments
      .filter((c) => c.kind === "CHANGE_REQUEST")
      .map((c) => ({
        id: c.id,
        taskName: templateName(c.taskId) ?? "",
        body: c.body,
        authorName: c.author.name,
        createdAt: c.createdAt,
        canResolve: isManager || c.authorId === actor.id || (c.taskId ? taskById.get(c.taskId)?.assigneeId === actor.id : false),
      })),
    sendBackNotes: comments
      .filter((c) => c.kind === "SEND_BACK")
      .slice(0, 5)
      .map((c) => ({ id: c.id, taskName: templateName(c.taskId), body: c.body, authorName: c.author.name, createdAt: c.createdAt })),
    activity: audit.map((a) => {
      const data = (a.data ?? {}) as Record<string, unknown>;
      const describe = ACTIVITY[a.action];
      return {
        id: a.id,
        text: describe ? describe(data, (id) => names.get(String(id)) ?? "someone") : a.action,
        actorName: a.actor?.name ?? "System",
        createdAt: a.createdAt,
      };
    }),
    candidatesByRole,
    stageNames: Object.fromEntries(ix.stages.map((s) => [s.id, s.name])),
    templateNames: Object.fromEntries(ix.stages.flatMap((s) => s.tasks.map((t) => [t.id, t.name]))),
    actions: describeActions(def, state, actor),
    canEditDetails: !row.archivedAt && !row.completedAt && canEditItemDetails(actor, { ...state, createdById: row.createdById }),
    canArchive: isManager,
  };
}
