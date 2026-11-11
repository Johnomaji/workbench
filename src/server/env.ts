import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  EMAIL_FROM: z.string().min(3).default("Workbench <no-reply@example.com>"),
  RESEND_API_KEY: z.string().optional(),
});

type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Validated server environment. Read lazily so `next build` doesn't fail on
 * variables only needed at request time. DATABASE_URL and AUTH_SECRET are read
 * by Prisma and Auth.js directly.
 */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        `Invalid environment variables:\n${z.prettifyError(parsed.error)}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}

/** Base URL for links in emails, without a trailing slash. */
export function appUrl(): string {
  const e = env();
  if (e.APP_URL) return e.APP_URL.replace(/\/+$/, "");
  if (e.VERCEL_PROJECT_PRODUCTION_URL) return `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
