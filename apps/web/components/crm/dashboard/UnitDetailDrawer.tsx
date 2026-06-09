'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { X, Check, DollarSign, Flag, Home } from 'lucide-react';
import type { CrmListingRow, FirstSaveAnalysis } from '@campusnest/ai';
import type { CrmUnit } from '@/lib/crm/proposed-types';
import { crmClient } from '@/lib/crm-client';
import { money } from '@/lib/crm/format';
import { AmenitySplit } from '../ui/AmenitySplit';
import { BranchState } from '../ui/BranchState';
import { DeadlinePill } from '../ui/DeadlinePill';

/**
 * Detail / edit slide-over (ported from the `.drawer` in dashboard.html).
 *
 * Renders nothing when `unit` is null. When open it shows, SYNCHRONOUSLY:
 *   - editable rent / status / notes (local mock state — no persistence)
 *   - the unit-vs-building AmenitySplit
 *   - the application document checklist (toggleable, local)
 * and ASYNCHRONOUSLY fills in an analysis summary (true cost + red flags) loaded
 * via crmClient.getAnalysis. The analysis section degrades through BranchState
 * so a skipped/error fanout branch never crashes.
 *
 * Local edit/checklist state reseeds whenever the unit id changes.
 */
const STATUS_OPTIONS: ReadonlyArray<CrmListingRow['status']> = [
  'active',
  'toured',
  'applied',
  'declined',
  'archived',
];

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function UnitDetailDrawer({
  unit,
  onClose,
}: {
  unit: CrmUnit | null;
  onClose: () => void;
}) {
  if (!unit) return null;
  return <DrawerContent key={unit.id} unit={unit} onClose={onClose} />;
}

function DrawerContent({ unit, onClose }: { unit: CrmUnit; onClose: () => void }) {
  const { unit: u, amenitySplit, application } = unit._proposed;
  const photo = unit.photo_urls?.[0] ?? '';

  // Local mock edit state (reseeded per-unit via the `key` on this component).
  const [rent, setRent] = useState<number>(unit.rent ?? 0);
  const [status, setStatus] = useState<CrmListingRow['status']>(unit.status);
  const [notes, setNotes] = useState<string>(unit.user_notes ?? '');
  const [docs, setDocs] = useState(application.documents.map((d) => ({ ...d })));

  // Analysis loads async; the rest of the drawer renders immediately.
  const [analysis, setAnalysis] = useState<FirstSaveAnalysis | null>(null);
  useEffect(() => {
    let alive = true;
    void crmClient.getAnalysis(unit.id).then((a) => {
      if (alive) setAnalysis(a);
    });
    return () => {
      alive = false;
    };
  }, [unit.id]);

  const doneCount = docs.filter((d) => d.done).length;
  const toggleDoc = (name: string) =>
    setDocs((prev) => prev.map((d) => (d.name === name ? { ...d, done: !d.done } : d)));

  const showDeadline =
    application.deadlineLabel != null &&
    application.stage !== 'decision' &&
    unit.status !== 'declined';

  return (
    <>
      {/* Scrim */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(28, 25, 23, 0.28)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <aside
        className="fixed inset-y-0 right-0 z-[60] flex w-[480px] max-w-[94vw] flex-col border-l bg-white"
        style={{ borderColor: 'var(--surface-200)', boxShadow: '-24px 0 60px rgba(28, 25, 23, 0.12)' }}
        aria-label="Unit detail"
      >
        {/* Head */}
        <div
          className="flex items-start justify-between border-b px-[1.3rem] pb-4 pt-[1.2rem]"
          style={{ borderColor: 'var(--surface-200)' }}
        >
          <div className="min-w-0">
            <h2
              className="m-0 text-xl font-extrabold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--surface-900)', letterSpacing: '-0.02em' }}
            >
              {u.unitLabel}
            </h2>
            <div className="mt-0.5 text-[0.78rem]" style={{ color: 'var(--surface-500)' }}>
              {u.building}
              {u.floorPlan ? ` · Floor plan ${u.floorPlan}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: 'var(--surface-100)', color: 'var(--surface-600)' }}
            aria-label="Close panel"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-[1.1rem] overflow-y-auto px-[1.3rem] pb-8 pt-[1.1rem]">
          {/* Hero photo */}
          {photo ? (
            <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: 'var(--surface-200)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="" className="block h-[170px] w-full object-cover" />
            </div>
          ) : null}

          {/* Editable core fields */}
          <Block>
            <div className="flex gap-3.5">
              <Field label="Rent / mo" htmlFor="f-rent" className="flex-1">
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold"
                    style={{ color: 'var(--surface-400)' }}
                  >
                    $
                  </span>
                  <input
                    id="f-rent"
                    type="number"
                    value={rent}
                    onChange={(e) => setRent(Number(e.target.value))}
                    className="w-full rounded-[10px] border bg-white py-2.5 pl-6 pr-3 text-[0.9375rem] outline-none"
                    style={{ borderColor: 'var(--surface-200)', color: 'var(--surface-900)' }}
                  />
                </div>
              </Field>
              <Field label="Status" htmlFor="f-status" className="flex-1">
                <select
                  id="f-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CrmListingRow['status'])}
                  className="w-full rounded-[10px] border bg-white px-3 py-2.5 text-[0.9375rem] outline-none"
                  style={{ borderColor: 'var(--surface-200)', color: 'var(--surface-900)' }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {cap(s)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Notes" htmlFor="f-notes" className="mt-3.5">
              <textarea
                id="f-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add a note…"
                className="min-h-[70px] w-full resize-y rounded-[10px] border bg-white px-3 py-2.5 text-[0.9375rem] leading-relaxed outline-none"
                style={{ borderColor: 'var(--surface-200)', color: 'var(--surface-900)' }}
              />
            </Field>
          </Block>

          {/* Amenity split */}
          <Block>
            <SectionLabel icon={<Home className="h-[15px] w-[15px]" />} label="Amenities · unit vs building" />
            <AmenitySplit split={amenitySplit} className="mt-0" />
          </Block>

          {/* Application checklist */}
          <Block tinted>
            {showDeadline ? (
              <div className="mb-3.5">
                <DeadlinePill label={application.deadlineLabel} deadline={application.deadline} />
              </div>
            ) : null}
            {docs.length > 0 ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-extrabold" style={{ color: 'var(--surface-900)' }}>
                    Documents
                  </span>
                  <span className="text-[0.8125rem] font-bold" style={{ color: 'var(--surface-500)' }}>
                    {doneCount}/{docs.length} complete
                  </span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {docs.map((d) => (
                    <button
                      key={d.name}
                      type="button"
                      onClick={() => toggleDoc(d.name)}
                      className="flex items-center gap-2.5 text-left text-sm"
                      style={{ color: d.done ? 'var(--surface-400)' : 'var(--surface-700)' }}
                    >
                      <span
                        className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border text-white"
                        style={
                          d.done
                            ? { background: 'var(--fair-good)', borderColor: 'var(--fair-good)' }
                            : { background: '#fff', borderColor: 'var(--surface-300)' }
                        }
                      >
                        {d.done ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className={cn(d.done && 'line-through')}>{d.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm" style={{ color: 'var(--surface-500)' }}>
                No checklist yet — start an application to add required documents.
              </p>
            )}
          </Block>

          {/* Analysis summary (async) */}
          <Block>
            <SectionLabel icon={<DollarSign className="h-[15px] w-[15px]" />} label="True cost" />
            {analysis ? (
              <BranchState branch={analysis.trueCost}>
                {(tc) => (
                  <div className="flex items-baseline justify-between">
                    <span className="text-[0.78rem] font-extrabold uppercase tracking-wider" style={{ color: 'var(--surface-700)' }}>
                      True cost / mo
                    </span>
                    <span
                      className="text-2xl font-extrabold"
                      style={{ fontFamily: 'var(--font-display)', color: 'var(--primary-800)' }}
                    >
                      {money(tc.total)}
                      <span className="text-[0.8125rem] font-medium" style={{ color: 'var(--surface-500)' }}>
                        /mo
                      </span>
                    </span>
                  </div>
                )}
              </BranchState>
            ) : (
              <LoadingHint />
            )}
          </Block>

          <Block>
            <SectionLabel icon={<Flag className="h-[15px] w-[15px]" />} label="Red flags" />
            {analysis ? (
              <BranchState branch={analysis.redFlags}>
                {(rf) => (
                  <div>
                    {rf.flags.length > 0 ? (
                      <div className="mb-2.5 flex flex-wrap gap-1.5">
                        {rf.flags.map((f) => (
                          <span
                            key={f}
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                            style={{ color: 'var(--fair-ok)', background: 'var(--fair-ok-bg)' }}
                          >
                            <Flag aria-hidden="true" className="h-3 w-3" />
                            {f}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p className="m-0 text-[0.8125rem] leading-relaxed" style={{ color: 'var(--surface-600)' }}>
                      {rf.summary}
                    </p>
                  </div>
                )}
              </BranchState>
            ) : (
              <LoadingHint />
            )}
          </Block>
        </div>
      </aside>
    </>
  );
}

function Block({ children, tinted }: { children: React.ReactNode; tinted?: boolean }) {
  return (
    <div
      className="rounded-[14px] border px-[1.1rem] py-4"
      style={{
        borderColor: 'var(--surface-200)',
        background: tinted
          ? 'linear-gradient(180deg, rgba(254,242,242,0.4), rgba(255,255,255,0))'
          : '#fff',
      }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="text-[0.6875rem] font-extrabold uppercase tracking-[0.08em]"
        style={{ color: 'var(--surface-500)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2">
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
        style={{ background: 'var(--surface-100)', color: 'var(--primary-800)' }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <h4
        className="m-0 text-[0.7rem] font-extrabold uppercase tracking-[0.12em]"
        style={{ color: 'var(--surface-600)' }}
      >
        {label}
      </h4>
    </div>
  );
}

function LoadingHint() {
  return (
    <p className="text-sm" style={{ color: 'var(--surface-400)' }}>
      Loading…
    </p>
  );
}
