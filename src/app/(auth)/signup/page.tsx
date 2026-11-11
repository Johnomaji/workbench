import type { Metadata } from "next";
import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/plans";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an organization" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Create your organization</h1>
      <p className="mt-1 mb-5 text-sm text-muted">
        Start a Workbench for your team. You&apos;ll be its administrator and can invite everyone else. Free for{" "}
        {TRIAL_DAYS} days, no card needed.
      </p>
      <SignupForm />
      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
