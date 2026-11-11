import { describe, expect, it } from "vitest";
import {
  formatPrice,
  getPlan,
  LARGEST_PLAN,
  PLANS,
  planPrice,
  smallestPlanFor,
  YEARLY_FREE_MONTHS,
  YEARLY_PRICE_MONTHS,
} from "./plans";

describe("plans", () => {
  it("have unique ids and go from smallest to largest, getting dearer", () => {
    expect(new Set(PLANS.map((p) => p.id)).size).toBe(PLANS.length);
    for (let i = 1; i < PLANS.length; i++) {
      expect(PLANS[i].maxMembers).toBeGreaterThan(PLANS[i - 1].maxMembers);
      expect(PLANS[i].monthlyPrice).toBeGreaterThan(PLANS[i - 1].monthlyPrice);
    }
    expect(LARGEST_PLAN).toBe(PLANS[PLANS.length - 1]);
  });

  it("price a year as the advertised number of months", () => {
    expect(YEARLY_PRICE_MONTHS + YEARLY_FREE_MONTHS).toBe(12);
    for (const p of PLANS) {
      expect(Number.isInteger(p.monthlyPrice) && p.monthlyPrice > 0).toBe(true);
      expect(planPrice(p, "year")).toBe(p.monthlyPrice * YEARLY_PRICE_MONTHS);
      expect(planPrice(p, "month")).toBe(p.monthlyPrice);
    }
  });

  it("recommend exactly one plan", () => {
    expect(PLANS.filter((p) => p.recommended)).toHaveLength(1);
  });

  it("find the smallest plan with room", () => {
    expect(smallestPlanFor(1)).toBe(PLANS[0]);
    expect(smallestPlanFor(PLANS[0].maxMembers)).toBe(PLANS[0]);
    expect(smallestPlanFor(PLANS[0].maxMembers + 1)).toBe(PLANS[1]);
    expect(smallestPlanFor(LARGEST_PLAN.maxMembers + 1)).toBeUndefined();
    expect(getPlan("team")?.id).toBe("team");
    expect(getPlan("nope")).toBeUndefined();
  });
});

describe("formatPrice", () => {
  it("shows whole amounts without cents and keeps cents otherwise", () => {
    expect(formatPrice(39_00)).toBe("$39");
    expect(formatPrice(2490_00)).toBe("$2,490");
    expect(formatPrice(9_50)).toBe("$9.50");
  });

  it("uses the local symbol for other currencies", () => {
    expect(formatPrice(15000_00, "NGN")).toBe("₦15,000");
  });
});
