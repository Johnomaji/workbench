import { z } from "zod";
import { emailSchema, newPasswordSchema, PASSWORD_MAX_BYTES, byteLength } from "./common";

/** Sign-in. Deliberately loose on the password: only reject what bcrypt can't handle. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, { error: "Enter your password." })
    .refine((value) => byteLength(value) <= PASSWORD_MAX_BYTES, {
      error: "Incorrect email or password.",
    }),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const setPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: "The passwords don't match.",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Enter your current password." }),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: "The passwords don't match.",
    path: ["confirmPassword"],
  })
  .refine((v) => v.password !== v.currentPassword, {
    error: "Choose a password that's different from your current one.",
    path: ["password"],
  });
