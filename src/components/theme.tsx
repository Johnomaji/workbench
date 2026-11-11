"use client";

import { useId, useLayoutEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { THEME_STORAGE_KEY as STORAGE_KEY } from "@/lib/theme-script";

export type ThemeChoice = "system" | "light" | "dark";

const EVENT = "themechange";

function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Private mode or blocked storage: still switch for this page view.
  }
  applyTheme(choice);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    applyTheme(readTheme());
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage); // other tabs
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme(): ThemeChoice {
  // The server can't know the choice; it renders "system" and the client catches up.
  return useSyncExternalStore(subscribe, readTheme, () => "system");
}

/**
 * Mounted once in the root layout. In development React's Strict Mode remount
 * clears attributes on <html>; this puts the theme back before paint.
 * It also keeps every open tab in step when the theme changes in one of them.
 */
export function ThemeController() {
  useLayoutEffect(() => {
    applyTheme(readTheme());
  }, []);
  useTheme();
  return null;
}

const OPTIONS: Array<{ value: ThemeChoice; label: string; icon: React.ReactNode }> = [
  {
    value: "system",
    label: "Match device",
    icon: <path d="M4 5h16v10H4zM9 19h6M12 15v4" />,
  },
  {
    value: "light",
    label: "Light",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  },
];

/** Three-way switch: match the device, light or dark. Arrow keys move between options. */
export function ThemeToggle({ className, showLabels = false }: { className?: string; showLabels?: boolean }) {
  const theme = useTheme();
  // Unique per instance: the header and the mobile menu each have one.
  const name = useId();
  return (
    <fieldset className={cn("inline-flex rounded-lg border border-border bg-surface-muted p-0.5", className)}>
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map((option) => (
        <label
          key={option.value}
          title={option.label}
          className={cn(
            "flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted",
            "has-checked:bg-surface has-checked:text-foreground has-checked:shadow-sm",
            "has-focus-visible:outline-2 has-focus-visible:outline-focus",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={theme === option.value}
            onChange={() => setTheme(option.value)}
            className="sr-only"
          />
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {option.icon}
          </svg>
          <span className={showLabels ? "" : "sr-only"}>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
