import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClasses =
  "block w-full min-h-11 rounded-lg border border-border-strong bg-surface px-3 text-base text-foreground " +
  "placeholder:text-muted aria-invalid:border-danger";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
};

/** Labelled input with hint and error text wired up for screen readers. */
export function TextField({ id, label, hint, error, className, ...props }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={inputClasses}
        {...props}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-danger">
      <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0" fill="currentColor">
        <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-.75 4.5a.75.75 0 0 1 1.5 0v4a.75.75 0 0 1-1.5 0v-4ZM10 14.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
      </svg>
      <span>{message}</span>
    </p>
  );
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  id: string;
  label: ReactNode;
  description?: ReactNode;
};

export function Checkbox({ id, label, description, className, ...props }: CheckboxProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={id}
        type="checkbox"
        aria-describedby={descriptionId}
        className="mt-0.5 size-5 shrink-0 rounded border-border-strong accent-primary"
        {...props}
      />
      <div className="text-sm">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="text-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
