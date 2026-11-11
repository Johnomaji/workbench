export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailProvider {
  /** Sends one email. Throws if the provider rejects it. */
  send(message: EmailMessage): Promise<void>;
}
