"use client";

import type { ButtonHTMLAttributes } from "react";
import { buttonClasses, Spinner } from "./button";

type SubmitButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  pending: boolean;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "md" | "sm";
};

/**
 * Submit button that shows progress and blocks double submits. Uses
 * aria-disabled while pending so keyboard focus isn't lost mid-submit.
 */
export function SubmitButton({
  pending,
  pendingLabel,
  children,
  variant,
  size,
  className,
  onClick,
  ...props
}: SubmitButtonProps) {
  return (
    <button
      type="submit"
      aria-disabled={pending || undefined}
      className={buttonClasses(variant, size, className)}
      onClick={(event) => {
        if (pending) event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {pending ? (
        <>
          <Spinner />
          <span>{pendingLabel ?? "Working…"}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
