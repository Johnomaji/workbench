"use client";

import { FormStatus } from "@/components/ui/feedback";
import { inputClasses, FieldError, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/use-action-form";
import { fieldError } from "@/lib/action-state";
import type { NewItemOptions } from "@/server/items/queries";
import { createItemAction } from "../actions";

export function NewItemForm({ options }: { options: NewItemOptions }) {
  const { state, pending, onSubmit } = useActionForm(createItemAction);
  const single = options.departments.length === 1;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {state.status === "error" && !state.fieldErrors && <FormStatus state={state} />}

      {single ? (
        <input type="hidden" name="departmentId" value={options.departments[0].id} />
      ) : (
        <div className="space-y-1.5">
          <label htmlFor="departmentId" className="block text-sm font-medium">
            Department
          </label>
          <select id="departmentId" name="departmentId" className={inputClasses} required>
            {options.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <FieldError message={fieldError(state, "departmentId")} />
        </div>
      )}

      <TextField id="title" name="title" label="Title" hint="Short and specific, e.g. “Spring teaser – 30s vertical video”." required autoFocus error={fieldError(state, "title")} />

      <div className="space-y-1.5">
        <label htmlFor="brief" className="block text-sm font-medium">
          Brief
        </label>
        <p id="brief-hint" className="text-sm text-muted">
          What it&apos;s for, who it&apos;s for, and anything the team must include.
        </p>
        <textarea
          id="brief"
          name="brief"
          rows={5}
          aria-describedby="brief-hint"
          className={`${inputClasses} min-h-32 py-2`}
        />
        <FieldError message={fieldError(state, "brief")} />
      </div>

      <TextField
        id="deadline"
        name="deadline"
        type="date"
        label="Deadline"
        hint="Optional. Counts as the end of that day."
        className="sm:max-w-xs"
        error={fieldError(state, "deadline")}
      />

      {options.selfTaskName && (
        <p className="rounded-lg bg-primary-surface px-4 py-3 text-sm">
          You&apos;ll be given the <strong>{options.selfTaskName}</strong> task. A project manager assigns the rest, or
          people pick them up when it&apos;s their turn.
        </p>
      )}

      {options.assignable.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Who&apos;s doing what?</legend>
          <p className="text-sm text-muted">
            Optional. Leave a task open and anyone with that role can pick it up when it&apos;s their turn.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {options.assignable.map((task) => (
              <div key={task.templateId} className="space-y-1.5">
                <label htmlFor={`assignee_${task.templateId}`} className="block text-sm font-medium">
                  {task.name} <span className="font-normal text-muted">({task.roleName})</span>
                </label>
                <select id={`assignee_${task.templateId}`} name={`assignee_${task.templateId}`} className={inputClasses} defaultValue="">
                  <option value="">Anyone ({task.roleName.toLowerCase()})</option>
                  {task.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <FieldError message={fieldError(state, `assignee_${task.templateId}`)} />
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <SubmitButton pending={pending} pendingLabel="Creating…">
        Create item
      </SubmitButton>
    </form>
  );
}
