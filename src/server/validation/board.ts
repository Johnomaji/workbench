import { z } from "zod";
import { BOARD_DEADLINES, BOARD_STATUSES } from "@/server/board/model";
import { idSchema } from "./common";

const keySchema = z.string().max(64).regex(/^[a-z0-9_-]+$/i);

/** Board filters from the URL. Anything unexpected is ignored rather than an error. */
export const boardFilterSchema = z.object({
  dept: keySchema.optional().catch(undefined),
  person: z.union([z.enum(["me", "unassigned"]), idSchema]).optional().catch(undefined),
  deadline: z.enum(BOARD_DEADLINES).optional().catch(undefined),
  status: z.enum(BOARD_STATUSES).optional().catch(undefined),
  /** The stage shown on a phone. */
  stage: keySchema.optional().catch(undefined),
});

export type BoardSearch = z.infer<typeof boardFilterSchema>;
