"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { orgPath } from "@/lib/org-path";
import { toErrorState } from "@/server/action-errors";
import { requireOrgUserForAction } from "@/server/auth/session";
import {
  createItem,
  reassignTask,
  requestChanges,
  resolveChangeRequest,
  runTaskCommand,
  saveScript,
  sendBack,
  setItemArchived,
  updateItemDetails,
} from "@/server/items/commands";
import { enforceRateLimit, RATE_LIMITS, rateLimitKey } from "@/server/providers/rate-limit";
import { getClientIp } from "@/server/request";
import { formToObject } from "@/server/validation/users";

/**
 * Every item action re-checks the session and membership of the organization
 * named in the form, is rate limited, and records the IP. Everything the action
 * then touches is looked up inside that organization.
 */
async function context(formData: FormData) {
  const actor = await requireOrgUserForAction(formData.get("org"));
  await enforceRateLimit(rateLimitKey.itemActionsByUser(actor.id), RATE_LIMITS.itemActionsByUser);
  return { actor, ip: getClientIp(await headers()) };
}

function done(message: string): ActionState {
  refresh();
  return { status: "success", message };
}

export async function createItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let number: number;
  let slug: string;
  try {
    const { actor, ip } = await context(formData);
    const assignees: Record<string, string> = {};
    for (const [key, value] of formData) {
      if (key.startsWith("assignee_") && typeof value === "string" && value) assignees[key.slice("assignee_".length)] = value;
    }
    slug = actor.organization.slug;
    ({ number } = await createItem(
      actor,
      {
        departmentId: formData.get("departmentId"),
        title: formData.get("title"),
        brief: formData.get("brief"),
        deadline: formData.get("deadline"),
        assignees,
      },
      ip,
    ));
  } catch (error) {
    return toErrorState(error);
  }
  redirect(orgPath(slug, `/items/${number}`));
}

const TASK_MESSAGES = {
  start: "Started. It's yours now.",
  pickUp: "Picked up. It's yours now.",
  reopen: "Reopened. Submit it again when you're done.",
  submit: "Done. The next person has been told.",
} as const;

export async function taskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor, ip } = await context(formData);
    const input = formToObject(formData);
    const result = await runTaskCommand(actor, input, ip);
    const intent = String(input.intent) as keyof typeof TASK_MESSAGES;
    return done(result.completed ? "Approved. This item is complete." : (TASK_MESSAGES[intent] ?? "Saved."));
  } catch (error) {
    return toErrorState(error);
  }
}

export async function sendBackAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor, ip } = await context(formData);
    await sendBack(actor, formToObject(formData, ["targetTemplateIds"]), ip);
    return done("Sent back. They've been told why.");
  } catch (error) {
    return toErrorState(error);
  }
}

export async function reassignAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor, ip } = await context(formData);
    await reassignTask(actor, formToObject(formData), ip);
    return done("Reassigned. They've been told.");
  } catch (error) {
    return toErrorState(error);
  }
}

export async function requestChangesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor, ip } = await context(formData);
    await requestChanges(actor, formToObject(formData), ip);
    return done("Change request sent.");
  } catch (error) {
    return toErrorState(error);
  }
}

export async function resolveChangeRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor, ip } = await context(formData);
    await resolveChangeRequest(actor, formToObject(formData), ip);
    return done("Marked as done.");
  } catch (error) {
    return toErrorState(error);
  }
}

export async function saveScriptAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor, ip } = await context(formData);
    const result = await saveScript(actor, formToObject(formData), ip);
    return done(result.unchanged ? "No changes to save." : `Saved as version ${result.version}.`);
  } catch (error) {
    return toErrorState(error);
  }
}

export async function updateDetailsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor, ip } = await context(formData);
    await updateItemDetails(actor, formToObject(formData), ip);
    return done("Details saved.");
  } catch (error) {
    return toErrorState(error);
  }
}

export async function archiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor, ip } = await context(formData);
    const input = formToObject(formData);
    await setItemArchived(actor, input, ip);
    return done(input.archived === "true" ? "Archived. It's hidden from the main list." : "Restored.");
  } catch (error) {
    return toErrorState(error);
  }
}
