import type { ReactNode } from "react";
import { SITE } from "@/lib/site";

/**
 * A detail from SITE.legal. Placeholders ("[Company legal name]") are
 * highlighted, so a page can't quietly go live with one left in.
 */
export function Fill({ value }: { value: string }) {
  if (!value.startsWith("[")) return <>{value}</>;
  return <mark className="rounded bg-warning-surface px-1 text-warning">{value}</mark>;
}

export function ContactEmail() {
  return (
    <a href={`mailto:${SITE.contactEmail}`} className="font-medium text-primary underline underline-offset-4">
      {SITE.contactEmail}
    </a>
  );
}

/** The frame for the Terms, Privacy and Refund pages. */
export function LegalPage({ title, summary, children }: { title: string; summary: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
      <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm text-muted">Last updated {SITE.legal.lastUpdated}</p>
      {!SITE.legal.reviewed && (
        <p role="note" className="mt-6 rounded-xl border border-warning/30 bg-warning-surface px-4 py-3 text-sm text-warning">
          <strong>Draft.</strong> This page hasn&apos;t been reviewed by a lawyer yet and may change before it takes
          effect.
        </p>
      )}
      <p className="mt-8 text-lg text-pretty">{summary}</p>
      <div className="legal-doc mt-10">{children}</div>
    </article>
  );
}
