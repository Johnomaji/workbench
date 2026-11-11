"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

/**
 * The item page's back link returns to the board as the person left it
 * (filters, and the stage picked on a phone). Kept per tab, in sessionStorage.
 * Only a board of the same organization is ever used.
 */
const KEY = "board:last-url";
const EVENT = "board-url-change";

export function rememberBoardUrl(url: string) {
  try {
    sessionStorage.setItem(KEY, url);
  } catch {
    // Storage blocked: the link falls back to the plain board.
  }
  window.dispatchEvent(new Event(EVENT));
}

function read(boardPath: string): string {
  try {
    const url = sessionStorage.getItem(KEY);
    // Only ever this organization's board on this site.
    return url && (url === boardPath || url.startsWith(`${boardPath}?`)) ? url : boardPath;
  } catch {
    return boardPath;
  }
}

export function BackToBoardLink({ boardPath }: { boardPath: string }) {
  const href = useSyncExternalStore(
    (onChange) => {
      window.addEventListener(EVENT, onChange);
      return () => window.removeEventListener(EVENT, onChange);
    },
    () => read(boardPath),
    () => boardPath,
  );
  return (
    <Link href={href} className="mb-4 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-muted hover:text-foreground">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
        <path d="M12.78 4.22a.75.75 0 0 1 0 1.06L8.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06l-5.25-5.25a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z" />
      </svg>
      Board
    </Link>
  );
}
