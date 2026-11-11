import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 keeps connection URLs out of schema.prisma.
// - The CLI (migrate, db seed, studio) uses DIRECT_URL: a direct, non-pooled connection.
// - The running app uses the pooled DATABASE_URL (see src/server/db.ts).
// DIRECT_URL is read with process.env (not env()) so `prisma generate` works on a
// fresh checkout before .env exists. Migrate commands fail clearly if it's missing.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // `node --import tsx` works whether or not node_modules/.bin is on PATH.
    seed: "node --import tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
