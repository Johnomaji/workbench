/**
 * Plans and prices: the one place the pricing pages read from, and (with
 * billing) the limits each organization gets. Plans differ only in how many
 * people they allow; every plan has every feature.
 *
 * Prices are in minor units (cents), as payment providers expect. They're
 * placeholders until launch.
 */

export const TRIAL_DAYS = 14;
export const PLAN_CURRENCY = "USD";

/** A year costs this many months; the rest are free. */
export const YEARLY_PRICE_MONTHS = 10;
export const YEARLY_FREE_MONTHS = 12 - YEARLY_PRICE_MONTHS;

export type PlanId = "starter" | "team" | "business";
export type BillingInterval = "month" | "year";

export type Plan = {
  id: PlanId;
  name: string;
  summary: string;
  /**
   * Everyone who can sign in to the organization, plus invitations not accepted
   * yet. Deactivated people don't count.
   */
  maxMembers: number;
  monthlyPrice: number;
  yearlyPrice: number;
  recommended?: boolean;
};

function plan(fields: Omit<Plan, "yearlyPrice">): Plan {
  return { ...fields, yearlyPrice: fields.monthlyPrice * YEARLY_PRICE_MONTHS };
}

/** Smallest first. */
export const PLANS: readonly Plan[] = [
  plan({
    id: "starter",
    name: "Starter",
    summary: "For a small team getting its hand-offs in order.",
    maxMembers: 10,
    monthlyPrice: 39_00,
  }),
  plan({
    id: "team",
    name: "Team",
    summary: "For a busy team with several people on every piece of work.",
    maxMembers: 30,
    monthlyPrice: 99_00,
    recommended: true,
  }),
  plan({
    id: "business",
    name: "Business",
    summary: "For a whole department, or several teams working together.",
    maxMembers: 100,
    monthlyPrice: 249_00,
  }),
];

export const LARGEST_PLAN = PLANS[PLANS.length - 1];

/** What every plan includes. Only list what the product does today. */
export const PLAN_FEATURES = [
  "Unlimited items",
  "Assign, hand on, send back and reassign work",
  "Steps that run side by side",
  "The board, its filters and My work",
  "Rich-text scripts with one-click copy",
  "Activity history on every item",
  "Roles, invitations and access control",
  "Help by email",
] as const;

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/** The smallest plan with room for this many people, or undefined when even the largest is too small. */
export function smallestPlanFor(members: number): Plan | undefined {
  return PLANS.find((p) => p.maxMembers >= members);
}

export function planPrice(p: Plan, interval: BillingInterval): number {
  return interval === "year" ? p.yearlyPrice : p.monthlyPrice;
}

/** "$39", "$1,990", "$9.50". Whole amounts drop the cents. */
export function formatPrice(minor: number, currency: string = PLAN_CURRENCY): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}
