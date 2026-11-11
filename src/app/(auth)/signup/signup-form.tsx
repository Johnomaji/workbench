"use client";

import Link from "next/link";
import { OrganizationFields } from "@/components/organization-fields";
import { FormStatus } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/use-action-form";
import { fieldError } from "@/lib/action-state";
import { signupAction } from "../actions";

export function SignupForm() {
  const { state, pending, onSubmit } = useActionForm(signupAction);

  if (state.status === "success") return <FormStatus state={state} />;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {state.status === "error" && !state.fieldErrors && <FormStatus state={state} />}
      <TextField id="name" name="name" label="Your name" autoComplete="name" required autoFocus error={fieldError(state, "name")} />
      <TextField
        id="email"
        name="email"
        type="email"
        label="Work email"
        hint="We'll send a link here to confirm it's yours."
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        error={fieldError(state, "email")}
      />
      <OrganizationFields
        names={{ name: "organizationName", slug: "organizationSlug" }}
        errors={{ name: fieldError(state, "organizationName"), slug: fieldError(state, "organizationSlug") }}
      />
      <p className="text-sm text-muted">
        By continuing, you agree to the{" "}
        <Link href="/terms" target="_blank" className="font-medium text-primary underline underline-offset-4">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" className="font-medium text-primary underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>
      <SubmitButton pending={pending} pendingLabel="Sending…" className="w-full">
        Continue
      </SubmitButton>
    </form>
  );
}
