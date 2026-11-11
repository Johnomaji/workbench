"use client";

import { FormStatus } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/use-action-form";
import { fieldError } from "@/lib/action-state";
import { completeSignupAction } from "../../actions";

export function CompleteSignupForm({ token, email }: { token: string; email: string }) {
  const { state, pending, onSubmit } = useActionForm(completeSignupAction);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {/* Lets password managers save the new password against the right account. */}
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
      {state.status === "error" && !state.fieldErrors && <FormStatus state={state} />}
      <TextField
        id="password"
        name="password"
        type="password"
        label="Choose a password"
        hint="At least 10 characters. A short sentence is easy to remember and hard to guess."
        autoComplete="new-password"
        required
        autoFocus
        error={fieldError(state, "password")}
      />
      <TextField
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Type it again"
        autoComplete="new-password"
        required
        error={fieldError(state, "confirmPassword")}
      />
      <SubmitButton pending={pending} pendingLabel="Creating…" className="w-full">
        Create organization and sign in
      </SubmitButton>
    </form>
  );
}
