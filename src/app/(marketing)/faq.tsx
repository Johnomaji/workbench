import type { ReactNode } from "react";
import { LARGEST_PLAN, TRIAL_DAYS } from "@/lib/plans";
import { SITE } from "@/lib/site";

type Question = { id: string; question: string; answer: ReactNode; billing?: boolean };

const mail = (
  <a href={`mailto:${SITE.contactEmail}`} className="font-medium text-primary underline underline-offset-4">
    {SITE.contactEmail}
  </a>
);

const QUESTIONS: Question[] = [
  {
    id: "trial",
    billing: true,
    question: "How does the free trial work?",
    answer: (
      <>
        Every new organization gets everything for {TRIAL_DAYS} days, with no card needed. When the trial ends, your
        organization becomes read-only until an administrator picks a plan: everyone can still sign in and see their
        work, and nothing is deleted.
      </>
    ),
  },
  {
    id: "who-counts",
    billing: true,
    question: "Who counts towards the number of people?",
    answer: (
      <>
        Everyone who can sign in to your organization, plus invitations that haven&apos;t been accepted yet. People
        you&apos;ve deactivated don&apos;t count, and deactivating someone keeps everything they worked on.
      </>
    ),
  },
  {
    id: "change-plan",
    billing: true,
    question: "Can we change plans later?",
    answer: <>Yes, any time, from your organization&apos;s Billing page. You can also cancel whenever you like.</>,
  },
  {
    id: "stop-paying",
    billing: true,
    question: "What happens to our work if we stop paying?",
    answer: (
      <>
        Your organization becomes read-only. Your items, scripts and history stay where they are, and an administrator
        can pick a plan again at any time to carry on. If you&apos;d rather have it deleted, email us at {mail}.
      </>
    ),
  },
  {
    id: "bigger",
    billing: true,
    question: `We have more than ${LARGEST_PLAN.maxMembers} people. Can we still use it?`,
    answer: <>Yes. Email us at {mail} and we&apos;ll set up a plan that fits.</>,
  },
  {
    id: "steps",
    question: "Can we use our own steps and roles?",
    answer: (
      <>
        Not by yourself yet. Every organization starts with the ready-made production workflow shown above (script,
        edit, design and video side by side, then a final review) and its roles, which suit most content work. If your
        team needs different steps, tell us at {mail}.
      </>
    ),
  },
  {
    id: "several-teams",
    question: "I work with several teams. Do I need several accounts?",
    answer: (
      <>
        No. One account can belong to as many organizations as you&apos;re invited to, and you switch between them from
        the top of the page. Each organization only ever sees its own work.
      </>
    ),
  },
  {
    id: "separate",
    question: "Can other organizations see our work?",
    answer: (
      <>
        No. Every page and every change is checked against your organization, and the database itself refuses anything
        that would mix two organizations&apos; data. Administrators only manage their own organization.
      </>
    ),
  },
];

/** Common questions as an accordion that works without JavaScript. */
export function Faq({ only }: { only?: "billing" }) {
  const questions = only === "billing" ? QUESTIONS.filter((q) => q.billing) : QUESTIONS;
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
      {questions.map((q) => (
        <details key={q.id} className="group px-5 sm:px-6">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
            {q.question}
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
            >
              <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </summary>
          <p className="pb-5 text-muted">{q.answer}</p>
        </details>
      ))}
    </div>
  );
}
