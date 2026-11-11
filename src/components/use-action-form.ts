"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { idleState, type ActionState } from "@/lib/action-state";
import { useOrgSlug } from "./use-org";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * useActionState wired to onSubmit instead of <form action>, so React doesn't
 * reset the form: after a validation error, people keep what they typed.
 *
 * Inside an organization (/[org]/…) every submission carries an `org` field
 * with its slug. Organization actions use it to know where they're acting; the
 * server checks membership itself, so the field is a hint, never a permission.
 */
export function useActionForm(action: FormAction, initialState: ActionState = idleState) {
  const [state, dispatch, pending] = useActionState(action, initialState);
  const org = useOrgSlug();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    if (org && !formData.has("org")) formData.set("org", org);
    startTransition(() => dispatch(formData));
  }

  return { state, pending, onSubmit };
}
