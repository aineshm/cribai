'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function MarkAllReadButton() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setIsLoading(true);
    try {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // Silently fail -- user can retry
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className="rounded-lg border border-[var(--surface-200)] px-4 py-2 text-sm font-medium text-[var(--surface-700)] hover:bg-[var(--surface-50)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? 'Marking...' : 'Mark all as read'}
    </button>
  );
}
