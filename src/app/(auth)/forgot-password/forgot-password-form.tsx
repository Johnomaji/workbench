"use client";

import { FormStatus } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/use-action-form";
import { fieldError } from "@/lib/action-state";
import { forgotPasswordAction } from "../actions";

export function ForgotPasswordForm() {
  const { state, pending, onSubmit } = useActionForm(forgotPasswordAction);

  if (state.status === "success") return <FormStatus state={state} />;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {state.status === "error" && !state.fieldErrors && <FormStatus state={state} />}
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
        error={fieldError(state, "email")}
      />
      <SubmitButton pending={pending} pendingLabel="Sending…" className="w-full">
        Send me a link
      </SubmitButton>
    </form>
  );
}
