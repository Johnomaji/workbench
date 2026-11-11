"use client";

import { useState, useSyncExternalStore } from "react";
import { TextField } from "@/components/ui/field";
import { SLUG_MAX_LENGTH, slugify } from "@/lib/org-slug";

const noSubscribe = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";

/**
 * Organization name and web address. While someone types a new name, the
 * address follows it, until they change the address themselves. Also sends the
 * browser's time zone, so a new organization's deadlines start out right.
 */
export function OrganizationFields({
  names = { name: "name", slug: "slug" },
  defaultName = "",
  defaultSlug,
  errors = {},
  slugHint,
}: {
  names?: { name: string; slug: string };
  defaultName?: string;
  /** Set when editing an existing organization: the address then never follows the name. */
  defaultSlug?: string;
  errors?: { name?: string; slug?: string };
  slugHint?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [slug, setSlug] = useState(defaultSlug ?? slugify(defaultName));
  const [slugEdited, setSlugEdited] = useState(defaultSlug !== undefined);
  const timeZone = useSyncExternalStore(noSubscribe, browserTimeZone, () => "");

  return (
    <>
      <TextField
        id={names.name}
        name={names.name}
        label="Organization name"
        hint="Your company or team, as people know it."
        autoComplete="organization"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          if (!slugEdited) setSlug(slugify(event.target.value));
        }}
        required
        error={errors.name}
      />
      <TextField
        id={names.slug}
        name={names.slug}
        label="Web address"
        hint={slugHint ?? `Your organization will be at …/${slug || "your-organization"}. Lower-case letters, numbers and hyphens.`}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={SLUG_MAX_LENGTH}
        value={slug}
        onChange={(event) => {
          setSlug(event.target.value.toLowerCase());
          setSlugEdited(true);
        }}
        required
        error={errors.slug}
      />
      <input type="hidden" name="timeZone" value={timeZone} />
    </>
  );
}
