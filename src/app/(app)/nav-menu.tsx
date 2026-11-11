"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme";
import { useOrgSlug } from "@/components/use-org";
import { cn } from "@/lib/cn";
import { orgPath } from "@/lib/org-path";
import { signOutAction } from "./actions";

export type NavOrganization = { slug: string; name: string; isAdmin: boolean };

type NavItem = { href: string; label: string; exact?: boolean };

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The pages of the organization in the URL. Outside an organization there are none. */
function orgItems(organization: NavOrganization | null): NavItem[] {
  if (!organization) return [];
  const path = (p: string) => orgPath(organization.slug, p);
  const items: NavItem[] = [
    { href: path("/"), label: "My work", exact: true },
    { href: path("/board"), label: "Board" },
    { href: path("/items"), label: "All items" },
  ];
  if (organization.isAdmin) {
    items.push({ href: path("/admin/users"), label: "People" }, { href: path("/admin/settings"), label: "Settings" });
  }
  return items;
}

/** Closes a popover on Escape (returning focus to its button) and on clicks outside it. */
function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>, button: React.RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        button.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close, ref, button]);
}

function OrganizationSwitcher({ current, organizations }: { current: NavOrganization | null; organizations: NavOrganization[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useDismiss(open, () => setOpen(false), wrapper, button);

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-9 max-w-56 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium hover:bg-surface-muted"
      >
        <span className="sr-only">Organization: </span>
        <span className="truncate">{current?.name ?? "Organizations"}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-muted">
          <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute left-0 top-11 z-50 w-72 rounded-xl border border-border bg-surface p-2 shadow-lg"
      >
        <OrganizationLinks current={current} organizations={organizations} />
      </div>
    </div>
  );
}

function OrganizationLinks({ current, organizations }: { current: NavOrganization | null; organizations: NavOrganization[] }) {
  return (
    <nav aria-label="Organizations">
      {organizations.length > 0 && (
        <ul className="mb-1 border-b border-border pb-1">
          {organizations.map((o) => (
            <li key={o.slug}>
              <Link
                href={orgPath(o.slug)}
                aria-current={o.slug === current?.slug ? "page" : undefined}
                className="flex min-h-10 items-center justify-between gap-2 rounded-lg px-2 text-sm hover:bg-surface-muted aria-[current=page]:font-semibold"
              >
                <span className="truncate">{o.name}</span>
                {o.slug === current?.slug && <span aria-hidden="true">✓</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/organizations/new" className="flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-primary hover:bg-surface-muted">
        Create an organization
      </Link>
    </nav>
  );
}

export function NavMenu({
  user,
  organizations,
  isPlatformAdmin,
}: {
  user: { name: string; email: string };
  organizations: NavOrganization[];
  isPlatformAdmin: boolean;
}) {
  const pathname = usePathname();
  const slug = useOrgSlug();
  const current = organizations.find((o) => o.slug === slug) ?? null;
  const items = orgItems(current);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close the mobile menu after navigating.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const links = (className: string) =>
    items.map((item) => (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive(pathname, item) ? "page" : undefined}
        className={cn(
          className,
          "font-medium text-muted hover:text-foreground aria-[current=page]:text-foreground",
        )}
      >
        {item.label}
      </Link>
    ));

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block">
        <OrganizationSwitcher current={current} organizations={organizations} />
      </div>
      <nav aria-label="Main" className="hidden flex-1 items-center gap-5 text-sm md:flex">
        {links("py-2")}
      </nav>
      <div className="ml-auto hidden items-center gap-3 md:flex">
        <ThemeToggle />
        {isPlatformAdmin && (
          <Link href="/platform" className="text-sm font-medium text-muted hover:text-foreground">
            Platform
          </Link>
        )}
        <Link href="/account" className="text-right text-sm leading-tight hover:underline">
          <span className="block font-medium">{user.name}</span>
          <span className="block text-muted">{user.email}</span>
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="min-h-9 rounded-lg px-3 text-sm font-medium hover:bg-surface-muted">
            Sign out
          </button>
        </form>
      </div>

      {/* Mobile */}
      <button
        ref={buttonRef}
        type="button"
        className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-surface-muted md:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-border bg-surface px-4 pb-4 shadow-lg md:hidden"
      >
        {current && <p className="px-2 pt-3 text-sm font-semibold">{current.name}</p>}
        {items.length > 0 && (
          <nav aria-label="Main" className="flex flex-col py-2 text-base">
            {links("rounded-lg px-2 py-3")}
          </nav>
        )}
        <div className="border-t border-border py-2">
          <p className="px-2 pt-1 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Switch organization</p>
          <OrganizationLinks current={current} organizations={organizations} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-2 py-3">
          <span className="text-sm font-medium">Theme</span>
          <ThemeToggle showLabels />
        </div>
        <div className="border-t border-border pt-3">
          <p className="px-2 font-medium">{user.name}</p>
          <p className="px-2 text-sm text-muted break-all">{user.email}</p>
          <div className="mt-2 flex flex-col">
            <Link href="/account" className="rounded-lg px-2 py-3 font-medium">
              Your account
            </Link>
            {isPlatformAdmin && (
              <Link href="/platform" className="rounded-lg px-2 py-3 font-medium">
                Platform
              </Link>
            )}
            <form action={signOutAction}>
              <button type="submit" className="w-full rounded-lg px-2 py-3 text-left font-medium">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
