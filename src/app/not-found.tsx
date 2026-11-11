import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-muted">Not found</p>
        <h1 className="mt-2 text-2xl font-semibold">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-muted">It may have been moved or removed, or the link may be incomplete.</p>
        <p className="mt-6">
          <Link href="/" className="font-medium text-primary underline underline-offset-4">
            Go to the home page
          </Link>
        </p>
      </div>
    </main>
  );
}
