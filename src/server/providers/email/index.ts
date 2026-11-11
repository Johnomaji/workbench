import "server-only";
import { env } from "@/server/env";
import { ConsoleEmailProvider } from "./console";
import { ResendEmailProvider } from "./resend";
import type { EmailProvider } from "./types";

export type { EmailMessage, EmailProvider } from "./types";

let provider: EmailProvider | undefined;

export function emailProvider(): EmailProvider {
  if (!provider) {
    const e = env();
    if (e.EMAIL_PROVIDER === "resend") {
      if (!e.RESEND_API_KEY) {
        throw new Error("EMAIL_PROVIDER is 'resend' but RESEND_API_KEY is not set");
      }
      provider = new ResendEmailProvider(e.RESEND_API_KEY, e.EMAIL_FROM);
    } else {
      provider = new ConsoleEmailProvider(e.EMAIL_FROM);
    }
  }
  return provider;
}
