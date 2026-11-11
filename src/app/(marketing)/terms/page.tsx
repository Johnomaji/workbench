import type { Metadata } from "next";
import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/plans";
import { SITE } from "@/lib/site";
import { ContactEmail, Fill, LegalPage } from "../legal-page";
import { shareMetadata } from "../share";

export const metadata: Metadata = {
  title: "Terms of Service",
  ...shareMetadata({ title: `Terms of Service · ${SITE.name}`, description: `The terms for using ${SITE.name}.`, path: "/terms" }),
};

export default function TermsPage() {
  const { legal } = SITE;
  return (
    <LegalPage
      title="Terms of Service"
      summary={
        <>
          These terms are the agreement between you and <Fill value={legal.companyName} /> (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;) for using {SITE.name}. We&apos;ve kept them as plain as we can. By creating an account or an
          organization, you agree to them.
        </>
      }
    >
      <h2>1. Who these terms apply to</h2>
      <p>
        {SITE.name} is used by <strong>organizations</strong> (a company or team) and the <strong>people</strong> in
        them. If you create an organization or sign up on behalf of one, you confirm you&apos;re allowed to accept these
        terms for it, and they then apply to the organization as well as to you.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>Give us accurate details, and keep your password to yourself.</li>
        <li>You&apos;re responsible for what happens under your account. Tell us straight away if you think someone else has used it.</li>
        <li>You must be at least 16 years old to use {SITE.name}.</li>
        <li>
          An organization&apos;s administrators decide who can join it, what each person can do, and when someone&apos;s
          access ends.
        </li>
      </ul>

      <h2>3. Your work belongs to you</h2>
      <p>
        Everything your organization puts into {SITE.name} (items, briefs, scripts, notes and the rest) stays yours. You
        give us permission to store, copy and display it only as needed to run the service for you. We don&apos;t sell it,
        and we don&apos;t use it for advertising. See the <Link href="/privacy">Privacy Policy</Link> for details.
      </p>

      <h2>4. Fair use</h2>
      <p>Please don&apos;t:</p>
      <ul>
        <li>use {SITE.name} for anything illegal, or to store or share content you don&apos;t have the right to;</li>
        <li>try to reach another organization&apos;s data, or get around sign-in, limits or other protections;</li>
        <li>overload, disrupt or probe the service, or use automated tools to sign up or sign in;</li>
        <li>resell or rebrand {SITE.name} without our written agreement.</li>
      </ul>

      <h2>5. Free trial and plans</h2>
      <ul>
        <li>
          Every new organization gets a free trial of {TRIAL_DAYS} days with no card needed. When it ends, the organization
          becomes read-only until an administrator picks a plan.
        </li>
        <li>
          Plans and prices are shown on the <Link href="/pricing">pricing page</Link>. Each plan allows a number of people
          in the organization.
        </li>
        <li>
          Plans are paid in advance, monthly or yearly, and renew automatically until cancelled. Prices don&apos;t include
          taxes unless they say so.
        </li>
        <li>If we change a price, we&apos;ll tell administrators at least 30 days before it applies to them.</li>
        <li>
          If a payment fails and isn&apos;t sorted out, the organization becomes read-only. Nothing is deleted because of
          it.
        </li>
      </ul>

      <h2>6. Cancelling</h2>
      <p>
        An administrator can cancel at any time. The organization keeps its plan until the end of the period already paid
        for, then becomes read-only. Refunds are covered by our <Link href="/refunds">Refund Policy</Link>.
      </p>

      <h2>7. Suspending or ending access</h2>
      <p>
        We may suspend an account or organization that breaks these terms, puts the service or other customers at risk,
        or hasn&apos;t paid. Where we reasonably can, we&apos;ll tell you first and give you a chance to fix it. You can
        stop using {SITE.name} at any time.
      </p>

      <h2>8. The service</h2>
      <p>
        We work hard to keep {SITE.name} running and your work safe, but we can&apos;t promise it will always be available
        or free of errors. We improve the service all the time, which can mean changing or removing features. If a change
        takes away something important you pay for, we&apos;ll tell you in advance.
      </p>

      <h2>9. Liability</h2>
      <p>
        {SITE.name} is provided &ldquo;as is&rdquo;. As far as the law allows, we aren&apos;t liable for indirect or
        consequential losses (such as lost profits or lost business), and our total liability to you for any claim is
        limited to what your organization paid us in the 12 months before it. Nothing in these terms limits liability that
        can&apos;t be limited by law.
      </p>

      <h2>10. Changes to these terms</h2>
      <p>
        If we make important changes, we&apos;ll tell administrators by email or in the app before they take effect.
        Carrying on using {SITE.name} after that means you accept the new terms.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These terms are governed by the laws of <Fill value={legal.governingLaw} />, and its courts deal with any dispute
        we can&apos;t settle by talking.
      </p>

      <h2>12. Contact</h2>
      <p>
        <Fill value={legal.companyName} />, <Fill value={legal.companyAddress} />. Email: <ContactEmail />.
      </p>
    </LegalPage>
  );
}
