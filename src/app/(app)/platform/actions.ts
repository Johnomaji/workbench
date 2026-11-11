"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import type { ActionState } from "@/lib/action-state";
import { toErrorState } from "@/server/action-errors";
import { requirePlatformAdminForAction } from "@/server/auth/session";
import { setOrganizationActive } from "@/server/orgs/organizations";
import { enforceRateLimit, RATE_LIMITS, rateLimitKey } from "@/server/providers/rate-limit";
import { getClientIp } from "@/server/request";

export async function setOrganizationActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const activate = formData.get("intent") === "reactivate";
  try {
    const user = await requirePlatformAdminForAction();
    await enforceRateLimit(rateLimitKey.platformActionsByUser(user.id), RATE_LIMITS.platformActionsByUser);
    const ip = getClientIp(await headers());
    await setOrganizationActive(user, { organizationId: formData.get("organizationId") }, activate, ip);
  } catch (error) {
    return toErrorState(error);
  }
  refresh();
  return {
    status: "success",
    message: activate ? "Reactivated. Its members can open it again." : "Suspended. Nobody can open it until you reactivate it.",
  };
}
