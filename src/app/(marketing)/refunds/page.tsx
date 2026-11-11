import type { Metadata } from "next";
import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/plans";
import { SITE } from "@/lib/site";
import { ContactEmail, LegalPage } from "../legal-page";
import { shareMetadata } from "../share";

export const metadata: Metadata = {
  title: "Refund Policy",
  ...shareMetadata({ title: `Refund Policy · ${SITE.name}`, description: `When ${SITE.name} gives refunds, and how to ask for one.`, path: "/refunds" }),
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund Policy"
      summary={
        <>
          You can try {SITE.name} free for {TRIAL_DAYS} days before paying anything, and cancel whenever you like. This page
          explains when we refund a payment.
        </>
      }
    >
      <h2>1. Try before you pay</h2>
      <p>
        Every organization starts with a free trial of {TRIAL_DAYS} days, with no card needed, so you can be sure{" "}
        {SITE.name} suits your team before you pay.
      </p>

      <h2>2. Cancelling</h2>
      <p>
        An administrator can cancel at any time. The organization keeps its plan until the end of the month or year
        already paid for, and isn&apos;t charged again. We don&apos;t refund the unused part of a period, except as
        described below.
      </p>

      <h2>3. When we refund</h2>
      <ul>
        <li>
          <strong>Changed your mind:</strong> if you ask within 14 days of your organization&apos;s first payment for a
          plan, we refund that payment in full.
        </li>
        <li>
          <strong>Our mistake:</strong> if you were charged twice, charged the wrong amount, or charged after cancelling,
          we refund the extra charge in full.
        </li>
        <li>
          <strong>Long outages:</strong> if {SITE.name} is unavailable for an unusually long time, tell us and we&apos;ll
          make it right, for example with a partial refund or free time.
        </li>
      </ul>

      <h2>4. How to ask</h2>
      <p>
        Email <ContactEmail /> from the address of one of your organization&apos;s administrators, and include your
        organization&apos;s web address (the part after the site&apos;s address, like <em>/your-team</em>) and the date
        of the payment. We reply within 5 working days.
      </p>

      <h2>5. How refunds are paid</h2>
      <p>
        Refunds go back to the card or account that paid. Depending on your bank, they can take 5–10 working days to
        appear.
      </p>

      <p>
        See also the <Link href="/terms">Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}
