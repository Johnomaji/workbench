import type { RateLimitRule } from "./types";

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/**
 * Limits for sensitive endpoints.
 * Per-IP limits are generous because a whole office often shares one IP.
 */
export const RATE_LIMITS = {
  loginByIp: { max: 100, windowSeconds: 15 * MINUTE },
  loginByEmail: { max: 10, windowSeconds: 15 * MINUTE },
  passwordResetByIp: { max: 20, windowSeconds: HOUR },
  passwordResetByEmail: { max: 3, windowSeconds: HOUR },
  setPasswordByIp: { max: 20, windowSeconds: 15 * MINUTE },
  changePasswordByUser: { max: 10, windowSeconds: 15 * MINUTE },
  adminActionsByUser: { max: 60, windowSeconds: MINUTE },
  itemActionsByUser: { max: 120, windowSeconds: MINUTE },
  signupByIp: { max: 10, windowSeconds: HOUR },
  signupByEmail: { max: 3, windowSeconds: HOUR },
  completeSignupByIp: { max: 20, windowSeconds: 15 * MINUTE },
  createOrganizationByUser: { max: 5, windowSeconds: 24 * HOUR },
  accountActionsByUser: { max: 20, windowSeconds: 15 * MINUTE },
  platformActionsByUser: { max: 60, windowSeconds: MINUTE },
} as const satisfies Record<string, RateLimitRule>;

export const rateLimitKey = {
  loginByIp: (ip: string) => `login:ip:${ip}`,
  loginByEmail: (email: string) => `login:email:${email}`,
  passwordResetByIp: (ip: string) => `reset:ip:${ip}`,
  passwordResetByEmail: (email: string) => `reset:email:${email}`,
  setPasswordByIp: (ip: string) => `set-password:ip:${ip}`,
  changePasswordByUser: (userId: string) => `change-password:user:${userId}`,
  adminActionsByUser: (userId: string) => `admin:user:${userId}`,
  itemActionsByUser: (userId: string) => `items:user:${userId}`,
  signupByIp: (ip: string) => `signup:ip:${ip}`,
  signupByEmail: (email: string) => `signup:email:${email}`,
  completeSignupByIp: (ip: string) => `signup-complete:ip:${ip}`,
  createOrganizationByUser: (userId: string) => `create-org:user:${userId}`,
  accountActionsByUser: (userId: string) => `account:user:${userId}`,
  platformActionsByUser: (userId: string) => `platform:user:${userId}`,
};
