import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[80dvh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-6xl font-bold text-[var(--surface-200)]">404</p>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl text-[var(--surface-900)]">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-[var(--surface-500)]">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-[var(--primary-600)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-700)] transition-colors"
          >
            Go home
          </Link>
          <Link
            href="/explore"
            className="rounded-xl border border-[var(--surface-200)] px-5 py-2.5 text-sm font-medium text-[var(--surface-600)] hover:bg-[var(--surface-50)] transition-colors"
          >
            Browse listings
          </Link>
        </div>
      </div>
    </div>
  );
}
