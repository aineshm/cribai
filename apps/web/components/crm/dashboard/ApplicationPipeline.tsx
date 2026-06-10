'use client';

import { cn } from '@/lib/utils';
import { MapPin } from 'lucide-react';
import type { CrmUnit, CrmListMember } from '@/lib/crm/proposed-types';
import { money } from '@/lib/crm/format';
import { StatusPill } from '../ui/StatusPill';
import { DeadlinePill } from '../ui/DeadlinePill';

/**
 * Application-pipeline kanban (ported from the `.kanban` view in dashboard.html).
 *
 * Four columns keyed off `unit._proposed.application.stage`
 * (Saved / Toured / Applied / Decision). Each column is a `role="group"` with an
 * accessible name; each card is a `role="article"` so the surrounding dashboard
 * test can count cards per stage.
 *
 * Cards lead with the floor-plan + building, show rent over the photo, a
 * DeadlinePill (urgent for Chapter's 48h waiver), document progress
 * (done/total), and the resolved "added by" member avatar. The roster comes in
 * via the `members` prop (threaded from BoardView's `crmClient.getList()`) so
 * this component never reaches into the fixtures directly.
 */
type Stage = CrmUnit['_proposed']['application']['stage'];

const STAGES: ReadonlyArray<{ key: Stage; label: string; dot: string }> = [
  { key: 'saved', label: 'Saved', dot: 'var(--fair-good)' },
  { key: 'toured', label: 'Toured', dot: '#1d4ed8' },
  { key: 'applied', label: 'Applied', dot: 'var(--primary-700)' },
  { key: 'decision', label: 'Decision', dot: 'var(--surface-400)' },
];

const stageOf = (u: CrmUnit): Stage => u._proposed.application.stage;

const docProgress = (u: CrmUnit): { done: number; total: number } => {
  const docs = u._proposed.application.documents;
  return { done: docs.filter((d) => d.done).length, total: docs.length };
};

export function ApplicationPipeline({
  units,
  members = [],
  onOpen,
}: {
  units: readonly CrmUnit[];
  /** Roster used to resolve each unit's "added by" avatar. Threaded from
   *  BoardView (crmClient.getList) — never read from fixtures here. */
  members?: readonly CrmListMember[];
  onOpen: (id: string) => void;
}) {
  const memberById = (id: string): CrmListMember | undefined =>
    members.find((m) => m.id === id);
  return (
    <div className="grid grid-cols-1 items-start gap-[1.1rem] min-[760px]:grid-cols-2 min-[1180px]:grid-cols-4">
      {STAGES.map((stage) => {
        const items = units.filter((u) => stageOf(u) === stage.key);
        return (
          <section
            key={stage.key}
            role="group"
            aria-label={stage.label}
            className="flex min-h-[220px] flex-col gap-3.5 rounded-2xl border p-3.5"
            style={{ background: 'rgba(245, 245, 244, 0.6)', borderColor: 'var(--surface-200)' }}
          >
            <header className="flex items-center justify-between px-0.5">
              <span
                className="inline-flex items-center gap-2 text-[0.7rem] font-extrabold uppercase tracking-[0.12em]"
                style={{ color: 'var(--surface-600)' }}
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ background: stage.dot }}
                />
                {stage.label}
              </span>
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-extrabold"
                style={{ background: 'var(--surface-200)', color: 'var(--surface-600)' }}
              >
                {items.length}
              </span>
            </header>

            {items.length > 0 ? (
              items.map((u) => (
                <KanbanCard
                  key={u.id}
                  unit={u}
                  addedByMember={memberById(u._proposed.addedBy)}
                  onOpen={onOpen}
                />
              ))
            ) : (
              <p
                className="rounded-xl border border-dashed py-6 text-center text-[0.78rem]"
                style={{ borderColor: 'var(--surface-300)', color: 'var(--surface-400)' }}
              >
                Nothing here yet
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function KanbanCard({
  unit,
  addedByMember,
  onOpen,
}: {
  unit: CrmUnit;
  addedByMember?: CrmListMember;
  onOpen: (id: string) => void;
}) {
  const { unit: u, application } = unit._proposed;
  const photo = unit.photo_urls?.[0] ?? '';
  const by = addedByMember;
  const prog = docProgress(unit);
  const showDeadline =
    application.deadlineLabel != null &&
    application.stage !== 'decision' &&
    unit.status !== 'declined';

  const open = () => onOpen(unit.id);

  return (
    <article
      role="article"
      aria-label={u.unitLabel}
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      className="cursor-pointer overflow-hidden rounded-[14px] border bg-white"
      style={{ borderColor: 'var(--surface-200)', boxShadow: 'var(--shadow-card)' }}
    >
      {/* Photo + rent overlay */}
      <div className="relative h-[104px]" style={{ background: 'var(--surface-100)' }}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="block h-full w-full object-cover" />
        ) : null}
        <span
          className="absolute bottom-2 right-2 rounded-lg px-2 py-1 text-sm font-extrabold"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--surface-900)',
            background: 'rgba(255,255,255,0.92)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {unit.rent != null ? money(unit.rent) : '—'}
          <span className="text-[0.65rem] font-medium" style={{ color: 'var(--surface-500)' }}>
            /mo
          </span>
        </span>
      </div>

      <div className="px-[0.85rem] pb-[0.85rem] pt-3">
        {/* Building + floor-plan token */}
        <p
          className="m-0 flex flex-wrap items-center gap-1.5 text-[0.9375rem] font-bold leading-tight"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--surface-900)' }}
        >
          {u.building}
          {u.floorPlan ? (
            <span
              className="rounded-md border px-1.5 py-0.5 text-[0.625rem] font-extrabold tracking-[0.04em]"
              style={{ color: 'var(--primary-800)', background: 'var(--primary-50)', borderColor: 'var(--primary-100)' }}
            >
              {u.floorPlan}
            </span>
          ) : null}
        </p>

        <div
          className="mt-1.5 flex items-center gap-1 text-xs"
          style={{ color: 'var(--surface-500)' }}
        >
          <MapPin aria-hidden="true" className="h-3 w-3 flex-shrink-0" />
          {unit.address}
        </div>

        {showDeadline ? (
          <div className="mt-2.5">
            <DeadlinePill
              label={application.deadlineLabel}
              deadline={application.deadline}
              className="text-[0.6875rem]"
            />
          </div>
        ) : null}

        {/* Footer: doc progress (or status) + added-by */}
        <div
          className="mt-2.5 flex items-center justify-between border-t pt-2.5"
          style={{ borderColor: 'var(--surface-200)' }}
        >
          {prog.total > 0 ? (
            <DocProgress done={prog.done} total={prog.total} />
          ) : (
            <StatusPill status={unit.status} />
          )}
          {by ? (
            <span
              className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[0.5625rem] font-extrabold text-white"
              style={{ background: by.color, boxShadow: 'inset 0 0 0 1.5px #fff' }}
              title={`added by ${by.name}`}
              aria-label={`Added by ${by.name}`}
            >
              {by.initials}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function DocProgress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = done === total;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        className="h-1.5 w-[52px] overflow-hidden rounded-full"
        style={{ background: 'var(--surface-200)' }}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, background: allDone ? 'var(--fair-good)' : 'var(--fair-ok)' }}
        />
      </span>
      <span
        className={cn('whitespace-nowrap text-[0.6875rem] font-bold')}
        style={{ color: allDone ? 'var(--fair-good)' : 'var(--surface-500)' }}
      >
        {done}/{total} docs
      </span>
    </span>
  );
}
