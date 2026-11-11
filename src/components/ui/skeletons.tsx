import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "./feedback";

/**
 * Placeholders shaped like the content they stand in for, so the page doesn't
 * jump when data arrives. Each announces itself once to screen readers; the
 * shimmer stops for people who prefer reduced motion.
 */
function Loading({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

function Line({ className }: { className?: string }) {
  return <Skeleton className={cn("h-4", className)} />;
}

export function HeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Line className="w-72 max-w-full" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
      </div>
      {withAction && <Skeleton className="h-11 w-32" />}
    </div>
  );
}

function Row() {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex-1 space-y-2">
        <Line className="w-48 max-w-full" />
        <Skeleton className="h-3.5 w-64 max-w-full" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

/** A filter bar and a list of rows (People, Items). */
export function ListSkeleton({ rows = 6, label = "Loading…", filters = true }: { rows?: number; label?: string; filters?: boolean }) {
  return (
    <Loading label={label} className="space-y-4">
      {filters && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 sm:w-56" />
          <Skeleton className="h-11 sm:w-24" />
        </div>
      )}
      <Line className="w-24" />
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {Array.from({ length: rows }, (_, i) => (
          <Row key={i} />
        ))}
      </div>
    </Loading>
  );
}

function WorkCardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <Line className="w-40" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-3.5 w-56 max-w-full" />
      <Skeleton className="h-3.5 w-24" />
    </div>
  );
}

/** Home: a greeting and sections of task cards. */
export function WorkSkeleton() {
  return (
    <Loading label="Loading your work…">
      <HeaderSkeleton withAction />
      <div className="space-y-8">
        {[3, 2].map((cards, s) => (
          <section key={s} className="space-y-3">
            <Skeleton className="h-6 w-32" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: cards }, (_, i) => (
                <WorkCardSkeleton key={i} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Loading>
  );
}

/** The board: filters, then columns of cards (one column with stage chips on phones). */
export function BoardSkeleton() {
  const columns = [3, 1, 2, 1, 2, 1, 1];
  return (
    <Loading label="Loading the board…" className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <Skeleton className="h-9 w-28 md:hidden" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="hidden h-11 w-48 md:block" />
        ))}
        <Skeleton className="hidden h-11 w-20 md:block" />
      </div>
      <Line className="w-24" />
      <div className="flex flex-wrap gap-1.5 md:hidden">
        {["w-24", "w-32", "w-20", "w-28"].map((w) => (
          <Skeleton key={w} className={cn("h-10 rounded-full", w)} />
        ))}
      </div>
      <div className="flex gap-3 overflow-hidden">
        {columns.map((cards, c) => (
          <div key={c} className={cn("w-full shrink-0 space-y-2 rounded-xl bg-surface-muted p-2 md:w-72", c > 0 && "hidden md:block")}>
            <Line className="mx-1.5 my-1.5 w-28" />
            {Array.from({ length: cards }, (_, i) => (
              <div key={i} className="space-y-2.5 rounded-lg border border-border bg-surface p-3">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-8" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Line className="w-4/5" />
                <Skeleton className="h-3.5 w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** A card of labelled fields with a button. */
export function FormSkeleton({ fields = 3, label = "Loading…", card = true }: { fields?: number; label?: string; card?: boolean }) {
  return (
    <Loading label={label} className={cn(card && "rounded-xl border border-border bg-surface p-5 sm:p-6")}>
      <div className="space-y-5">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-2">
            <Line className="w-28" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
        <Skeleton className="h-11 w-36" />
      </div>
    </Loading>
  );
}

function SectionSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="space-y-2 border-b border-border px-5 py-4 sm:px-6">
        <Line className="w-32" />
        <Skeleton className="h-3.5 w-64 max-w-full" />
      </div>
      <div className="space-y-3 px-5 py-5 sm:px-6">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={cn("h-11", i === lines - 1 ? "w-40" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

/** A page header followed by bordered sections (a person's page). */
export function SectionsSkeleton({ sections = 3, label = "Loading…" }: { sections?: number; label?: string }) {
  return (
    <Loading label={label} className="space-y-6">
      <HeaderSkeleton />
      {Array.from({ length: sections }, (_, i) => (
        <SectionSkeleton key={i} lines={i === 0 ? 4 : 2} />
      ))}
    </Loading>
  );
}

/** The content item page: header, stage strip, current step, brief and script, tasks and activity. */
export function ItemPageSkeleton() {
  return (
    <Loading label="Loading item…">
      <HeaderSkeleton />
      <div className="mb-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr]">
        <div className="space-y-3 lg:col-start-2 lg:row-start-1">
          <Line className="w-28" />
          <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
            <Line className="w-24" />
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-11 w-40" />
          </div>
        </div>
        <div className="space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <SectionSkeleton lines={2} />
          <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <Line className="mb-4 w-24" />
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Line key={i} className={i % 3 === 2 ? "w-2/3" : "w-full"} />
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-surface p-5 lg:col-start-2 lg:row-start-2">
          <Line className="w-20" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}
