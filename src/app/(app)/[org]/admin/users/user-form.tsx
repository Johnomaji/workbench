"use client";

import { useState } from "react";
import { FormStatus } from "@/components/ui/feedback";
import { Checkbox, FieldError, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/use-action-form";
import { fieldError } from "@/lib/action-state";
import type { DepartmentRoles } from "@/server/admin/users";
import { createUserAction, updateUserAction } from "./actions";

type Props =
  | { mode: "create"; departments: DepartmentRoles[] }
  | {
      mode: "edit";
      departments: DepartmentRoles[];
      user: { id: string; name: string; email: string; isAdmin: boolean; roleIds: string[] };
      isSelf: boolean;
      /** False when the account is also used in other organizations: only its owner changes the name and email. */
      profileEditable: boolean;
    };

export function UserForm(props: Props) {
  const { state, pending, onSubmit } = useActionForm(
    props.mode === "create" ? createUserAction : updateUserAction,
  );
  const [setup, setSetup] = useState<"invite" | "temporary">("invite");
  const user = props.mode === "edit" ? props.user : undefined;
  const roleError = fieldError(state, "roleIds");

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {user && <input type="hidden" name="userId" value={user.id} />}
      <FormStatus state={state} />

      {props.mode === "edit" && !props.profileEditable ? (
        <div className="space-y-1 rounded-lg border border-border bg-surface-muted p-4 text-sm">
          <p>
            <span className="font-medium">{user?.name}</span> · {user?.email}
          </p>
          <p className="text-muted">They use this account in other organizations too, so only they can change their name or email.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="name"
            name="name"
            label="Full name"
            autoComplete="off"
            defaultValue={user?.name}
            required
            error={fieldError(state, "name")}
          />
          <TextField
            id="email"
            name="email"
            type="email"
            label="Email"
            hint={props.mode === "create" ? "They'll use this to sign in." : undefined}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={user?.email}
            required
            error={fieldError(state, "email")}
          />
        </div>
      )}

      <fieldset className="space-y-3" aria-describedby={roleError ? "roleIds-error" : "roleIds-hint"}>
        <legend className="text-sm font-medium">What do they do?</legend>
        <p id="roleIds-hint" className="text-sm text-muted">
          Pick every role that applies. Their role decides which tasks they can be given.
        </p>
        {props.departments.map((department) => (
          <div key={department.id} className="rounded-lg border border-border p-4">
            <p className="mb-3 text-sm font-semibold">{department.name}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {department.roles.map((role) => (
                <Checkbox
                  key={role.id}
                  id={`role-${role.id}`}
                  name="roleIds"
                  value={role.id}
                  label={role.name}
                  description={role.canManageItems ? "Sees everything, assigns work, gives final approval" : undefined}
                  defaultChecked={user?.roleIds.includes(role.id)}
                />
              ))}
            </div>
          </div>
        ))}
        <FieldError id="roleIds-error" message={roleError} />
      </fieldset>

      <Checkbox
        id="isAdmin"
        name="isAdmin"
        label="Administrator"
        description={
          props.mode === "edit" && props.isSelf && user?.isAdmin
            ? "You can't remove your own administrator access."
            : "Can add and deactivate people, and change this organization's settings."
        }
        defaultChecked={user?.isAdmin}
        disabled={props.mode === "edit" && props.isSelf && user?.isAdmin}
      />
      {/* A disabled checkbox isn't submitted; keep the value so it isn't removed by accident. */}
      {props.mode === "edit" && props.isSelf && user?.isAdmin && <input type="hidden" name="isAdmin" value="on" />}

      {props.mode === "create" && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">How will they get their password?</legend>
          <label className="flex items-start gap-3 rounded-lg border border-border p-4 has-checked:border-primary">
            <input
              type="radio"
              name="setup"
              value="invite"
              checked={setup === "invite"}
              onChange={() => setSetup("invite")}
              className="mt-0.5 size-5 accent-primary"
            />
            <span className="text-sm">
              <span className="block font-medium">Email them an invite (recommended)</span>
              <span className="block text-muted">They choose their own password. The link works once and expires in 72 hours.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-border p-4 has-checked:border-primary">
            <input
              type="radio"
              name="setup"
              value="temporary"
              checked={setup === "temporary"}
              onChange={() => setSetup("temporary")}
              className="mt-0.5 size-5 accent-primary"
            />
            <span className="text-sm">
              <span className="block font-medium">Set a temporary password</span>
              <span className="block text-muted">Share it with them privately. They&apos;ll have to change it the first time they sign in.</span>
            </span>
          </label>
          {setup === "temporary" && (
            <TextField
              id="temporaryPassword"
              name="temporaryPassword"
              type="text"
              label="Temporary password"
              hint="At least 10 characters."
              autoComplete="off"
              spellCheck={false}
              required
              error={fieldError(state, "temporaryPassword")}
            />
          )}
        </fieldset>
      )}

      <SubmitButton pending={pending} pendingLabel="Saving…">
        {props.mode === "create" ? "Add person" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
