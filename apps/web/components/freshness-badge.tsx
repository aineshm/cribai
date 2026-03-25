type FreshnessLevel = 'fresh' | 'aging' | 'stale';

function getDaysSince(isoDate: string): number {
  const then = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function getFreshnessLevel(lastSeenAt: string): FreshnessLevel {
  const days = getDaysSince(lastSeenAt);
  if (days <= 3) return 'fresh';
  if (days <= 6) return 'aging';
  return 'stale';
}

export function getFreshnessLabel(lastSeenAt: string): string {
  const days = getDaysSince(lastSeenAt);
  if (days >= 7) return 'Possibly outdated';
  if (days === 0) return 'Verified today';
  if (days === 1) return 'Verified yesterday';
  return `Verified ${days} days ago`;
}

const levelStyles: Record<FreshnessLevel, string> = {
  fresh: 'bg-emerald-50 text-emerald-700',
  aging: 'bg-slate-50 text-slate-700',
  stale: 'bg-red-50 text-red-700',
};

interface FreshnessBadgeProps {
  readonly lastSeenAt: string;
}

export function FreshnessBadge({ lastSeenAt }: FreshnessBadgeProps) {
  const level = getFreshnessLevel(lastSeenAt);
  const label = getFreshnessLabel(lastSeenAt);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${levelStyles[level]}`}
    >
      {label}
    </span>
  );
}
