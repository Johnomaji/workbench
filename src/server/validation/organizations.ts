import { z } from "zod";
import { SLUG_MAX_LENGTH, SLUG_PATTERN, slugProblem } from "@/lib/org-slug";
import { emailSchema, nameSchema, newPasswordSchema } from "./common";

export const organizationNameSchema = z
  .string({ error: "Enter the organization's name." })
  .trim()
  .min(2, { error: "Use at least 2 characters." })
  .max(80, { error: "Keep the name under 80 characters." });

/** A slug someone is choosing: format and reserved words (availability is checked against the database). */
export const organizationSlugSchema = z
  .string({ error: "Choose a web address." })
  .trim()
  .toLowerCase()
  .superRefine((value, ctx) => {
    const problem = slugProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

/** A slug from a URL or a form, used to look an organization up. Never trusted beyond that. */
export const orgParamSchema = z.string().max(SLUG_MAX_LENGTH).regex(SLUG_PATTERN);

export const organizationSchema = z.object({
  name: organizationNameSchema,
  slug: organizationSlugSchema,
});

export const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  organizationName: organizationNameSchema,
  organizationSlug: organizationSlugSchema,
});

export const completeSignupSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: "The passwords don't match.",
    path: ["confirmPassword"],
  });

export const organizationIdSchema = z.object({ organizationId: z.string().min(1).max(64).regex(/^[a-z0-9]+$/i) });

export const profileSchema = z.object({ name: nameSchema });
