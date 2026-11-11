"use client";

import { useParams } from "next/navigation";

/**
 * The organization in the URL (/[org]/…), or null outside one. Like
 * useParams, it suspends while the page shell is prerendered, so call it
 * inside a Suspense boundary.
 */
export function useOrgSlug(): string | null {
  const params = useParams<{ org?: string }>();
  return typeof params?.org === "string" ? params.org : null;
}
