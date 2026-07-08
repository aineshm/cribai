'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { LayoutGrid, Columns3, KanbanSquare, Link2, ArrowRight, Share2 } from 'lucide-react';
import type { RankCompareResult } from '@campusnest/ai';
import { createClient } from '@campusnest/supabase/client';
import type { CrmList, CrmUnit } from '@/lib/crm/proposed-types';
import { crmClient } from '@/lib/crm-client';
import { errorMessage } from '@/lib/crm/error-message';
import { useCrmListingsRealtime } from '@/hooks/use-crm-listings-realtime';
import { BranchState } from '../ui/BranchState';
import { MemberAvatars } from '../ui/MemberAvatars';
import { ApplicationPipeline } from './ApplicationPipeline';
import { UnitGrid } from './UnitGrid';
import { UnitDetailDrawer } from './UnitDetailDrawer';
import { RankCompareTable } from '../RankCompareTable';

/**
 * The manual "My Apartments" dashboard (ported from dashboard.html).
 *
 * Loads units + the shared list from the crm-client seam, then offers a view
 * switcher over three surfaces — Pipeline (kanban), Grid (filterable cards), and
 * Compare (side-by-side table). An add-by-URL bar pushes a paste through
 * crmClient.addListing; the collaborative list header shows the list name +
 * member avatars + Share. Selecting any unit opens the UnitDetailDrawer.
 *
 * Compare data loads lazily the first time its tab opens.
 */
type ViewKey = 'pipeline' | 'grid' | 'compare';

const VIEWS: ReadonlyArray<{ id: ViewKey; label: string; icon: typeof LayoutGrid }> = [
  { id: 'pipeline', label: 'Pipeline', icon: KanbanSquare },
  { id: 'grid', label: 'Grid', icon: LayoutGrid },
  { id: 'compare', label: 'Compare', icon: Columns3 },
];

export function BoardView() {
  const [list, setList] = useState<CrmList | null>(null);
  const [units, setUnits] = useState<readonly CrmUnit[]>([]);
  const [compare, setCompare] = useState<RankCompareResult | null>(null);
  const [view, setView] = useState<ViewKey>('pipeline');
  const [openId, setOpenId] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Resolved once for the AIN-105 realtime subscription below. Wrapped in
  // try/catch — createClient() throws synchronously when Supabase env vars
  // are absent (e.g. component tests with no env configured); that degrades
  // to no realtime subscription, never a crash.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (alive) setUserId(session?.user.id ?? null);
      } catch {
        // No Supabase env in this render context — realtime stays off.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Shared by the mount fetch AND every AIN-105 realtime-triggered refetch
  // below — a single ref flipped false on unmount guards every in-flight
  // call, not just whichever one happened to be "the" effect's cleanup.
  const aliveRef = useRef(true);
  useEffect(
    () => () => {
      aliveRef.current = false;
    },
    [],
  );

  const fetchListAndUnits = useCallback(() => {
    Promise.all([crmClient.getList(), crmClient.listUnits()])
      .then(([l, u]) => {
        if (!aliveRef.current) return;
        setList(l);
        setUnits(u);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (aliveRef.current) setLoadError(errorMessage(err));
      });
  }, []);

  useEffect(() => {
    fetchListAndUnits();
  }, [fetchListAndUnits]);

  // AIN-105: a save from the extension (or any other client) while this
  // dashboard is open streams in without needing a manual reopen/reload.
  useCrmListingsRealtime(userId, fetchListAndUnits);

  // Compare data loads lazily the first time its tab is opened.
  useEffect(() => {
    if (view !== 'compare' || compare) return;
    let alive = true;
    crmClient
      .rank('compare')
      .then((r) => {
        if (!alive) return;
        setCompare(r);
        setCompareError(null);
      })
      .catch((err: unknown) => {
        if (alive) setCompareError(errorMessage(err));
      });
    return () => {
      alive = false;
    };
  }, [view, compare]);

  const openUnit = units.find((u) => u.id === openId) ?? null;
  const others = list ? list.members.filter((m) => m.id !== list.ownerId) : [];

  // AIN-95 follow-up: propagate a successful inline rename to the local units
  // list so the grid/pipeline/compare cards reflect the new name immediately,
  // without a reload. Immutable update — never mutates the prior units array
  // or unit object.
  const handleRenamed = (id: string, nickname: string) => {
    setUnits((prev) =>
      prev.map((u) =>
        u.id === id
          ? {
              ...u,
              nickname,
              _proposed: {
                ...u._proposed,
                unit: { ...u._proposed.unit, building: nickname },
              },
            }
          : u,
      ),
    );
  };

  const submitUrl = async () => {
    if (!url.trim() || adding) return;
    setAdding(true);
    try {
      await crmClient.addListing(url.trim());
      setUrl('');
      setAddError(null);
    } catch (err: unknown) {
      setAddError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1440px] px-6 pb-20 pt-8">
      {/* Page heading + collaboration */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div
            className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.18em]"
            style={{ color: 'var(--primary-800)' }}
          >
            Personal CRM · Manual workspace
          </div>
          <h1
            className="m-0 text-[2.25rem] font-extrabold leading-[1.05]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--surface-900)', letterSpacing: '-0.03em' }}
          >
            {list?.name ?? 'My Apartments'}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3.5">
            {list ? <MemberAvatars members={list.members} /> : null}
            {others.length > 0 ? (
              <span className="text-[0.78rem] font-medium max-[760px]:hidden" style={{ color: 'var(--surface-500)' }}>
                Shared with{' '}
                <b style={{ color: 'var(--surface-700)', fontWeight: 700 }}>
                  {others.map((m) => m.name).join(' · ')}
                </b>
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[0.8125rem] font-bold text-white"
          style={{
            background: 'linear-gradient(135deg, var(--primary-700), var(--primary-900))',
            boxShadow: '0 4px 12px rgba(127,29,29,0.28)',
          }}
        >
          <Share2 aria-hidden="true" className="h-[15px] w-[15px]" />
          Share
        </button>
      </div>

      {/* Add-by-URL bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitUrl();
        }}
        className="mb-7 flex items-center gap-2.5 rounded-2xl border bg-white py-2.5 pl-4 pr-2.5"
        style={{ borderColor: 'var(--surface-200)', boxShadow: '0 6px 22px rgba(28, 25, 23, 0.07)' }}
      >
        <span
          className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: 'var(--surface-100)', color: 'var(--primary-800)' }}
          aria-hidden="true"
        >
          <Link2 className="h-[18px] w-[18px]" />
        </span>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a listing link to add a unit…"
          aria-label="Add a unit by URL"
          autoComplete="off"
          className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[0.9375rem] outline-none"
          style={{ color: 'var(--surface-900)' }}
        />
        <button
          type="submit"
          disabled={adding}
          aria-label="Add by URL"
          className="inline-flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-60"
          style={{
            background: 'linear-gradient(135deg, var(--primary-700), var(--primary-900))',
            boxShadow: '0 4px 12px rgba(127,29,29,0.28)',
          }}
        >
          <ArrowRight className="h-[18px] w-[18px]" />
        </button>
      </form>
      {addError ? (
        <div className="-mt-5 mb-6">
          <LoadError message={addError} />
        </div>
      ) : null}

      {/* View switcher */}
      <div className="mb-6">
        <div
          className="inline-flex items-center gap-1 rounded-xl border p-1"
          role="tablist"
          aria-label="Dashboard views"
          style={{ background: 'var(--surface-100)', borderColor: 'var(--surface-200)' }}
        >
          {VIEWS.map((v) => {
            const active = view === v.id;
            const Icon = v.icon;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(v.id)}
                className={cn('inline-flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-[0.8125rem] font-bold')}
                style={
                  active
                    ? { color: 'var(--primary-800)', background: '#fff', boxShadow: 'var(--shadow-card)' }
                    : { color: 'var(--surface-500)', background: 'transparent' }
                }
              >
                <Icon aria-hidden="true" className="h-[15px] w-[15px]" />
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active view */}
      {view === 'pipeline' ? (
        loadError ? (
          <LoadError message={loadError} />
        ) : (
          <ApplicationPipeline units={units} members={list?.members ?? []} onOpen={setOpenId} />
        )
      ) : null}
      {view === 'grid' ? (
        loadError ? (
          <LoadError message={loadError} />
        ) : (
          <UnitGrid units={units} members={list?.members ?? []} onOpen={setOpenId} />
        )
      ) : null}
      {view === 'compare' ? (
        compareError ? (
          <LoadError message={compareError} />
        ) : compare ? (
          <div>
            <RankCompareTable result={compare} />
            <p className="mt-4 text-[0.8125rem]" style={{ color: 'var(--surface-500)' }}>
              Comparing the units you flagged for side-by-side. Add more from Grid or Pipeline.
            </p>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--surface-400)' }}>
            Loading…
          </p>
        )
      ) : null}

      <UnitDetailDrawer unit={openUnit} onClose={() => setOpenId(null)} onRenamed={handleRenamed} />
    </main>
  );
}

/** AIN-60: crash-safe loader error rendered through the BranchState atom. */
function LoadError({ message }: { message: string }) {
  return <BranchState branch={{ status: 'error', error: message }}>{() => null}</BranchState>;
}
