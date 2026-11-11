import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { ContactEmail, Fill, LegalPage } from "../legal-page";
import { shareMetadata } from "../share";

export const metadata: Metadata = {
  title: "Privacy Policy",
  ...shareMetadata({ title: `Privacy Policy · ${SITE.name}`, description: `What ${SITE.name} collects, why, and what you can do about it.`, path: "/privacy" }),
};

export default function PrivacyPage() {
  const { legal } = SITE;
  return (
    <LegalPage
      title="Privacy Policy"
      summary={
        <>
          This explains what personal information {SITE.name} collects, why, who else handles it, and your rights. In
          short: we collect what we need to run the service, we don&apos;t sell it, and we don&apos;t show ads.
        </>
      }
    >
      <h2>1. Who we are</h2>
      <p>
        {SITE.name} is run by <Fill value={legal.companyName} />, <Fill value={legal.companyAddress} />. We&apos;re
        responsible for account and billing information. For the work an organization keeps in {SITE.name}, that
        organization decides what goes in and who can see it, and we look after it on their behalf.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name, email address and password. Passwords are stored as a secure hash,
          never as the password itself.
        </li>
        <li>
          <strong>Organization details:</strong> its name, web address and time zone, who&apos;s in it and their roles.
        </li>
        <li>
          <strong>Work:</strong> what your organization adds, such as items, briefs, scripts, deadlines, notes, and the
          history of who did what and when.
        </li>
        <li>
          <strong>Security records:</strong> the IP address and time of sign-ins and important changes (for example,
          changing someone&apos;s access), used to protect accounts, prevent abuse and investigate problems.
        </li>
        <li>
          <strong>Billing:</strong> which plan an organization is on and its payment history. Card and bank details are
          handled by our payment provider, not stored by us.
        </li>
      </ul>

      <h2>3. Cookies and browser storage</h2>
      <p>
        We use one essential cookie to keep you signed in. Your light or dark mode choice is saved in your browser, not
        sent to us. We don&apos;t use advertising or tracking cookies, so there&apos;s nothing to opt out of.
      </p>

      <h2>4. How we use it</h2>
      <ul>
        <li>to run {SITE.name} and show each organization its own work;</li>
        <li>to send the emails the service needs, like invitations, sign-up confirmations and password resets;</li>
        <li>to keep accounts secure and stop abuse;</li>
        <li>to bill organizations and answer questions you send us.</li>
      </ul>
      <p>We don&apos;t sell personal information, and we don&apos;t use your work to advertise to anyone.</p>

      <h2>5. Who else handles it</h2>
      <p>We use a few trusted providers, only to run the service:</p>
      <ul>
        <li>
          hosting (Vercel) and the database (<Fill value={legal.databaseHost} />);
        </li>
        <li>email delivery (Resend);</li>
        <li>payments (<Fill value={legal.paymentProvider} />).</li>
      </ul>
      <p>
        We may also share information if the law requires it, or to protect people from harm. If {SITE.name} is ever sold
        or merged, we&apos;ll tell you before your information moves to the new owner.
      </p>

      <h2>6. Where it&apos;s stored</h2>
      <p>
        Your information is stored in <Fill value={legal.dataRegion} />. Some providers may handle it in other countries;
        when they do, we use agreements that protect it.
      </p>

      <h2>7. How long we keep it</h2>
      <p>
        We keep your information while your account or organization exists. If you ask us to delete it, we do so within
        30 days, except records we must keep by law (such as invoices). Security records are kept for{" "}
        <Fill value={legal.securityRecordRetention} />.
      </p>

      <h2>8. Your rights</h2>
      <p>
        You can ask to see, correct, export or delete your personal information, or object to how we use it. You can
        change your name and password yourself under <strong>Your account</strong>. For anything else, email{" "}
        <ContactEmail />. For work kept in an organization, ask that organization&apos;s administrators first, since they
        decide what&apos;s kept there. You can also complain to your local data protection authority.
      </p>

      <h2>9. Keeping it safe</h2>
      <p>
        Each organization&apos;s work is kept separate from every other&apos;s and checked on every request. Connections
        are encrypted, sessions are encrypted, and access is limited to what each person needs. No system is perfectly
        secure, so if something goes wrong that affects your information, we&apos;ll tell you promptly.
      </p>

      <h2>10. Children</h2>
      <p>{SITE.name} is for work and isn&apos;t meant for anyone under 16.</p>

      <h2>11. Changes</h2>
      <p>If we make important changes to this policy, we&apos;ll tell you by email or in the app before they apply.</p>

      <h2>12. Contact</h2>
      <p>
        Questions about privacy: <ContactEmail />.
      </p>
    </LegalPage>
  );
}
