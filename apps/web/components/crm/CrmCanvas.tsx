'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { List, BarChart3, Columns3, PanelLeftClose, Share2 } from 'lucide-react';
import type { RankCompareResult } from '@campusnest/ai';
import type { CrmList, CrmListMember, CrmUnit } from '@/lib/crm/proposed-types';
import { crmClient } from '@/lib/crm-client';
import { MemberAvatars } from './ui/MemberAvatars';
import { SavedUnitCard } from './SavedUnitCard';
import { RankCompareTable } from './RankCompareTable';

/**
 * The ~60% "My Apartments" canvas (ported from workspace-canvas-open.html).
 *
 * Collaborative header: list name (from getList), the MemberAvatars stack, a
 * "Shared with …" label, and a Share control. Below it a List / Rank / Compare
 * tablist; only the active tab's panel mounts.
 *
 *  - List    → a responsive grid of SavedUnitCard (each card's "added by" member
 *              resolved from the list roster — never id-parsed).
 *  - Rank    → RankCompareTable on rank('rank').
 *  - Compare → RankCompareTable on rank('compare').
 *
 * Initial data (getList / listUnits / rank('rank')) loads in parallel.
 */
type View = 'list' | 'rank' | 'compare';

const TABS: ReadonlyArray<{ id: View; label: string; icon: typeof List }> = [
  { id: 'list', label: 'List', icon: List },
  { id: 'rank', label: 'Rank', icon: BarChart3 },
  { id: 'compare', label: 'Compare', icon: Columns3 },
];

export function CrmCanvas({ onClose }: { onClose?: () => void }) {
  const [list, setList] = useState<CrmList | null>(null);
  const [units, setUnits] = useState<readonly CrmUnit[]>([]);
  const [rank, setRank] = useState<RankCompareResult | null>(null);
  const [compare, setCompare] = useState<RankCompareResult | null>(null);
  const [view, setView] = useState<View>('list');

  useEffect(() => {
    let alive = true;
    void Promise.all([crmClient.getList(), crmClient.listUnits(), crmClient.rank('rank')]).then(
      ([l, u, r]) => {
        if (!alive) return;
        setList(l);
        setUnits(u);
        setRank(r);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  // Compare data loads lazily the first time its tab is opened.
  useEffect(() => {
    if (view !== 'compare' || compare) return;
    let alive = true;
    void crmClient.rank('compare').then((r) => {
      if (alive) setCompare(r);
    });
    return () => {
      alive = false;
    };
  }, [view, compare]);

  const memberById = (id: string): CrmListMember | undefined =>
    list?.members.find((m) => m.id === id);

  const others = list ? list.members.filter((m) => m.id !== list.ownerId) : [];

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden" aria-label="My Apartments canvas">
      {/* Collaborative header */}
      <div className="flex-shrink-0 border-b px-6 pt-5" style={{ borderColor: 'var(--surface-200)' }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p
              className="m-0 mb-1 text-[0.6875rem] font-bold uppercase tracking-[0.18em]"
              style={{ color: 'var(--primary-800)' }}
            >
              Shared list
            </p>
            <h2
              className="m-0 text-[1.625rem] font-extrabold leading-tight"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--surface-900)', letterSpacing: '-0.02em' }}
            >
              {list?.name ?? 'My Apartments'}
            </h2>
            <div className="mt-1.5 text-[0.8125rem]" style={{ color: 'var(--surface-500)' }}>
              {units.length} {units.length === 1 ? 'unit' : 'units'} saved · sorted by recently added
            </div>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border bg-white"
              style={{ borderColor: 'var(--surface-200)', color: 'var(--surface-500)' }}
              aria-label="Collapse canvas"
              title="Collapse canvas"
            >
              <PanelLeftClose className="h-[18px] w-[18px]" />
            </button>
          ) : null}
        </div>

        {/* Collaboration row */}
        <div className="mt-3.5 flex items-center gap-3">
          {list ? <MemberAvatars members={list.members} /> : null}
          {others.length > 0 ? (
            <span
              className="text-[0.8125rem] font-medium max-[980px]:hidden"
              style={{ color: 'var(--surface-500)' }}
            >
              Shared with{' '}
              <b style={{ color: 'var(--surface-700)', fontWeight: 700 }}>
                {others.map((m) => m.name).join(' · ')}
              </b>
            </span>
          ) : null}
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[0.8125rem] font-bold text-white"
            style={{
              background: 'linear-gradient(135deg, var(--primary-800), var(--primary-900))',
              boxShadow: '0 4px 14px rgba(153, 27, 27, 0.22)',
            }}
          >
            <Share2 aria-hidden="true" className="h-3.5 w-3.5" />
            Share
          </button>
        </div>

        {/* View switcher */}
        <div className="mt-4 flex items-center gap-1" role="tablist" aria-label="Canvas views">
          {TABS.map((t) => {
            const active = view === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(t.id)}
                className={cn(
                  'relative mr-3.5 inline-flex items-center gap-1.5 border-0 bg-transparent px-1.5 pb-3.5 pt-2.5 text-sm font-bold',
                )}
                style={{ color: active ? 'var(--primary-800)' : 'var(--surface-500)' }}
              >
                <Icon aria-hidden="true" className="h-[15px] w-[15px]" />
                {t.label}
                {active ? (
                  <span
                    className="absolute inset-x-0 -bottom-px h-[2.5px] rounded-t"
                    style={{ background: 'var(--primary-800)' }}
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body — only the active tab's panel mounts */}
      <div className="flex-1 overflow-y-auto p-6">
        {view === 'list' ? (
          <div className="grid grid-cols-1 gap-[1.1rem] min-[1180px]:grid-cols-2">
            {units.map((u) => (
              <SavedUnitCard key={u.id} unit={u} addedByMember={memberById(u._proposed.addedBy)} />
            ))}
          </div>
        ) : null}

        {view === 'rank' ? (
          rank ? (
            <RankCompareTable result={rank} />
          ) : (
            <LoadingHint />
          )
        ) : null}

        {view === 'compare' ? (
          compare ? (
            <RankCompareTable result={compare} />
          ) : (
            <LoadingHint />
          )
        ) : null}
      </div>
    </section>
  );
}

function LoadingHint() {
  return (
    <p className="text-sm" style={{ color: 'var(--surface-400)' }}>
      Loading…
    </p>
  );
}
