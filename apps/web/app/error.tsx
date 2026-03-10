'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-100)]">
          <svg
            className="h-8 w-8 text-[var(--accent-500)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h2 className="mt-4 font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-[var(--surface-500)]">
          We hit an unexpected error. This has been noted and we&apos;re looking into it.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl bg-[var(--primary-600)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-700)] transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-xl border border-[var(--surface-200)] px-5 py-2.5 text-sm font-medium text-[var(--surface-600)] hover:bg-[var(--surface-50)] transition-colors"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
