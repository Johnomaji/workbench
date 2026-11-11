/**
 * Test helpers: the Media workflow as a definition with readable ids, test
 * people for each role, and a small runner. Imported by tests only.
 */
import type { Actor } from "@/server/permissions/policy";
import { applyCommand, planNewItem } from "./engine";
import { MEDIA_ROLES, MEDIA_STAGES, type MediaRoleKey } from "./media-template";
import type { CandidateUser, Command, Effect, EngineResult, ItemState, TaskStatus, WorkflowDef } from "./types";

export const ORG = "org_acme";
export const OTHER_ORG = "org_globex";
export const DEPT = "dept_media";
export const OTHER_DEPT = "dept_other";
export const NOW = new Date("2026-11-07T12:00:00Z");

export const S = Object.fromEntries(MEDIA_STAGES.map((s) => [s.key, `stage:${s.key}`])) as Record<
  "DRAFTING" | "READY_FOR_EDITING" | "IN_EDITING" | "APPROVED_SCRIPT" | "IN_PRODUCTION" | "READY_FOR_REVIEW" | "COMPLETED",
  string
>;

export type TaskKey = "SCRIPT" | "EDIT" | "DESIGN" | "VIDEO" | "REVIEW";
export const tpl = (key: TaskKey) => `tpl:${key}`;
export const task = (key: TaskKey) => `task:${key}`;
export const role = (key: MediaRoleKey) => `role:${key}`;

export function mediaDef(): WorkflowDef {
  const roleNames = Object.fromEntries(MEDIA_ROLES.map((r) => [r.key, r.name]));
  return {
    id: "wf_media",
    stages: MEDIA_STAGES.map((s, i) => ({
      id: `stage:${s.key}`,
      key: s.key,
      name: s.name,
      position: i + 1,
      kind: s.kind,
      tasks: (s.tasks ?? []).map((t, j) => ({
        id: tpl(t.key as TaskKey),
        key: t.key,
        name: t.name,
        roleId: role(t.role),
        roleName: roleNames[t.role],
        position: j + 1,
        canEditScript: t.canEditScript,
        submitLabel: t.submitLabel,
      })),
    })),
  };
}

export function person(
  id: string,
  roles: MediaRoleKey[],
  options: { isAdmin?: boolean; isActive?: boolean; departmentId?: string; organizationId?: string } = {},
): Actor {
  const departmentId = options.departmentId ?? DEPT;
  const organizationId = options.organizationId ?? ORG;
  return {
    id,
    isAdmin: options.isAdmin ?? false,
    isActive: options.isActive ?? true,
    organizationId,
    // Media and Other belong to ORG; a person from another organization sees neither.
    orgDepartmentIds: organizationId === ORG ? [DEPT, OTHER_DEPT] : [departmentId],
    memberships: roles.map((key) => {
      const r = MEDIA_ROLES.find((x) => x.key === key)!;
      return {
        roleId: departmentId === DEPT ? role(key) : `${departmentId}:${key}`,
        roleKey: key,
        roleName: r.name,
        departmentId,
        departmentName: departmentId === DEPT ? "Media" : "Other",
        canCreateItems: r.canCreateItems,
        canManageItems: r.canManageItems,
      };
    }),
  };
}

export const people = {
  admin: person("u_admin", [], { isAdmin: true }),
  pm: person("u_pm", ["PROJECT_MANAGER"]),
  writer: person("u_writer", ["SCRIPT_WRITER"]),
  writer2: person("u_writer2", ["SCRIPT_WRITER"]),
  editor: person("u_editor", ["CONTENT_EDITOR"]),
  editor2: person("u_editor2", ["CONTENT_EDITOR"]),
  designer: person("u_designer", ["GRAPHIC_DESIGNER"]),
  designer2: person("u_designer2", ["GRAPHIC_DESIGNER"]),
  video: person("u_video", ["VIDEO_EDITOR"]),
  video2: person("u_video2", ["VIDEO_EDITOR"]),
  outsider: person("u_outsider", ["PROJECT_MANAGER"], { departmentId: OTHER_DEPT }),
  formerVideo: person("u_former", ["VIDEO_EDITOR"], { isActive: false }),
  /** Administrator of a different organization (customer). */
  foreignAdmin: person("u_foreign_admin", [], { isAdmin: true, organizationId: OTHER_ORG, departmentId: "dept_globex" }),
};

export function candidate(actor: Actor): CandidateUser {
  return { id: actor.id, isActive: actor.isActive, roleIds: actor.memberships.map((m) => m.roleId) };
}

/** A new item created by `creator`, optionally with tasks pre-assigned. */
export function newItem(creator: Actor, assignees: Partial<Record<TaskKey, Actor>> = {}): ItemState {
  const def = mediaDef();
  const planned = planNewItem(
    def,
    DEPT,
    creator,
    Object.fromEntries(Object.entries(assignees).map(([k, a]) => [tpl(k as TaskKey), candidate(a!)])),
  );
  if (!planned.ok) throw new Error(planned.reason);
  return {
    id: "item_1",
    departmentId: DEPT,
    stageId: planned.plan.stageId,
    firstSubmittedAt: null,
    completedAt: null,
    archivedAt: null,
    latestScriptVersion: 0,
    tasks: planned.plan.tasks.map((t) => ({
      id: t.templateId.replace("tpl:", "task:"),
      templateId: t.templateId,
      assigneeId: t.assigneeId,
      status: t.status,
      changesRequested: false,
    })),
  };
}

/** Steps an item through commands, keeping every effect for assertions. */
export class Flow {
  readonly def = mediaDef();
  effects: Effect[] = [];
  lastEffects: Effect[] = [];

  constructor(public item: ItemState) {}

  /** Applies a command and throws if it's refused. */
  do(actor: Actor, command: Command): this {
    const result = this.try(actor, command);
    if (!result.ok) throw new Error(`Refused: ${result.reason}`);
    return this;
  }

  /** Applies a command and returns the result; state only changes on success. */
  try(actor: Actor, command: Command): EngineResult {
    const result = applyCommand(this.def, this.item, actor, command, NOW);
    if (result.ok) {
      this.item = result.item;
      this.lastEffects = result.effects;
      this.effects.push(...result.effects);
    }
    return result;
  }

  withScript(): this {
    this.item = { ...this.item, latestScriptVersion: Math.max(1, this.item.latestScriptVersion) };
    return this;
  }

  status(key: TaskKey): TaskStatus {
    return this.item.tasks.find((t) => t.id === task(key))!.status;
  }

  assignee(key: TaskKey): string | null {
    return this.item.tasks.find((t) => t.id === task(key))!.assigneeId;
  }

  statuses(): Record<TaskKey, TaskStatus> {
    return Object.fromEntries(this.item.tasks.map((t) => [t.id.replace("task:", ""), t.status])) as Record<TaskKey, TaskStatus>;
  }

  stage(): string {
    return this.item.stageId;
  }

  notified(type: string, effects: Effect[] = this.lastEffects) {
    return effects.filter((e) => e.kind === "notify" && e.type === type) as Extract<Effect, { kind: "notify" }>[];
  }
}

/** Standard path: script written and approved, item waiting for design and video. */
export function itemAtScriptApproved(): Flow {
  const flow = new Flow(
    newItem(people.pm, {
      SCRIPT: people.writer,
      EDIT: people.editor,
      DESIGN: people.designer,
      VIDEO: people.video,
      REVIEW: people.pm,
    }),
  );
  return flow
    .withScript()
    .do(people.writer, { type: "submit", taskId: task("SCRIPT") })
    .do(people.editor, { type: "start", taskId: task("EDIT") })
    .do(people.editor, { type: "submit", taskId: task("EDIT") });
}

/** The designer has started, so the item is at "Design & video" and either lane can submit. */
export function itemInProduction(): Flow {
  return itemAtScriptApproved().do(people.designer, { type: "start", taskId: task("DESIGN") });
}
