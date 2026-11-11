"use client";

import { FormStatus } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/use-action-form";
import { fieldError } from "@/lib/action-state";
import { changePasswordAction } from "../../actions";

export function ChangePasswordForm({ email, required }: { email: string; required: boolean }) {
  const { state, pending, onSubmit } = useActionForm(changePasswordAction);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="required" value={required ? "1" : "0"} />
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
      {state.status === "error" && !state.fieldErrors && <FormStatus state={state} />}
      <TextField
        id="currentPassword"
        name="currentPassword"
        type="password"
        label={required ? "Temporary password" : "Current password"}
        autoComplete="current-password"
        required
        error={fieldError(state, "currentPassword")}
      />
      <TextField
        id="password"
        name="password"
        type="password"
        label="New password"
        hint="At least 10 characters."
        autoComplete="new-password"
        required
        error={fieldError(state, "password")}
      />
      <TextField
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Type the new password again"
        autoComplete="new-password"
        required
        error={fieldError(state, "confirmPassword")}
      />
      <p className="text-sm text-muted">Changing your password signs you out on your other devices.</p>
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Change password
      </SubmitButton>
    </form>
  );
}
