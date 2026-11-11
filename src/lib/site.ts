/**
 * Public details of the service, used by the marketing pages, the legal pages
 * and their footer. Values in [square brackets] are placeholders: the legal
 * pages highlight them until they're filled in.
 */
export const SITE = {
  name: "Workbench",
  tagline: "Hand work on without losing track of it",
  description:
    "Work management for teams that hand work on. Every piece of work moves from step to step and person to person, on one board.",
  contactEmail: "hello@example.com",
  legal: {
    companyName: "[Company legal name]",
    companyAddress: "[Registered address]",
    governingLaw: "[Country or state]",
    /** Where the database and files are kept, for the Privacy Policy. */
    dataRegion: "[Region where data is stored]",
    /** Who runs the database (Neon, Supabase…), for the Privacy Policy. */
    databaseHost: "[Database host]",
    /** Payment provider, named in the Privacy Policy once chosen. */
    paymentProvider: "[Payment provider]",
    /** How long sign-in and audit records are kept, for the Privacy Policy. */
    securityRecordRetention: "[How long, e.g. 12 months]",
    lastUpdated: "11 November 2026",
    /** Set to true once a lawyer has reviewed the legal pages; until then they say they're a draft. */
    reviewed: false,
  },
} as const;

/** Public pages: open without signing in, listed in the sitemap. */
export const MARKETING_PATHS = ["/", "/pricing", "/terms", "/privacy", "/refunds"] as const;
