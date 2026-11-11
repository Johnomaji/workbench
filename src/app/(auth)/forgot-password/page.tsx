import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Forgot your password?</h1>
      <p className="mt-1 mb-5 text-sm text-muted">
        Enter your email and we&apos;ll send you a link to choose a new one.
      </p>
      <ForgotPasswordForm />
      <p className="mt-5 text-center text-sm">
        <Link href="/login" className="font-medium text-primary underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
