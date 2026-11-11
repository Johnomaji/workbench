import "server-only";
import { db } from "@/server/db";
import { listItemSelect, toLoaded, workflowCache } from "@/server/items/queries";
import { visibilityOf } from "@/server/items/state";
import { canCreateItem, canViewItem, type Actor } from "@/server/permissions/policy";
import { loadWorkflowDef } from "@/server/workflow/load";
import { buildBoard, defaultStage, type BoardColumn, type BoardFilter, type BoardItemInput } from "./model";

/** Completed items stay on the board this long; older ones are under All items → Completed. */
export const BOARD_COMPLETED_DAYS = 14;
const MAX_ITEMS = 1000;

export type BoardData = {
  departments: { key: string; name: string }[];
  department: { key: string; name: string; timeZone: string } | null;
  columns: BoardColumn[];
  /** People in the department, for the person filter. */
  people: { id: string; name: string }[];
  total: number;
  matched: number;
  /** The stage a phone shows first. */
  defaultStage: string | null;
  canCreate: boolean;
};

export async function getBoard(actor: Actor, filter: BoardFilter & { dept?: string }, now = new Date()): Promise<BoardData> {
  const departments = await db.department.findMany({
    where: {
      organizationId: actor.organizationId,
      isActive: true,
      ...(actor.isAdmin ? {} : { id: { in: [...new Set(actor.memberships.map((m) => m.departmentId))] } }),
    },
    orderBy: { name: "asc" },
    select: { id: true, key: true, name: true, timezone: true },
  });
  const department = departments.find((d) => d.key === filter.dept) ?? departments[0];
  const base: BoardData = {
    departments: departments.map(({ key, name }) => ({ key, name })),
    department: null,
    columns: [],
    people: [],
    total: 0,
    matched: 0,
    defaultStage: null,
    canCreate: false,
  };
  if (!department) return base;

  const workflow = await db.workflow.findFirst({
    where: { departmentId: department.id, isActive: true },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!workflow) return { ...base, department: { key: department.key, name: department.name, timeZone: department.timezone } };

  const completedSince = new Date(now.getTime() - BOARD_COMPLETED_DAYS * 24 * 3600 * 1000);
  const [layout, rows, memberships] = await Promise.all([
    loadWorkflowDef(db, workflow.id),
    db.contentItem.findMany({
      where: {
        organizationId: actor.organizationId,
        departmentId: department.id,
        archivedAt: null,
        OR: [{ completedAt: null }, { completedAt: { gte: completedSince } }],
      },
      orderBy: { number: "asc" },
      take: MAX_ITEMS,
      select: listItemSelect,
    }),
    db.membership.findMany({
      where: {
        organizationId: actor.organizationId,
        role: { departmentId: department.id },
        user: { isActive: true },
        member: { isActive: true },
      },
      distinct: ["userId"],
      orderBy: { user: { name: "asc" } },
      select: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const defOf = workflowCache();
  const items: BoardItemInput[] = [];
  for (const row of rows) {
    const def = row.workflowId === layout.id ? layout : await defOf(row.workflowId);
    if (!canViewItem(actor, visibilityOf(toLoaded(row, def)))) continue;
    items.push({
      number: row.number,
      title: row.title,
      deadline: row.deadline,
      completedAt: row.completedAt,
      firstSubmittedAt: row.firstSubmittedAt,
      stageId: row.stageId,
      def,
      tasks: row.tasks.map((t) => ({
        templateId: t.templateId,
        assigneeId: t.assigneeId,
        assigneeName: t.assignee?.name ?? null,
        status: t.status,
        changesRequested: t.changesRequested,
      })),
    });
  }

  const board = buildBoard({ layout, items, filter, actorId: actor.id, timeZone: department.timezone, now });
  return {
    ...base,
    department: { key: department.key, name: department.name, timeZone: department.timezone },
    columns: board.columns,
    people: memberships.map((m) => m.user),
    total: board.total,
    matched: board.matched,
    defaultStage: defaultStage(board.columns, actor.id),
    canCreate: canCreateItem(actor, department.id),
  };
}
