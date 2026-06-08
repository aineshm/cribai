import { cn } from '@/lib/utils';
import type { CrmListMember } from '@/lib/crm/proposed-types';

/**
 * Overlapping avatar stack for a shared list's members. Mirrors the mockup
 * `.avatar-stack .mem` treatment (round, white ring, -8px overlap). Beyond
 * `max` members the remainder collapses into a "+N" chip.
 */
export function MemberAvatars({
  members,
  max = 4,
  className,
}: {
  members: readonly CrmListMember[];
  max?: number;
  className?: string;
}) {
  const shown = members.slice(0, max);
  const overflow = members.length - shown.length;

  return (
    <span className={cn('inline-flex items-center', className)} aria-label="List members">
      {shown.map((m, i) => (
        <span
          key={m.id}
          title={m.name}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-full text-[0.6875rem] font-extrabold text-white',
            i > 0 && '-ml-2',
          )}
          style={{ background: m.color, boxShadow: 'inset 0 0 0 2px #fff, var(--shadow-card)' }}
        >
          {m.initials}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="-ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-[0.6875rem] font-extrabold"
          style={{
            background: 'var(--surface-200)',
            color: 'var(--surface-600)',
            boxShadow: 'inset 0 0 0 2px #fff',
          }}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
