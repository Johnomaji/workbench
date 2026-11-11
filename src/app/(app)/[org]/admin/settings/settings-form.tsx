"use client";

import { OrganizationFields } from "@/components/organization-fields";
import { FormStatus } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/use-action-form";
import { fieldError } from "@/lib/action-state";
import { updateOrganizationAction } from "./actions";

export function SettingsForm({ name, slug }: { name: string; slug: string }) {
  const { state, pending, onSubmit } = useActionForm(updateOrganizationAction);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormStatus state={state} />
      <OrganizationFields
        defaultName={name}
        defaultSlug={slug}
        slugHint="Changing it changes every link to this organization. Old links, bookmarks and links in old emails stop working."
        errors={{ name: fieldError(state, "name"), slug: fieldError(state, "slug") }}
      />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
