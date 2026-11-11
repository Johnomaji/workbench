/**
 * Types for the workflow state machine. Plain data only: no Prisma, no Next.js,
 * so the engine can be unit-tested and reused by the seed.
 */

export type StageKind = "WORK" | "QUEUE" | "DONE";
export type TaskStatus = "LOCKED" | "READY" | "IN_PROGRESS" | "SENT_BACK" | "DONE";

export type TaskTemplateDef = {
  id: string;
  key: string;
  name: string;
  roleId: string;
  roleName: string;
  position: number;
  canEditScript: boolean;
  submitLabel: string;
};

export type StageDef = {
  id: string;
  key: string;
  name: string;
  position: number;
  kind: StageKind;
  /** Only WORK stages have tasks. Two or more tasks run in parallel. */
  tasks: TaskTemplateDef[];
};

export type WorkflowDef = {
  id: string;
  stages: StageDef[];
};

export type TaskState = {
  id: string;
  templateId: string;
  assigneeId: string | null;
  status: TaskStatus;
  changesRequested: boolean;
};

export type ItemState = {
  id: string;
  departmentId: string;
  stageId: string;
  firstSubmittedAt: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  latestScriptVersion: number;
  tasks: TaskState[];
};

/** Someone who could be given a task. */
export type CandidateUser = { id: string; isActive: boolean; roleIds: string[] };

export type Command =
  | { type: "start"; taskId: string }
  | { type: "submit"; taskId: string }
  | { type: "reopen"; taskId: string }
  | { type: "pickUp"; taskId: string }
  | { type: "assign"; taskId: string; to: CandidateUser; note: string | null }
  | { type: "requestChanges"; taskId: string; comment: string }
  | {
      type: "sendBack";
      /** The sender's own task. Managers may send back without one. */
      fromTaskId: string | null;
      comment: string;
      /** Defaults to the previous work stage. Managers may pick any earlier work stage. */
      targetStageId?: string;
      /** Required when the target stage has parallel tasks. */
      targetTemplateIds?: string[];
    };

export type NotificationKind =
  | "TASK_READY"
  | "SENT_BACK"
  | "REASSIGNED_TO_YOU"
  | "REASSIGNED_AWAY"
  | "CHANGES_REQUESTED"
  | "ON_HOLD"
  | "RESUMED";

/** A specific person, or everyone with a role (for unassigned tasks). */
export type Recipient = { userId: string } | { roleId: string };

export type AuditData = Record<string, string | number | boolean | null | string[]>;

export type ItemAuditAction =
  | "item.stage_changed"
  | "task.started"
  | "task.submitted"
  | "task.reopened"
  | "task.picked_up"
  | "task.reassigned"
  | "task.changes_requested"
  | "task.sent_back"
  | "script.saved";

export type Effect =
  | { kind: "notify"; type: NotificationKind; taskId: string; to: Recipient }
  | { kind: "assignment"; taskId: string; fromUserId: string | null; toUserId: string; note: string | null }
  | { kind: "comment"; commentKind: "SEND_BACK" | "CHANGE_REQUEST"; taskId: string | null; body: string }
  | { kind: "scriptSnapshot"; taskId: string }
  | { kind: "resolveChangeRequests"; taskId: string }
  | { kind: "audit"; action: ItemAuditAction; taskId?: string; data: AuditData };

export type EngineResult =
  | { ok: true; item: ItemState; effects: Effect[] }
  | { ok: false; reason: string };
