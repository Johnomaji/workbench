import { z } from "zod";
import { SCRIPT_JSON_MAX } from "./script";
import { idSchema } from "./common";

const optionalId = z.preprocess((v) => (v === "" || v === null ? undefined : v), idSchema.optional());

export const titleSchema = z
  .string({ error: "Give it a title." })
  .trim()
  .min(1, { error: "Give it a title." })
  .max(200, { error: "Keep the title under 200 characters." });

export const briefSchema = z
  .string()
  .trim()
  .max(10_000, { error: "Keep the brief under 10,000 characters." })
  .catch("")
  .default("");

/** "" (no deadline) or a calendar date from <input type="date">. */
export const deadlineSchema = z
  .union([z.literal(""), z.iso.date({ error: "Pick a valid date." })])
  .nullish()
  .transform((v) => v || null);

export const commentSchema = z
  .string({ error: "Add a comment." })
  .trim()
  .min(1, { error: "Add a comment." })
  .max(5_000, { error: "Keep it under 5,000 characters." });

export const itemNumberSchema = z.coerce.number().int().positive().max(2_147_483_647);

export const createItemSchema = z.object({
  departmentId: idSchema,
  title: titleSchema,
  brief: briefSchema,
  deadline: deadlineSchema,
  /** templateId → userId. Empty means "leave it for anyone with the role". */
  assignees: z.record(idSchema, idSchema).default({}),
});

export const taskCommandSchema = z.object({
  itemId: idSchema,
  taskId: idSchema,
  intent: z.enum(["start", "submit", "reopen", "pickUp"]),
});

export const sendBackSchema = z.object({
  itemId: idSchema,
  fromTaskId: optionalId,
  comment: commentSchema,
  targetStageId: optionalId,
  targetTemplateIds: z.array(idSchema).max(20).default([]),
});

export const reassignSchema = z.object({
  itemId: idSchema,
  taskId: idSchema,
  toUserId: idSchema,
  note: z
    .string()
    .trim()
    .max(500, { error: "Keep the note under 500 characters." })
    .nullish()
    .transform((v) => v || null),
});

export const requestChangesSchema = z.object({
  itemId: idSchema,
  taskId: idSchema,
  comment: commentSchema,
});

export const resolveChangeRequestSchema = z.object({ commentId: idSchema });

export const saveScriptSchema = z.object({
  itemId: idSchema,
  baseVersion: z.coerce.number().int().min(0),
  /** The editor document as JSON; checked against the editor schema by parseScriptContent. */
  content: z.string().max(SCRIPT_JSON_MAX, { error: "The script is too long to save." }),
});

export const itemDetailsSchema = z.object({
  itemId: idSchema,
  title: titleSchema,
  brief: briefSchema,
  deadline: deadlineSchema,
});

export const archiveSchema = z.object({
  itemId: idSchema,
  archived: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export const itemListFilterSchema = z.object({
  show: z.enum(["open", "completed", "archived"]).optional().catch(undefined),
});
