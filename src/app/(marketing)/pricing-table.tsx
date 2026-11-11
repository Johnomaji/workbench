"use client";

import { useId, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  type BillingInterval,
  formatPrice,
  LARGEST_PLAN,
  PLAN_FEATURES,
  PLANS,
  planPrice,
  TRIAL_DAYS,
  YEARLY_FREE_MONTHS,
} from "@/lib/plans";
import { SITE } from "@/lib/site";

function Check({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={cn("size-5 shrink-0 text-success", className)}>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IntervalSwitch({ value, onChange }: { value: BillingInterval; onChange: (v: BillingInterval) => void }) {
  const name = useId();
  const options: Array<{ value: BillingInterval; label: string }> = [
    { value: "month", label: "Monthly" },
    { value: "year", label: `Yearly (${YEARLY_FREE_MONTHS} months free)` },
  ];
  return (
    <fieldset className="inline-flex rounded-lg border border-border bg-surface-muted p-1">
      <legend className="sr-only">Billing period</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex min-h-9 cursor-pointer items-center rounded-md px-3 text-sm font-medium text-muted",
            "has-checked:bg-surface has-checked:text-foreground has-checked:shadow-sm",
            "has-focus-visible:outline-2 has-focus-visible:outline-focus",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

/** The plans side by side. Every plan starts with the same free trial. */
export function PricingTable({ headingLevel = "h3" }: { headingLevel?: "h2" | "h3" }) {
  const [interval, setBillingInterval] = useState<BillingInterval>("month");
  const Heading = headingLevel;

  return (
    <div>
      <div className="flex justify-center">
        <IntervalSwitch value={interval} onChange={setBillingInterval} />
      </div>

      <ul className="mt-8 grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => (
          <li
            key={p.id}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-surface p-6",
              p.recommended ? "border-primary shadow-lg shadow-primary/10" : "border-border",
            )}
          >
            {p.recommended && (
              <p className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                Recommended
              </p>
            )}
            <Heading className="text-lg font-semibold">{p.name}</Heading>
            {/* Two lines tall either way, so the prices line up across plans. */}
            <p className="mt-1 text-sm text-muted lg:min-h-10">{p.summary}</p>
            <p className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight">{formatPrice(planPrice(p, interval))}</span>
              <span className="text-sm text-muted">{interval === "year" ? "/ year" : "/ month"}</span>
            </p>
            <p className="mt-1 min-h-5 text-sm text-muted">
              {interval === "year" ? `Instead of ${formatPrice(p.monthlyPrice * 12)}` : "Billed monthly"}
            </p>
            <p className="mt-5 font-medium">Up to {p.maxMembers} people</p>
            <ButtonLink
              href="/signup"
              variant={p.recommended ? "primary" : "secondary"}
              className="mt-6"
              aria-label={`Start your free trial (${p.name})`}
            >
              Start free trial
            </ButtonLink>
          </li>
        ))}
      </ul>

      <div className="mt-8 rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="font-semibold">Every plan includes everything</p>
            <p className="mt-1 text-sm text-muted">
              Plans differ only in how many people they allow. Try any of them free for {TRIAL_DAYS} days; no card needed.
            </p>
          </div>
          <ul className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {PLAN_FEATURES.map((feature) => (
              <li key={feature} className="flex gap-2">
                <Check />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        More than {LARGEST_PLAN.maxMembers} people?{" "}
        <a href={`mailto:${SITE.contactEmail}`} className="font-medium text-primary underline underline-offset-4">
          Email us
        </a>{" "}
        and we&apos;ll set you up.
      </p>
    </div>
  );
}
