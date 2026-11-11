"use client";

import { OrganizationFields } from "@/components/organization-fields";
import { FormStatus } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/use-action-form";
import { fieldError } from "@/lib/action-state";
import { createOrganizationAction } from "../actions";

export function CreateOrganizationForm() {
  const { state, pending, onSubmit } = useActionForm(createOrganizationAction);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {state.status === "error" && !state.fieldErrors && <FormStatus state={state} />}
      <OrganizationFields errors={{ name: fieldError(state, "name"), slug: fieldError(state, "slug") }} />
      <SubmitButton pending={pending} pendingLabel="Creating…">
        Create organization
      </SubmitButton>
    </form>
  );
}
