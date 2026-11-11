"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { orgPath } from "@/lib/org-path";
import { toErrorState } from "@/server/action-errors";
import { requireOrgAdminForAction } from "@/server/auth/session";
import { updateOrganization } from "@/server/orgs/organizations";
import { enforceRateLimit, RATE_LIMITS, rateLimitKey } from "@/server/providers/rate-limit";
import { getClientIp } from "@/server/request";

export async function updateOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let moved: string | null = null;
  try {
    const actor = await requireOrgAdminForAction(formData.get("org"));
    await enforceRateLimit(rateLimitKey.adminActionsByUser(actor.id), RATE_LIMITS.adminActionsByUser);
    const ip = getClientIp(await headers());
    const { slug } = await updateOrganization(actor, { name: formData.get("name"), slug: formData.get("slug") }, ip);
    if (slug !== actor.organization.slug) moved = slug;
  } catch (error) {
    return toErrorState(error);
  }
  // The header lists the person's organizations by name and address; it's in
  // the shared layout, which a plain refresh or redirect would keep as it was.
  revalidatePath("/", "layout");
  // The old address is gone: carry on at the new one.
  if (moved) redirect(orgPath(moved, "/admin/settings?moved=1"));
  return { status: "success", message: "Saved." };
}
