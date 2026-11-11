import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside React Server Components; tests run in plain Node.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The database tests share one test database and each wipes it first, so
    // run test files one after another when they're enabled.
    fileParallelism: !process.env.TEST_DATABASE_URL,
    env: {
      // Keep password hashing fast in tests. Production clamps this to at least 10.
      BCRYPT_ROUNDS: "4",
    },
  },
});
