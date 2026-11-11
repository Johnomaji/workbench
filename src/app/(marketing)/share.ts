import type { Metadata } from "next";
import { SITE } from "@/lib/site";

/**
 * Link-preview tags for a public page. Next merges metadata shallowly, so a page
 * that sets its own `openGraph` loses the image from app/opengraph-image.tsx
 * unless it names it again; this always does.
 */
export function shareMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const images = [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE.name}: ${SITE.tagline}` }];
  return {
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE.name, locale: "en", title, description, url: path, images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}
