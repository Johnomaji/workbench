"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { rememberBoardUrl } from "@/components/back-to-board";
import { cn } from "@/lib/cn";

export type BoardColumnSlot = { key: string; name: string; count: number; content: ReactNode };

/**
 * Lays out the columns. Wide screens show them side by side (scrolling
 * sideways if needed). Phones show one stage at a time: pick it above the list.
 * The picked stage goes in the URL so going back to the board keeps it.
 */
export function BoardView({
  boardPath,
  columns,
  initialStage,
}: {
  /** The board of the current organization, e.g. "/acme/board". */
  boardPath: string;
  columns: BoardColumnSlot[];
  initialStage: string | null;
}) {
  const [stage, setStage] = useState(initialStage ?? columns[0]?.key ?? null);
  const search = useSearchParams().toString();

  // Remember where the board was left (after every filter change too).
  useEffect(() => {
    rememberBoardUrl(`${boardPath}${search ? `?${search}` : ""}`);
  }, [boardPath, search]);

  function pick(key: string) {
    setStage(key);
    const url = new URL(window.location.href);
    url.searchParams.set("stage", key);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Show stage" className="flex flex-wrap gap-1.5 md:hidden">
        {columns.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={c.key === stage}
            onClick={() => pick(c.key)}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium",
              "border-border-strong bg-surface text-foreground",
              "aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground",
            )}
          >
            {c.name}
            <span className="text-xs opacity-80">{c.count}</span>
          </button>
        ))}
      </div>

      <div
        role="region"
        aria-label="Board"
        tabIndex={0}
        className="-mx-4 px-4 md:flex md:items-start md:gap-3 md:overflow-x-auto md:pb-3"
      >
        {columns.map((c) => (
          <div key={c.key} className={cn("md:block md:w-72 md:shrink-0", c.key === stage ? "block" : "hidden")}>
            {c.content}
          </div>
        ))}
      </div>
    </div>
  );
}
