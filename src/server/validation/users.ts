import { z } from "zod";
import { checkboxSchema, emailSchema, idSchema, nameSchema, newPasswordSchema } from "./common";

const roleIdsSchema = z
  .array(idSchema)
  .max(50)
  .transform((ids) => [...new Set(ids)]);

const userFields = {
  name: nameSchema,
  email: emailSchema,
  isAdmin: checkboxSchema,
  roleIds: roleIdsSchema,
};

function requireRoleOrAdmin(v: { isAdmin: boolean; roleIds: string[] }) {
  return v.isAdmin || v.roleIds.length > 0;
}

const roleOrAdminIssue = {
  error: "Pick at least one role, or make this person an administrator.",
  path: ["roleIds"],
};

export const createUserSchema = z
  .object({
    ...userFields,
    setup: z.enum(["invite", "temporary"], { error: "Choose how they'll sign in." }),
    temporaryPassword: z.string().optional(),
  })
  .refine(requireRoleOrAdmin, roleOrAdminIssue)
  .superRefine((v, ctx) => {
    if (v.setup !== "temporary") return;
    const result = newPasswordSchema.safeParse(v.temporaryPassword ?? "");
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: "custom", message: issue.message, path: ["temporaryPassword"] });
      }
    }
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * Name and email are left out for accounts the organization doesn't manage on
 * its own (they're shown read-only); the service keeps the current values then.
 */
export const updateUserSchema = z
  .object({
    userId: idSchema,
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    isAdmin: checkboxSchema,
    roleIds: roleIdsSchema,
  })
  .refine(requireRoleOrAdmin, roleOrAdminIssue);

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const temporaryPasswordSchema = z.object({
  userId: idSchema,
  temporaryPassword: newPasswordSchema,
});

export const userIdSchema = z.object({ userId: idSchema });

export const userListFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(["all", "active", "deactivated", "pending"]).optional().catch(undefined),
});

/** FormData → plain object; repeated fields listed in `arrays` become arrays. */
export function formToObject(formData: FormData, arrays: string[] = []) {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    out[key] = arrays.includes(key) ? formData.getAll(key) : formData.get(key);
  }
  for (const key of arrays) out[key] ??= [];
  return out;
}
