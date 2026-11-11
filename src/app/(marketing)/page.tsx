import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { TRIAL_DAYS } from "@/lib/plans";
import { SITE } from "@/lib/site";
import { BoardPreview } from "./board-preview";
import { Faq } from "./faq";
import { PricingTable } from "./pricing-table";
import { shareMetadata } from "./share";

const title = `${SITE.name}: ${SITE.tagline.toLowerCase()}`;

export const metadata: Metadata = {
  title: { absolute: title },
  ...shareMetadata({ title, description: SITE.description, path: "/" }),
};

const TRIAL_LINE = `${TRIAL_DAYS} days free. No card needed.`;

function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary-surface text-primary">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow && <p className="text-sm font-semibold text-primary">{eyebrow}</p>}
      <h2 id={id} className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {children && <p className="mt-4 text-lg text-muted text-pretty">{children}</p>}
    </div>
  );
}

const PAINS = [
  { title: "“Who has it now?”", text: "Work sits with someone and nobody else can tell where it is or how far along it got." },
  { title: "“Is it ready yet?”", text: "The next person keeps asking, or starts too early on a version that's about to change." },
  { title: "“Why did this come back?”", text: "Feedback is scattered across chats and calls, so fixes miss the point and deadlines slip." },
];

const STEPS = [
  {
    title: "Start it",
    text: "Create an item with a brief and a deadline. Give the first step to someone, or leave it for anyone with the right role to pick up.",
  },
  {
    title: "Hand it on",
    text: "When someone finishes their step, they submit it and it moves on. It shows up in the next person's My work, ready to start.",
  },
  {
    title: "Work side by side",
    text: "Some steps run at the same time, like design and video. The item only moves on once all of them are done.",
  },
  {
    title: "Send it back, or sign it off",
    text: "If something isn't right, it goes back a step with a note saying why. A project manager gives the final approval, and it's done.",
  },
];

const WORKFLOW: Array<Array<{ step: string; role: string }>> = [
  [{ step: "Script", role: "Script writer" }],
  [{ step: "Edit", role: "Content editor" }],
  [
    { step: "Design", role: "Graphic designer" },
    { step: "Video", role: "Video editor" },
  ],
  [{ step: "Final review", role: "Project manager" }],
];

const FEATURES: Array<{ title: string; text: string; icon: ReactNode }> = [
  {
    title: "One board for the team",
    text: "A column for every step, filters by person, deadline and status, and overdue work that stands out.",
    icon: <path d="M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z" />,
  },
  {
    title: "My work",
    text: "Each person's own list: what's their turn, what's up for grabs, and what's coming their way.",
    icon: <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />,
  },
  {
    title: "Clear ownership",
    text: "Every step has one owner, or a pool of people with the right role. Project managers can reassign work at any time.",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  },
  {
    title: "Send-backs with reasons",
    text: "Sending work back needs a note, and the note stays on the item, so nobody digs through chats to find out what to fix.",
    icon: <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  },
  {
    title: "Scripts inside the item",
    text: "Write and edit scripts right in the item, with headings and lists, and copy them out in one click.",
    icon: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" />,
  },
  {
    title: "A history of every item",
    text: "Who did what and when: hand-offs, send-backs, reassignments and approvals, kept on the item.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    title: "People and roles",
    text: "Invite your team by email, give each person one or more roles, and deactivate leavers without losing their work.",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5a6.5 6.5 0 0 1 3 5.5" />
      </>
    ),
  },
  {
    title: "One account, many teams",
    text: "Freelancers and agencies switch between the organizations they work with, without signing out.",
    icon: <path d="M4 7h10l-3-3M20 17H10l3 3" />,
  },
];

const SAFEGUARDS = [
  {
    title: "Kept apart from everyone else",
    text: "Every page and every change is checked against your organization, and the database itself refuses anything that would mix two organizations.",
  },
  {
    title: "Access you control",
    text: "Administrators decide who's in and what they can do. Deactivating someone signs them out everywhere, straight away.",
  },
  {
    title: "Careful with sign-ins",
    text: "Passwords are stored hashed, sessions are encrypted, and repeated sign-in attempts are blocked for a while.",
  },
  {
    title: "Nothing quietly deleted",
    text: "If a trial ends or a payment stops, your organization turns read-only. Your work stays put.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section aria-labelledby="hero-title" className="overflow-hidden bg-linear-to-b from-primary-surface/70 to-background">
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-16 sm:pt-24 sm:pb-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold text-primary">Work management for teams that hand work on</p>
            <h1 id="hero-title" className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              {SITE.tagline}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted text-pretty sm:text-xl">
              {SITE.name} moves every piece of work from step to step and person to person. Everyone can see what&apos;s
              theirs, what&apos;s next and what&apos;s running late, without chasing anyone.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/signup" className="px-6">
                Start your free trial
              </ButtonLink>
              <ButtonLink href="#how-it-works" variant="secondary" className="px-6">
                See how it works
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-muted">{TRIAL_LINE}</p>
          </div>
          <div className="mt-14 sm:mt-16">
            <BoardPreview />
          </div>
        </div>
      </section>

      {/* The problem */}
      <section aria-labelledby="problem-title" className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <SectionHeading id="problem-title" title="When work passes through several people, things slip" />
        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {PAINS.map((pain) => (
            <li key={pain.title} className="rounded-2xl border border-border bg-surface p-6">
              <p className="text-lg font-semibold">{pain.title}</p>
              <p className="mt-2 text-muted">{pain.text}</p>
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-10 max-w-2xl text-center text-lg text-pretty">
          {SITE.name} gives every piece of work one place, with its steps, its people and its history.
        </p>
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-16 border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <SectionHeading id="how-title" eyebrow="How it works" title="How a piece of work moves" />
          <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <p className="mt-4 font-semibold">{step.title}</p>
                <p className="mt-2 text-muted">{step.text}</p>
              </li>
            ))}
          </ol>

          <div className="mt-16 rounded-2xl border border-border bg-background p-6 sm:p-8">
            <div className="max-w-2xl">
              <h3 className="text-lg font-semibold">Ready on day one</h3>
              <p className="mt-1 text-muted">
                Every organization starts with a production workflow and roles that suit most content work. Invite your
                team, give them roles, and start.
              </p>
            </div>
            <ol aria-label="The ready-made workflow" className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-stretch">
              {WORKFLOW.map((stage, index) => (
                <li key={stage[0].step} className="flex flex-col gap-3 lg:flex-1 lg:flex-row lg:items-center">
                  <div className={cn("flex flex-1 gap-2", stage.length > 1 ? "flex-col sm:flex-row lg:flex-col" : "")}>
                    {stage.map((s) => (
                      <div key={s.step} className="flex-1 rounded-xl border border-border bg-surface px-4 py-3">
                        <p className="font-medium">{s.step}</p>
                        <p className="text-sm text-muted">{s.role}</p>
                      </div>
                    ))}
                    {stage.length > 1 && <span className="sr-only">These two run at the same time.</span>}
                  </div>
                  {index < WORKFLOW.length - 1 && (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="mx-auto size-5 shrink-0 rotate-90 text-muted lg:mx-0 lg:rotate-0"
                    >
                      <path d="M7.22 4.22a.75.75 0 0 1 1.06 0l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 0 1-1.06-1.06L11.94 10 7.22 5.28a.75.75 0 0 1 0-1.06Z" />
                    </svg>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" aria-labelledby="features-title" className="scroll-mt-16 mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <SectionHeading id="features-title" eyebrow="Features" title="Everything a hand-off needs">
          All of it is there from the first day, with nothing to set up first.
        </SectionHeading>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="rounded-2xl border border-border bg-surface p-6">
              <Icon>{feature.icon}</Icon>
              <p className="mt-4 font-semibold">{feature.title}</p>
              <p className="mt-2 text-sm text-muted">{feature.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Safeguards */}
      <section aria-labelledby="safe-title" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <SectionHeading id="safe-title" eyebrow="Security" title="Your work stays yours" />
          <ul className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2">
            {SAFEGUARDS.map((item) => (
              <li key={item.title} className="flex gap-4">
                <Icon>
                  <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" />
                  <path d="m9 12 2 2 4-4" />
                </Icon>
                <div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-muted">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-16 mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <SectionHeading id="pricing-title" eyebrow="Pricing" title="Priced by team size, not by feature">
          Every plan has everything. Start free for {TRIAL_DAYS} days.
        </SectionHeading>
        <div className="mt-12">
          <PricingTable />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 mx-auto max-w-3xl px-4 pb-16 sm:pb-24">
        <SectionHeading id="faq-title" title="Questions" />
        <div className="mt-10">
          <Faq />
        </div>
      </section>

      {/* Final call to action */}
      <section aria-labelledby="cta-title" className="mx-auto max-w-6xl px-4 pb-16 sm:pb-24">
        <div className="rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12">
          <h2 id="cta-title" className="text-3xl font-semibold tracking-tight text-balance">
            Give your team one place to hand work on
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg opacity-90">Set up your organization in a few minutes. {TRIAL_LINE}</p>
          <ButtonLink
            href="/signup"
            variant="secondary"
            className="mt-8 border-transparent px-6 text-foreground"
          >
            Start your free trial
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
