import { cn } from '@/lib/utils';
import { Home, Building2 } from 'lucide-react';
import type { ProposedUnitFields } from '@/lib/crm/proposed-types';

/**
 * "In this unit" vs "In the building" amenity groups. Mirrors the mockup
 * `.amenity-split` block: unit tags in badger-red, building tags in muted stone.
 * Empty groups render nothing.
 */
export function AmenitySplit({
  split,
  className,
}: {
  split: ProposedUnitFields['amenitySplit'];
  className?: string;
}) {
  return (
    <div className={cn('mt-3 flex flex-col gap-2.5', className)}>
      <AmenityGroup scope="unit" label="In this unit" items={split.unit} />
      <AmenityGroup scope="building" label="In the building" items={split.building} />
    </div>
  );
}

function AmenityGroup({
  scope,
  label,
  items,
}: {
  scope: 'unit' | 'building';
  label: string;
  items: readonly string[];
}) {
  if (items.length === 0) return null;
  const Icon = scope === 'unit' ? Home : Building2;

  return (
    <div>
      <div
        className="mb-1 flex items-center gap-1.5 text-[0.625rem] font-extrabold uppercase tracking-[0.1em]"
        style={{ color: scope === 'unit' ? 'var(--primary-800)' : 'var(--surface-400)' }}
      >
        <Icon aria-hidden="true" className="h-[11px] w-[11px]" />
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((a) => (
          <span
            key={a}
            className="rounded-md border px-2 py-1 text-[0.6875rem] font-semibold"
            style={
              scope === 'unit'
                ? { color: 'var(--primary-800)', background: 'var(--primary-50)', borderColor: 'var(--primary-100)' }
                : { color: 'var(--surface-600)', background: 'var(--surface-50)', borderColor: 'var(--surface-200)' }
            }
          >
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}
