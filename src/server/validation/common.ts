import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt ignores everything after 72 bytes, so longer passwords are rejected. */
export const PASSWORD_MAX_BYTES = 72;

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export const emailSchema = z
  .string({ error: "Enter an email address." })
  .trim()
  .toLowerCase()
  .min(1, { error: "Enter an email address." })
  .max(254, { error: "That email address is too long." })
  .pipe(z.email({ error: "Enter a valid email address, like name@example.com." }));

export const nameSchema = z
  .string({ error: "Enter a name." })
  .trim()
  .min(1, { error: "Enter a name." })
  .max(100, { error: "Keep the name under 100 characters." });

export const newPasswordSchema = z
  .string({ error: "Enter a password." })
  .min(PASSWORD_MIN_LENGTH, {
    error: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .refine((value) => byteLength(value) <= PASSWORD_MAX_BYTES, {
    error: "That password is too long. Use 72 characters or fewer.",
  })
  .refine((value) => value.trim().length > 0, { error: "Enter a password." });

/** Identifiers from URLs and hidden fields (cuid). */
export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, { error: "Invalid id." });

/**
 * HTML checkbox: present ("on") when ticked, missing from the form when not.
 * Must be .optional() so a missing key isn't an error.
 */
export const checkboxSchema = z
  .enum(["on", "true", "false"])
  .nullish()
  .transform((value) => value === "on" || value === "true");

/** Turns Zod issues into { field: [messages] } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
