import type { EmailMessage, EmailProvider } from "./types";

/** Development provider: prints the email to the server terminal instead of sending it. */
export class ConsoleEmailProvider implements EmailProvider {
  constructor(private from: string) {}

  async send(message: EmailMessage): Promise<void> {
    const line = "─".repeat(60);
    console.info(
      [
        "",
        line,
        "Email (not sent, EMAIL_PROVIDER=console)",
        `From:    ${this.from}`,
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        line,
        message.text,
        line,
        "",
      ].join("\n"),
    );
  }
}
