/**
 * Creates (or restores) a platform administrator: whoever runs the service.
 * They can list and suspend organizations at /platform, and see no customer
 * data. Prints a one-time temporary password; the person must choose their own
 * at first sign-in.
 *
 *   npm run platform-admin:create -- --email=you@yourcompany.com --name="Your Name"
 *
 * If the email already exists, the account is made an active platform
 * administrator, given a new temporary password and signed out everywhere.
 * Its organization memberships are left as they are.
 *
 * Customers don't need this: they sign up at /signup.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";
import { emailSchema, nameSchema } from "../src/server/validation/common";

const { values } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" } },
});

const email = emailSchema.safeParse(values.email ?? "");
const name = nameSchema.safeParse(values.name ?? "");
if (!email.success || !name.success) {
  console.error('Usage: npm run platform-admin:create -- --email=you@yourcompany.com --name="Your Name"');
  process.exit(1);
}

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DIRECT_URL (or DATABASE_URL) first.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const temporaryPassword = randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);

  const existing = await db.user.findUnique({ where: { email: email.data! }, select: { id: true } });
  const user = await db.$transaction(async (tx) => {
    const row = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            isPlatformAdmin: true,
            isActive: true,
            deactivatedAt: null,
            passwordHash,
            mustChangePassword: true,
            sessionVersion: { increment: 1 },
          },
        })
      : await tx.user.create({
          data: { email: email.data!, name: name.data!, isPlatformAdmin: true, passwordHash, mustChangePassword: true },
        });
    await tx.auditLog.create({
      data: {
        action: existing ? "user.updated" : "user.created",
        actorId: null,
        entityType: "User",
        entityId: row.id,
        data: { via: "create-platform-admin script", isPlatformAdmin: true },
      },
    });
    return row;
  });

  console.info(`\n${existing ? "Updated" : "Created"} platform administrator: ${user.name} <${user.email}>`);
  console.info(`Temporary password (shown once): ${temporaryPassword}`);
  console.info("They'll be asked to choose their own password when they first sign in.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
