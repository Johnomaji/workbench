import type { EmailMessage } from "@/server/providers/email";

const APP_NAME = "Workbench";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(paragraphs: string[], action: { label: string; url: string }, footer: string) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f7f8;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#18181b">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e2e7;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;font-weight:600">${APP_NAME}</p>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#3b4fd8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(action.label)}</a></p>
<p style="margin:0;color:#5b5b66;font-size:14px">${escapeHtml(footer)}</p>
</div></body></html>`;
}

export function inviteEmail(input: {
  to: string;
  name: string;
  invitedBy: string;
  organizationName?: string;
  link: string;
  expiresInHours: number;
}): EmailMessage {
  const where = input.organizationName ? ` to join ${input.organizationName}` : "";
  const lines = [
    `Hi ${input.name},`,
    `${input.invitedBy} has invited you${where} on ${APP_NAME}. ${APP_NAME} is where the team hands work to each other and keeps track of it.`,
    "Choose a password to get started:",
  ];
  const footer = `This link works once and expires in ${input.expiresInHours} hours. If you weren't expecting it, you can ignore this email.`;
  return {
    to: input.to,
    subject: `Your ${APP_NAME} account is ready`,
    text: [...lines, input.link, "", footer].join("\n\n"),
    html: layout(lines, { label: "Choose a password", url: input.link }, footer),
  };
}

export function passwordResetEmail(input: {
  to: string;
  name: string;
  link: string;
  expiresInMinutes: number;
}): EmailMessage {
  const lines = [
    `Hi ${input.name},`,
    `Someone asked to reset the password for your ${APP_NAME} account. If that was you, choose a new password:`,
  ];
  const footer = `This link works once and expires in ${input.expiresInMinutes} minutes. If you didn't ask for this, you can ignore this email; your password won't change.`;
  return {
    to: input.to,
    subject: `Reset your ${APP_NAME} password`,
    text: [...lines, input.link, "", footer].join("\n\n"),
    html: layout(lines, { label: "Choose a new password", url: input.link }, footer),
  };
}

/** Someone who already has an account was added to another organization. */
export function addedToOrganizationEmail(input: {
  to: string;
  name: string;
  invitedBy: string;
  organizationName: string;
  link: string;
}): EmailMessage {
  const lines = [
    `Hi ${input.name},`,
    `${input.invitedBy} has added you to ${input.organizationName} on ${APP_NAME}.`,
    "Sign in with your usual email and password, and you'll find it in your list of organizations.",
  ];
  const footer = "If you don't know this organization, you can ignore this email, or ask its administrator to remove you.";
  return {
    to: input.to,
    subject: `You've been added to ${input.organizationName} on ${APP_NAME}`,
    text: [...lines, input.link, "", footer].join("\n\n"),
    html: layout(lines, { label: `Open ${input.organizationName}`, url: input.link }, footer),
  };
}

/** Confirms the address of a new sign-up. Nothing is created until the link is used. */
export function signupVerifyEmail(input: {
  to: string;
  name: string;
  organizationName: string;
  link: string;
  expiresInHours: number;
}): EmailMessage {
  const lines = [
    `Hi ${input.name},`,
    `Thanks for signing up for ${APP_NAME}. Confirm your email address and choose a password to finish creating ${input.organizationName}:`,
  ];
  const footer = `This link works once and expires in ${input.expiresInHours} hours. If you didn't sign up, you can ignore this email; nothing will be created.`;
  return {
    to: input.to,
    subject: `Finish creating ${input.organizationName} on ${APP_NAME}`,
    text: [...lines, input.link, "", footer].join("\n\n"),
    html: layout(lines, { label: "Confirm and choose a password", url: input.link }, footer),
  };
}

/**
 * Sent instead of a confirmation when someone signs up with an address that
 * already has an account. The sign-up page looks the same either way, so it
 * never reveals who has an account.
 */
export function signupExistingAccountEmail(input: {
  to: string;
  name: string;
  loginLink: string;
  resetLink: string;
}): EmailMessage {
  const lines = [
    `Hi ${input.name},`,
    `Someone tried to sign up for ${APP_NAME} with this email address, but you already have an account.`,
    "Sign in to create a new organization from your list of organizations. If you've forgotten your password (or never chose one), you can set a new one here:",
    input.resetLink,
  ];
  const footer = "If this wasn't you, you can ignore this email. Your account hasn't changed.";
  return {
    to: input.to,
    subject: `You already have a ${APP_NAME} account`,
    text: [...lines, "", "Sign in: " + input.loginLink, "", footer].join("\n\n"),
    html: layout(lines, { label: "Sign in", url: input.loginLink }, footer),
  };
}
