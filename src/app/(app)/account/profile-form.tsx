"use client";

import { FormStatus } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/use-action-form";
import { fieldError } from "@/lib/action-state";
import { updateProfileAction } from "../actions";

export function ProfileForm({ name }: { name: string }) {
  const { state, pending, onSubmit } = useActionForm(updateProfileAction);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormStatus state={state} />
      <TextField
        id="name"
        name="name"
        label="Your name"
        autoComplete="name"
        defaultValue={name}
        required
        error={fieldError(state, "name")}
      />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
