import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// The app always uses the pooled DATABASE_URL. Migrations use DIRECT_URL
// (see prisma.config.ts). Each serverless instance keeps a small pool; the
// hosted pooler (Neon/Supabase) multiplexes them onto real connections.
function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

// Reuse one client across hot reloads in development.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Db = typeof db;
