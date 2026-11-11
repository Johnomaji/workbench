import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { ButtonLink } from "@/components/ui/button";
import { SITE } from "@/lib/site";

const NAV = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 md:gap-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <LogoMark />
          {SITE.name}
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="font-medium text-muted hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link href="/login" className="inline-flex min-h-9 items-center rounded-lg px-2 text-sm font-medium hover:bg-surface-muted sm:px-3">
            Sign in
          </Link>
          <ButtonLink href="/signup" size="sm">
            <span className="sm:hidden">Try it free</span>
            <span className="hidden sm:inline">Start free trial</span>
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}

const FOOTER_LINKS = [
  {
    title: "Product",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/signup", label: "Start free trial" },
      { href: "/login", label: "Sign in" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/refunds", label: "Refund Policy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
            <LogoMark className="size-6" />
            {SITE.name}
          </Link>
          <p className="mt-3 max-w-sm text-sm text-muted">{SITE.tagline}.</p>
          <p className="mt-4 text-sm">
            Questions?{" "}
            <a href={`mailto:${SITE.contactEmail}`} className="font-medium text-primary underline underline-offset-4">
              {SITE.contactEmail}
            </a>
          </p>
        </div>
        {FOOTER_LINKS.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="text-sm font-semibold">{group.title}</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-8 items-center text-muted hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 text-sm text-muted">
          <p>© {SITE.legal.companyName.startsWith("[") ? SITE.name : SITE.legal.companyName}</p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
