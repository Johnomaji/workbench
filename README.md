# Workbench

Work management for teams that hand work to each other, run as a service (SaaS) for many
customer organizations. The first module is the **Media** workflow: script writer → content
editor → graphic designer and video editor (in parallel) → project manager review.

> Status: **Phase 3 + organizations + public site**. Done so far: the public site (landing page,
> pricing, Terms, Privacy, Refunds), self-service sign-up, organizations with
> their own people, items and settings, sign-in, roles, rate limiting, people management,
> content items with the full workflow (create, assign, pick up, start, submit, send back,
> reassign, request changes), the board with filters, the item page with a rich-text script
> editor and "Copy script", "My work", light/dark theme, and a platform page for whoever runs
> the service.
> Phase 4 adds comments, attachments and script version history. Billing (plans, the trial,
> limits and payments) is next.

## Public site

`/` is the landing page, with `/pricing`, `/terms`, `/privacy` and `/refunds`. They're open to
everyone, prerendered at build time (`ensureStatic = "navigation"` makes the build fail if they
ever start doing work per request), and the only pages search engines are allowed to index.
Signed-in people who open `/` go straight to their organizations (`/organizations`, which is
also where signing in lands).

Before launch, fill in:

- **`src/lib/site.ts`**: the contact email and the legal details (company name and address,
  governing law, database host, payment provider, where data is stored, how long security
  records are kept). The legal pages highlight anything still in [square brackets]. Once a
  lawyer has reviewed the Terms, Privacy Policy and Refund Policy, set `legal.reviewed` to
  `true` to remove their "Draft" notice.
- **`src/lib/plans.ts`**: plan names, sizes and prices (placeholders for now). The pricing table
  reads everything from here.
- **`APP_URL`**: canonical links, the sitemap and link previews use it, so it must be the real
  address in production (on Vercel the production domain is used when it's unset).

The board picture on the landing page is drawn with the app's own styles
(`src/app/(marketing)/board-preview.tsx`); every name in it is made up.

## Organizations

Every customer is an **organization** with its own address: `/acme/board`, `/acme/items/12`.

- **One account, many organizations.** People sign in once and switch organizations from the
  header. A freelancer can work for several customers with the same email and password.
- **Everything belongs to one organization**: departments, roles, items and their numbers
  (each organization has its own #1), notifications and the audit log.
- **Admins are per organization.** An organization's administrators manage its people and
  settings and nothing else. They can change someone's roles and access in their own
  organization, but if that person's account is also used in another organization, only its
  owner can change its name, email, password or sessions (an admin can still email them a
  reset link, which goes to their own inbox).
- **Sign-up** (`/signup`) asks for a name, email and organization, and emails a link. Nothing
  is created until the link is used, so nobody can sign up with an address they don't own. A
  sign-up with an address that already has an account looks the same on screen; the owner
  gets an email instead. New organizations start with the Media department and workflow, in
  the time zone of the browser that signed up.
- **Signed-in people** can create more organizations (switcher → *Create an organization*).
- **Platform administrators** (whoever runs the service) see every organization at
  `/platform` with a few counts, and can suspend or reactivate one. They see no customer
  content. Create one with `npm run platform-admin:create`.

How isolation is enforced:

1. Every organization page and action goes through `requireOrgUser` / `requireOrgUserForAction`
   (`src/server/auth/session.ts`), which re-checks membership of that organization in the
   database on every request. Someone who isn't an active member of an active organization
   gets a 404 that looks the same as for an organization that doesn't exist.
2. Every query is scoped to that organization, and anything looked up by id (an item, a task,
   a person, a role) is looked up *inside* it, so another organization's ids are simply not
   found.
3. The permission rules (`src/server/permissions/policy.ts`) only give an admin rights over
   their own organization's departments, and refuse items from another organization.
4. The database itself refuses rows that cross organizations: roles, role memberships and
   items use composite foreign keys `(organizationId, …)`.

`src/server/orgs/tenancy.db.test.ts` tries to break all of this with two organizations and a
person who belongs to both.

## Requirements

- Node.js 22.12 or newer
- PostgreSQL 15 or newer (tested on 18). Locally any Postgres works; in production use Neon or Supabase.

## Set up locally

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then edit it (see below)
```

In `.env`:

1. Point `DATABASE_URL` and `DIRECT_URL` at an empty database. Locally they can be the same URL.
2. Set `AUTH_SECRET` to a long random value:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

Then create the tables, add sample data and start the app:

```bash
npm run db:deploy           # apply migrations
npm run db:seed             # fictional users + one sample content item (safe to re-run)
npm run dev                 # http://localhost:3000
```

### Sample accounts

All seeded accounts use the password in `SEED_PASSWORD` (default `dev-password-123`).
Every name and address is fictional. There are two organizations, **Acme Media** (`/acme`)
and **Globex Studio** (`/globex`).

| Email | Where |
| --- | --- |
| admin@example.com | Acme: administrator |
| pm@example.com | Acme: project manager |
| writer@example.com, writer2@example.com | Acme: script writer |
| editor@example.com | Acme: content editor |
| designer@example.com | **Both** Acme and Globex: graphic designer (shows the organization switcher) |
| designer2@example.com | Acme: graphic designer |
| video@example.com, video2@example.com | Acme: video editor |
| pending@example.com | Acme: content editor, invite not accepted yet (can't sign in) |
| former@example.com | Acme: video editor, deactivated (can sign in, but has no organization) |
| globex-admin@example.com | Globex: administrator and project manager |
| globex-writer@example.com | Globex: script writer |
| platform@example.com | Platform administrator (`/platform`), in no organization |

Acme gets three fictional content items (one being drafted, one waiting for an editor, one
with design done and video in progress) and Globex one draft. Both start at #1.

With `EMAIL_PROVIDER=console`, emails (invites, password resets) are printed in the terminal
running `npm run dev`, including the link.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm test` | Run the unit tests (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:migrate` | Create a new migration after changing `prisma/schema.prisma` (development) |
| `npm run db:deploy` | Apply pending migrations (any environment) |
| `npm run db:seed` | Load the sample data |
| `npm run db:studio` | Browse the database |
| `npm run platform-admin:create -- --email=… --name="…"` | Create or restore a platform administrator (prints a temporary password) |

Use these npm scripts rather than `npx prisma …`; they work even when `npx` doesn't.

## Tests

```bash
npm test
```

The workflow rules (who can do what, parallel design and video, send-backs, reassignment)
are tested without a database in `src/server/workflow/engine.test.ts`, and the permission
rules (including that admins only reach their own organization) in
`src/server/permissions/policy.test.ts`. The board's columns
and filters are tested the same way in `src/server/board/model.test.ts`, and the script
format check in `src/server/validation/script.test.ts`.

To also run the tests that need a real database (the item services under concurrency, history
and draft privacy, tenant isolation and sign-up, and the Postgres rate limiter), create a
**separate** database, migrate it and set `TEST_DATABASE_URL`. Those tests wipe that database
each run, and test files then run one at a time:

```bash
DIRECT_URL="postgresql://…/workbench_test" npm run db:deploy
TEST_DATABASE_URL="postgresql://…/workbench_test" npm test
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Pooled connection used by the app |
| `DIRECT_URL` | yes | Direct connection used by migrations and the seed |
| `AUTH_SECRET` | yes | Encrypts session cookies |
| `APP_URL` | no | Base URL for links in emails. On Vercel, the production domain is used if unset |
| `EMAIL_PROVIDER` | no | `console` (default) or `resend` |
| `EMAIL_FROM` | with Resend | Sender, e.g. `Workbench <no-reply@yourdomain>`; the domain must be verified in Resend |
| `RESEND_API_KEY` | with Resend | Resend API key |
| `AUTH_TRUST_HOST` | not on Vercel | Set to `true` when self-hosting, and for `npm start` on your own machine |
| `SEED_PASSWORD` | no | Password for seeded accounts |
| `TEST_DATABASE_URL` | no | Enables the database-backed tests |

## Deploying to Vercel (summary)

1. Create a Postgres database on Neon or Supabase. Copy its **pooled** URL into `DATABASE_URL`
   and its **direct** URL into `DIRECT_URL` in the Vercel project settings.
2. Set `AUTH_SECRET`, and `EMAIL_PROVIDER=resend` with `RESEND_API_KEY` and `EMAIL_FROM`.
3. Apply migrations against production before (or as part of) each deploy:
   `DIRECT_URL="<production direct url>" npm run db:deploy`.
4. Don't seed production. Customers create their organizations at `/signup`. Create your own
   platform administrator with:
   `DIRECT_URL="<production direct url>" npm run platform-admin:create -- --email=you@yourcompany.com --name="Your Name"`.
   It prints a one-time temporary password that must be changed at first sign-in.
5. Email must work in production (`EMAIL_PROVIDER=resend`): sign-up depends on it.

**Upgrading a database that already has data (from before organizations):** the migration
`20261110120000_organizations` moves everything into one organization called
"My organization" at `/my-organization`. Everyone becomes a member, keeping their admin rights
and deactivation. Sign in as an administrator and rename it under **Settings**.

## How it's organised

```
prisma/                 schema, migrations, seed
src/proxy.ts            sends signed-out visitors of the app to /login (optimistic check only)
src/app/(marketing)/    the public site: landing page, pricing, Terms, Privacy, Refunds
src/app/(auth)/         sign in, sign up, forgot password, set password
src/app/(app)/          signed-in pages outside an organization: your organizations, account,
                        create an organization, platform
src/app/(app)/[org]/    an organization's pages: my work, board, items, people, settings
src/server/             no React: auth, permissions, admin services, validation, providers
  auth/session.ts       Data Access Layer: every page/action re-checks the user and their
                        membership of the organization in the database
  auth/signup.ts        self-service sign-up (two steps, confirmed by email)
  orgs/                 organizations: create, settings, platform admin; provision.ts sets up
                        the starter Media department (also used by the seed)
  permissions/policy.ts pure permission rules (unit-tested)
  workflow/engine.ts    the workflow state machine: pure functions, no database (unit-tested)
  items/                loads an item under a row lock, runs the engine, saves the result
  board/model.ts        board columns, cards and filters: pure functions (unit-tested)
  validation/script.ts  checks every saved script against the editor's format
src/lib/script-*.ts     what a script may contain (shared by editor and server), text/HTML for copying
src/lib/site.ts         public details of the service (contact, legal)
src/lib/plans.ts        plans and prices
  providers/            email and rate limiting behind small interfaces
src/components/ui/      shared, accessible UI pieces
```

Security notes:
- Organizations are isolated from each other in the code and in the database (see Organizations
  above).
- Sessions are encrypted, httpOnly cookies, and every request re-checks the database. Deactivating
  someone, suspending an organization, "sign out everywhere" and password changes therefore take
  effect immediately. A cookie that stops working is removed on the way to sign-in
  (`/api/session-ended`), so it can't keep someone away from the public site.
- The app can't be shown inside another site's frame (`X-Frame-Options: DENY`).
- Every server action re-checks the session and permissions itself, and validates its input with Zod.
- Sign-in, sign-up, password reset, organization creation and admin actions are rate limited in
  Postgres (shared across instances).
- Passwords use bcrypt (cost 12). Invite and reset links are single-use; only their hash is stored.
