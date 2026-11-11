import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { HOME_PATH } from "@/lib/org-path";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-border bg-surface p-5 sm:p-6", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="text-muted break-words">{description}</p>}
        {meta && <div className="flex flex-wrap gap-2 pt-1">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mb-4 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-muted hover:text-foreground">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
        <path d="M12.78 4.22a.75.75 0 0 1 0 1.06L8.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06l-5.25-5.25a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z" />
      </svg>
      {children}
    </Link>
  );
}

export function NoAccess() {
  return (
    <Card className="mx-auto max-w-lg text-center">
      <h1 className="text-lg font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-1 text-sm text-muted">
        If you need it, ask an administrator to change your role.
      </p>
      <p className="mt-4">
        <Link href={HOME_PATH} className="font-medium text-primary underline underline-offset-4">
          Go to your organizations
        </Link>
      </p>
    </Card>
  );
}
