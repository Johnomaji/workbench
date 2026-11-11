import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-6 flex justify-center">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight">
            <LogoMark />
            Workbench
          </Link>
        </p>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">{children}</div>
        <div className="mt-6 flex justify-center">
          <ThemeToggle />
        </div>
      </div>
    </main>
  );
}
