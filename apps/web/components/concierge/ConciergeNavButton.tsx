'use client';

import { Sparkles } from 'lucide-react';
import { useConcierge } from './ConciergeProvider';

export function ConciergeNavButton() {
  const { openSidebar, missions } = useConcierge();

  const activeCount = missions.filter(
    (m) =>
      m.status === 'queued' ||
      m.status === 'pending' ||
      m.status === 'running' ||
      m.status === 'retrying' ||
      m.status === 'waiting_approval'
  ).length;

  return (
    <button
      type="button"
      onClick={openSidebar}
      className="relative flex items-center gap-1.5 text-sm font-medium text-[var(--surface-500)] hover:text-[var(--surface-800)] transition-colors"
    >
      <Sparkles className="size-4" />
      Concierge
      {activeCount > 0 && (
        <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--primary-600)] px-1 text-[10px] font-bold text-white">
          {activeCount}
        </span>
      )}
    </button>
  );
}
