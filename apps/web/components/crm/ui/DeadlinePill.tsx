import { cn } from '@/lib/utils';
import { Clock } from 'lucide-react';

const URGENT_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

/** True when an ISO deadline is in the future and within the 48h urgency window. */
export function isUrgent(deadline: string | null, now: number = Date.now()): boolean {
  if (!deadline) return false;
  const due = new Date(deadline).getTime();
  if (Number.isNaN(due)) return false;
  const delta = due - now;
  return delta > 0 && delta <= URGENT_WINDOW_MS;
}

/**
 * Application deadline pill. Mirrors the mockup `.deadline-pill` (badger-red
 * gradient + pulsing dot) when urgent; a quiet chip otherwise. Renders nothing
 * when there's no label to show.
 */
export function DeadlinePill({
  label,
  deadline = null,
  className,
}: {
  label: string | null;
  deadline?: string | null;
  className?: string;
}) {
  if (!label) return null;
  const urgent = isUrgent(deadline);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-extrabold',
        className,
      )}
      style={
        urgent
          ? {
              color: 'var(--primary-800)',
              background: 'linear-gradient(135deg, var(--primary-50), var(--accent-50))',
              borderColor: 'var(--primary-200)',
              boxShadow: 'var(--shadow-card)',
            }
          : {
              color: 'var(--surface-600)',
              background: 'var(--surface-50)',
              borderColor: 'var(--surface-200)',
            }
      }
    >
      {urgent ? (
        <span
          aria-hidden="true"
          className="h-[7px] w-[7px] shrink-0 animate-pulse rounded-full"
          style={{ background: 'var(--primary-600)' }}
        />
      ) : (
        <Clock aria-hidden="true" className="h-3 w-3 shrink-0" />
      )}
      {label}
    </span>
  );
}
