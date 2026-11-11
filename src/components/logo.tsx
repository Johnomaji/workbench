import { cn } from "@/lib/cn";

/** Workbench's mark: work travelling from one step to the next. Decorative; put the name next to it. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("size-7 text-primary", className)}>
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <path
        d="M6.5 8H11a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2.5"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="6.5" cy="8" r="1.75" fill="var(--primary-foreground)" />
      <circle cx="17.5" cy="16" r="1.75" fill="var(--primary-foreground)" />
    </svg>
  );
}
