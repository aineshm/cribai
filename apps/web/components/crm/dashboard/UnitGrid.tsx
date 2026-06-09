'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { CrmUnit, CrmListMember } from '@/lib/crm/proposed-types';
import { SavedUnitCard } from '../SavedUnitCard';

/**
 * Responsive grid of saved units with status filter tabs (ported from the
 * `.grid` view + `.filter-tabs` in dashboard.html).
 *
 * NOTE on filter semantics: the dashboard mockup filters on the application
 * STAGE (not the raw `status` enum) — the labels Saved/Toured/Applied are stage
 * vocabulary and "Declined" maps to the `decision` stage. A literal `status`
 * filter would orphan the active/archived units (there is no `saved` status),
 * so we follow the mockup (the visual source of record) and partition by stage.
 *
 * Each unit is wrapped in an `<article>` (SavedUnitCard's root is a button when
 * interactive) so the dashboard can count cards by `role="article"`.
 */
type FilterKey = 'all' | 'saved' | 'toured' | 'applied' | 'declined';

const FILTERS: ReadonlyArray<{ key: FilterKey; label: string; match: (u: CrmUnit) => boolean }> = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'saved', label: 'Saved', match: (u) => u._proposed.application.stage === 'saved' },
  { key: 'toured', label: 'Toured', match: (u) => u._proposed.application.stage === 'toured' },
  { key: 'applied', label: 'Applied', match: (u) => u._proposed.application.stage === 'applied' },
  { key: 'declined', label: 'Declined', match: (u) => u._proposed.application.stage === 'decision' },
];

export function UnitGrid({
  units,
  members = [],
  onOpen,
}: {
  units: readonly CrmUnit[];
  /** Roster used to resolve each card's "added by" avatar. Threaded from
   *  BoardView (crmClient.getList) — never read from fixtures here. */
  members?: readonly CrmListMember[];
  onOpen: (id: string) => void;
}) {
  const [active, setActive] = useState<FilterKey>('all');
  const filter = FILTERS.find((f) => f.key === active) ?? FILTERS[0]!;
  const shown = units.filter(filter.match);
  const memberById = (id: string): CrmListMember | undefined =>
    members.find((m) => m.id === id);

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter units by stage">
        {FILTERS.map((f) => {
          const count = units.filter(f.match).length;
          const selected = f.key === active;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(f.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[0.8125rem] font-bold',
              )}
              style={
                selected
                  ? { color: '#fff', background: 'var(--primary-800)', borderColor: 'var(--primary-800)' }
                  : { color: 'var(--surface-600)', background: '#fff', borderColor: 'var(--surface-200)' }
              }
            >
              {f.label}
              <span
                className="rounded-full px-1.5 py-0.5 text-[0.6875rem] font-extrabold"
                style={
                  selected
                    ? { background: 'rgba(255,255,255,0.22)', color: '#fff' }
                    : { background: 'var(--surface-100)', color: 'var(--surface-500)' }
                }
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {shown.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-3">
          {shown.map((u) => (
            <article key={u.id}>
              <SavedUnitCard unit={u} onOpen={onOpen} addedByMember={memberById(u._proposed.addedBy)} />
            </article>
          ))}
        </div>
      ) : (
        <p
          className="rounded-2xl border border-dashed py-12 text-center text-[0.9375rem]"
          style={{ borderColor: 'var(--surface-300)', color: 'var(--surface-400)' }}
        >
          No units in this stage yet.
        </p>
      )}
    </div>
  );
}
