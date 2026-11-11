import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/feedback";
import { HOME_PATH } from "@/lib/org-path";
import { safeRedirectPath } from "@/server/request";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, { tone: "info" | "success" | "error"; text: string }> = {
  "signed-out": { tone: "info", text: "Your session has ended. Please sign in again." },
  goodbye: { tone: "success", text: "You've signed out." },
  "password-set": { tone: "success", text: "Your password is saved. Sign in to continue." },
  "signed-up": { tone: "success", text: "Your organization is ready. Sign in to open it." },
  invalid: { tone: "error", text: "That email and password don't match. Check them and try again." },
  deactivated: { tone: "error", text: "This account has been suspended. Contact support." },
  rate_limited: { tone: "error", text: "Too many sign-in attempts. Please wait 15 minutes and try again." },
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 mb-5 text-sm text-muted">One account for every organization you&apos;re in.</p>
      <Suspense fallback={<FormSkeleton />}>
        <LoginFormWithParams searchParams={searchParams} />
      </Suspense>
      <p className="mt-5 text-center text-sm">
        <Link href="/forgot-password" className="font-medium text-primary underline underline-offset-4">
          Forgot your password?
        </Link>
      </p>
      <p className="mt-3 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-primary underline underline-offset-4">
          Create an organization
        </Link>
      </p>
    </>
  );
}

async function LoginFormWithParams({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  // `reason` is ours; `code` comes from Auth.js when it redirects back here after a failed sign-in.
  const notice = NOTICES[pick("reason") ?? ""] ?? NOTICES[pick("code") ?? ""];
  return <LoginForm callbackUrl={safeRedirectPath(pick("callbackUrl"), HOME_PATH)} notice={notice} />;
}

function FormSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-11" />
    </div>
  );
}
