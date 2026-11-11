-- Organizations: one database, many customers.
--
-- Existing data (a single company) moves into one organization called
-- "My organization" at /my-organization. Rename it under Settings afterwards.
-- On an empty database no organization is created.
--
-- Admin rights and deactivation move from the user to their membership of the
-- organization, item numbers become per organization, and the links between
-- tenant-owned rows get composite foreign keys so they can't cross organizations.

-- ── New tables ──────────────────────────────────────────────────────────

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "suspendedAt" TIMESTAMP(3),
    "itemCounter" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PendingSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "organizationSlug" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
CREATE UNIQUE INDEX "PendingSignup_tokenHash_key" ON "PendingSignup"("tokenHash");
CREATE INDEX "PendingSignup_email_idx" ON "PendingSignup"("email");
CREATE INDEX "PendingSignup_expiresAt_idx" ON "PendingSignup"("expiresAt");

-- ── Existing data → the first organization ──────────────────────────────

INSERT INTO "Organization" ("id", "slug", "name", "itemCounter", "createdAt", "updatedAt")
SELECT
    'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    'my-organization',
    'My organization',
    COALESCE((SELECT MAX("number") FROM "ContentItem"), 0),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "User") OR EXISTS (SELECT 1 FROM "Department");

-- Everyone becomes a member, keeping their admin rights and deactivation.
-- People who never chose a password haven't joined yet.
INSERT INTO "OrganizationMember" ("id", "organizationId", "userId", "isAdmin", "isActive", "deactivatedAt", "joinedAt", "createdAt", "updatedAt")
SELECT
    'c' || substr(md5(u."id" || random()::text || clock_timestamp()::text), 1, 24),
    o."id",
    u."id",
    u."isAdmin",
    u."isActive",
    u."deactivatedAt",
    CASE WHEN u."passwordHash" IS NULL THEN NULL ELSE COALESCE(u."lastLoginAt", u."createdAt") END,
    u."createdAt",
    CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN "Organization" o;

-- ── Tenant columns: add, fill, then require ─────────────────────────────

ALTER TABLE "Department" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Role" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Membership" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "ContentItem" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "organizationId" TEXT;

UPDATE "Department" SET "organizationId" = (SELECT "id" FROM "Organization");
UPDATE "Role" SET "organizationId" = (SELECT "id" FROM "Organization");
UPDATE "Membership" SET "organizationId" = (SELECT "id" FROM "Organization");
UPDATE "ContentItem" SET "organizationId" = (SELECT "id" FROM "Organization");
UPDATE "Notification" SET "organizationId" = (SELECT "id" FROM "Organization");
-- Sign-in events belong to the person, not to an organization.
UPDATE "AuditLog" SET "organizationId" = (SELECT "id" FROM "Organization") WHERE "action" NOT LIKE 'auth.%';

ALTER TABLE "Department" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Role" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Membership" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ContentItem" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "organizationId" SET NOT NULL;

-- ── Users: platform admin replaces the global admin flag ────────────────

-- Being deactivated is now per organization (copied to the membership above).
-- User.isActive only suspends someone from the whole service.
ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "isActive" = true, "deactivatedAt" = NULL;
ALTER TABLE "User" DROP COLUMN "isAdmin";

-- ── Item numbers are per organization ───────────────────────────────────

ALTER TABLE "ContentItem" ALTER COLUMN "number" DROP DEFAULT;
DROP SEQUENCE "ContentItem_number_seq";
DROP INDEX "ContentItem_number_key";
CREATE UNIQUE INDEX "ContentItem_organizationId_number_key" ON "ContentItem"("organizationId", "number");

-- ── Indexes ─────────────────────────────────────────────────────────────

DROP INDEX "Department_key_key";
CREATE UNIQUE INDEX "Department_organizationId_key_key" ON "Department"("organizationId", "key");
CREATE UNIQUE INDEX "Department_organizationId_id_key" ON "Department"("organizationId", "id");
CREATE UNIQUE INDEX "Role_organizationId_id_key" ON "Role"("organizationId", "id");
CREATE INDEX "Membership_organizationId_userId_idx" ON "Membership"("organizationId", "userId");
DROP INDEX "Notification_userId_readAt_createdAt_idx";
CREATE INDEX "Notification_userId_organizationId_readAt_createdAt_idx" ON "Notification"("userId", "organizationId", "readAt", "createdAt");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- ── Foreign keys (composite ones keep rows inside their organization) ───

ALTER TABLE "ContentItem" DROP CONSTRAINT "ContentItem_departmentId_fkey";
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_roleId_fkey";
ALTER TABLE "Role" DROP CONSTRAINT "Role_departmentId_fkey";

ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Department" ADD CONSTRAINT "Department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_departmentId_fkey" FOREIGN KEY ("organizationId", "departmentId") REFERENCES "Department"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "OrganizationMember"("organizationId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "Role"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_organizationId_departmentId_fkey" FOREIGN KEY ("organizationId", "departmentId") REFERENCES "Department"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
