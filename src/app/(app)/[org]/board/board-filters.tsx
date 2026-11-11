"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export type BoardFilterValues = { dept: string; person: string; deadline: string; status: string };

const DEADLINES = [
  { value: "", label: "Any deadline" },
  { value: "overdue", label: "Overdue" },
  { value: "week", label: "Due this week" },
  { value: "none", label: "No deadline" },
];

const STATUSES = [
  { value: "", label: "Any status" },
  { value: "waiting", label: "Waiting to start" },
  { value: "inProgress", label: "In progress" },
  { value: "sentBack", label: "Sent back" },
  { value: "changes", label: "Changes requested" },
  { value: "completed", label: "Completed" },
];

function Select({
  id,
  name,
  label,
  defaultValue,
  children,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5 md:w-48">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select id={id} name={name} defaultValue={defaultValue} className={inputClasses}>
        {children}
      </select>
    </div>
  );
}

/** Filter form. The filters live in the URL, so a filtered board can be bookmarked or shared. */
export function BoardFilters({
  boardPath,
  values,
  people,
  departments,
  meId,
  activeCount,
}: {
  /** The board of the current organization, e.g. "/acme/board". */
  boardPath: string;
  values: BoardFilterValues;
  people: { id: string; name: string }[];
  departments: { key: string; name: string }[];
  meId: string;
  activeCount: number;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const router = useRouter();
  // Keep the stage picked on a phone when the filters change.
  const stage = useSearchParams().get("stage");
  const others = people.filter((p) => p.id !== meId);
  // Leave unused filters out of the URL.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) if (typeof value === "string" && value) params.set(key, value);
    router.push(params.size ? `${boardPath}?${params}` : boardPath);
  }

  const clearHref = values.dept && departments.length > 1 ? `${boardPath}?dept=${encodeURIComponent(values.dept)}` : boardPath;

  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-form`}
        onClick={() => setOpen((v) => !v)}
        className={cn(buttonClasses("secondary", "sm"), "md:hidden")}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
          <path d="M2.5 4.75A.75.75 0 0 1 3.25 4h13.5a.75.75 0 0 1 .53 1.28L12 10.56v4.69a.75.75 0 0 1-.42.67l-3 1.5A.75.75 0 0 1 7.5 16.75v-6.19L2.72 5.28a.75.75 0 0 1-.22-.53Z" />
        </svg>
        {open ? "Hide filters" : "Filters"}
        {activeCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeCount}</span>}
      </button>

      <form
        key={Object.values(values).join("|")}
        id={`${id}-form`}
        action={boardPath}
        method="get"
        onSubmit={onSubmit}
        role="search"
        aria-label="Filter the board"
        className={cn(
          "grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-2",
          "md:flex md:flex-wrap md:items-end md:border-0 md:bg-transparent md:p-0",
          open ? "grid" : "hidden",
        )}
      >
        {departments.length > 1 && (
          <Select id={`${id}-dept`} name="dept" label="Department" defaultValue={values.dept}>
            {departments.map((d) => (
              <option key={d.key} value={d.key}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
        <Select id={`${id}-person`} name="person" label="Person" defaultValue={values.person}>
          <option value="">Anyone</option>
          <option value="me">Me</option>
          <option value="unassigned">Nobody yet</option>
          {others.length > 0 && (
            <optgroup label="People">
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        <Select id={`${id}-deadline`} name="deadline" label="Deadline" defaultValue={values.deadline}>
          {DEADLINES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select id={`${id}-status`} name="status" label="Status" defaultValue={values.status}>
          {STATUSES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {stage && <input type="hidden" name="stage" value={stage} />}
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" className={buttonClasses("secondary")}>
            Apply
          </button>
          {activeCount > 0 && (
            <Link href={clearHref} className="text-sm font-medium text-primary underline underline-offset-4">
              Clear filters
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
