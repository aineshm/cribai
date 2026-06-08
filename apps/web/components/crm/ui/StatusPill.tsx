import { cn } from '@/lib/utils';
import type { CrmListingRow } from '@campusnest/ai';

type CrmStatus = CrmListingRow['status'];

/**
 * Small status dot/pill keyed off the locked CrmListingRow status enum.
 * Color treatment mirrors the `.status-dot.st-*` rules in the workspace mockup
 * (active=good, toured=blue, applied=badger-red, declined/archived=muted).
 */
const STATUS_STYLE: Record<CrmStatus, { bg: string; color: string }> = {
  active: { bg: 'var(--fair-good-bg)', color: 'var(--fair-good)' },
  toured: { bg: '#eff6ff', color: '#1d4ed8' },
  applied: { bg: 'var(--primary-50)', color: 'var(--primary-800)' },
  declined: { bg: 'var(--surface-100)', color: 'var(--surface-500)' },
  archived: { bg: 'var(--surface-100)', color: 'var(--surface-400)' },
};

export function StatusPill({ status, className }: { status: CrmStatus; className?: string }) {
  const { bg, color } = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wider',
        className,
      )}
      style={{ background: bg, color }}
    >
      {status}
    </span>
  );
}
