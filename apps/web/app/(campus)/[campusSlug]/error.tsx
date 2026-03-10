'use client';

import { useEffect } from 'react';

export default function CampusError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[CampusError]', error);
  }, [error]);

  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <div className="max-w-md text-center animate-fade-in">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-100)]">
          <svg
            className="h-7 w-7 text-[var(--accent-500)]"
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
          We couldn&apos;t load this page. Check your connection and try again.
        </p>
        <button
          onClick={reset}
          className="mt-5 rounded-xl bg-[var(--primary-600)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-700)] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
