/**
 * Runs once when the server starts. Prints a clear message when required
 * settings are missing, instead of a cryptic error on the first sign-in.
 */
const REQUIRED = ["DATABASE_URL", "AUTH_SECRET"] as const;

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
  if (missing.length === 0) return;
  console.error(
    [
      "",
      `✖ Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
      "  Copy .env.example to .env and fill it in (README → Set up locally), then restart the server.",
      "",
    ].join("\n"),
  );
}
