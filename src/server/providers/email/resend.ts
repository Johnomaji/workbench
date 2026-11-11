import type { EmailMessage, EmailProvider } from "./types";

/** Sends through Resend's REST API with plain fetch (no SDK needed). */
export class ResendEmailProvider implements EmailProvider {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      // Keep request handlers short; a stuck provider shouldn't hang the response.
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend rejected the email (${response.status}): ${detail.slice(0, 300)}`);
    }
  }
}
