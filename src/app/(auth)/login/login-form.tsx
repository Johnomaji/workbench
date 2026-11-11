"use client";

import { Alert, FormStatus } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/use-action-form";
import { loginAction } from "../actions";

export function LoginForm({
  callbackUrl,
  notice,
}: {
  callbackUrl: string;
  notice?: { tone: "info" | "success" | "error"; text: string };
}) {
  const { state, pending, onSubmit } = useActionForm(loginAction);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {state.status === "idle" && notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <FormStatus state={state} />
      <TextField
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        autoFocus
      />
      <TextField
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
      />
      <SubmitButton pending={pending} pendingLabel="Signing in…" className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}
