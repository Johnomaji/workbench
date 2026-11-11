"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { orgPath } from "@/lib/org-path";
import { toErrorState } from "@/server/action-errors";
import { requireUserForAction } from "@/server/auth/session";
import { createOrganization } from "@/server/orgs/organizations";
import { getClientIp } from "@/server/request";

export async function createOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let slug: string;
  try {
    const user = await requireUserForAction();
    const ip = getClientIp(await headers());
    ({ slug } = await createOrganization(
      user,
      { name: formData.get("name"), slug: formData.get("slug"), timeZone: formData.get("timeZone") },
      ip,
    ));
  } catch (error) {
    return toErrorState(error);
  }
  // The header's organization list lives in the shared layout; make it include the new one.
  revalidatePath("/", "layout");
  redirect(orgPath(slug));
}
