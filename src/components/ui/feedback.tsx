import type { ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "error";

const toneClasses: Record<Tone, string> = {
  info: "border-border bg-primary-surface text-foreground",
  success: "border-success/30 bg-success-surface text-foreground",
  warning: "border-warning/30 bg-warning-surface text-foreground",
  error: "border-danger/30 bg-danger-surface text-foreground",
};

const iconClasses: Record<Tone, string> = {
  info: "text-primary",
  success: "text-success",
  warning: "text-warning",
  error: "text-danger",
};

const icons: Record<Tone, string> = {
  info: "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm.75 12.5a.75.75 0 0 1-1.5 0v-4a.75.75 0 0 1 1.5 0v4ZM10 7.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
  success: "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm3.53 6.28-4 4.5a.75.75 0 0 1-1.1.02l-2-2a.75.75 0 1 1 1.06-1.06l1.44 1.44 3.48-3.92a.75.75 0 1 1 1.12 1.02Z",
  warning: "M8.48 3.1a1.75 1.75 0 0 1 3.04 0l5.75 10.27A1.75 1.75 0 0 1 15.75 16H4.25a1.75 1.75 0 0 1-1.52-2.63L8.48 3.1ZM10 7a.75.75 0 0 0-.75.75v3a.75.75 0 0 0 1.5 0v-3A.75.75 0 0 0 10 7Zm0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  error: "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-.75 4.5a.75.75 0 0 1 1.5 0v4a.75.75 0 0 1-1.5 0v-4ZM10 14.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border p-3 text-sm", toneClasses[tone], className)}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={cn("mt-0.5 size-5 shrink-0", iconClasses[tone])}>
        <path d={icons[tone]} />
      </svg>
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

/** Shows the success or error message from a form's server action. */
export function FormStatus({ state, className }: { state: ActionState; className?: string }) {
  if (state.status === "idle") return null;
  return (
    <Alert tone={state.status === "error" ? "error" : "success"} className={className}>
      {state.message}
    </Alert>
  );
}

type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-foreground",
  primary: "bg-primary-surface text-primary",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeTones[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none", className)} />;
}

/** Placeholder while a section loads. Announced once to screen readers. */
export function LoadingBlock({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
