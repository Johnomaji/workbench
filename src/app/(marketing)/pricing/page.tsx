import type { Metadata } from "next";
import { TRIAL_DAYS } from "@/lib/plans";
import { SITE } from "@/lib/site";
import { Faq } from "../faq";
import { PricingTable } from "../pricing-table";
import { shareMetadata } from "../share";

const description = `Plans by team size, with every feature in every plan. Try ${SITE.name} free for ${TRIAL_DAYS} days; no card needed.`;

export const metadata: Metadata = {
  title: "Pricing",
  ...shareMetadata({ title: `Pricing · ${SITE.name}`, description, path: "/pricing" }),
};

export default function PricingPage() {
  return (
    <>
      <section aria-labelledby="pricing-title" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 id="pricing-title" className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Pricing
          </h1>
          <p className="mt-4 text-lg text-muted text-pretty">
            Pick a plan by the size of your team. Every plan has every feature, and every organization starts with{" "}
            {TRIAL_DAYS} days free.
          </p>
        </div>
        <div className="mt-12">
          <PricingTable headingLevel="h2" />
        </div>
      </section>
      <section aria-labelledby="faq-title" className="mx-auto max-w-3xl px-4 pb-16 sm:pb-24">
        <h2 id="faq-title" className="text-center text-3xl font-semibold tracking-tight">
          Questions about plans
        </h2>
        <div className="mt-10">
          <Faq only="billing" />
        </div>
      </section>
    </>
  );
}
