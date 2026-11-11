import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "./site-chrome";

/** The public site is the same for everyone: keep it prerendered, with no request-time work. */
export const ensureStatic = "navigation";

export const metadata: Metadata = {
  // The app's pages stay out of search results (root layout); these are meant to be found.
  // Link-preview tags are per page: see share.ts.
  robots: { index: true, follow: true },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:font-medium focus:shadow"
      >
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
