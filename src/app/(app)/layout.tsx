import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/logo";
import { Skeleton } from "@/components/ui/feedback";
import { HOME_PATH } from "@/lib/org-path";
import { getCurrentUser } from "@/server/auth/session";
import { NavMenu } from "./nav-menu";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // Pages that need the full width (the board) mark themselves with data-wide.
    <div className="group/shell flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:font-medium focus:shadow"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 group-has-[[data-wide]]/shell:max-w-none">
          <Link href={HOME_PATH} className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
            <LogoMark className="size-6" />
            Workbench
          </Link>
          {/* The user's name and menu stream in; the rest of the shell renders instantly. */}
          <Suspense fallback={<Skeleton className="ml-auto h-8 w-32" />}>
            <AppNav />
          </Suspense>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 has-[[data-wide]]:max-w-none sm:py-8">
        {children}
      </main>
    </div>
  );
}

async function AppNav() {
  const user = await getCurrentUser();
  // Pages redirect signed-out visitors themselves; the header just stays empty.
  if (!user) return null;

  // The menu picks the organization from the URL; only ones the user can open are listed.
  return (
    <NavMenu
      user={{ name: user.name, email: user.email }}
      organizations={user.organizations.map(({ slug, name, isAdmin }) => ({ slug, name, isAdmin }))}
      isPlatformAdmin={user.isPlatformAdmin}
    />
  );
}
