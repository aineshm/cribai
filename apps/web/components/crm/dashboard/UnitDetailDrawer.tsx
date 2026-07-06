'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { X, Check, DollarSign, Flag, Home, MapPin, HelpCircle, ExternalLink, Calendar, BookmarkCheck, Pencil, Layers } from 'lucide-react';
import type { CrmListingRow, FirstSaveAnalysis, FloorPlan } from '@campusnest/ai';
import type { CrmUnit } from '@/lib/crm/proposed-types';
import { crmClient } from '@/lib/crm-client';
import { money, bedLabel } from '@/lib/crm/format';
import { AmenitySplit } from '../ui/AmenitySplit';
import { BranchState } from '../ui/BranchState';
import { DeadlinePill } from '../ui/DeadlinePill';

/** Format an ISO date string (or null) to a short locale date. */
function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return null;
  }
}

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
  onRenamed,
}: {
  unit: CrmUnit | null;
  onClose: () => void;
  /** Optional hook for a host that keeps its own list of units in sync (AIN-95). */
  onRenamed?: (id: string, nickname: string) => void;
}) {
  if (!unit) return null;
  return <DrawerContent key={unit.id} unit={unit} onClose={onClose} onRenamed={onRenamed} />;
}

function DrawerContent({
  unit,
  onClose,
  onRenamed,
}: {
  unit: CrmUnit;
  onClose: () => void;
  onRenamed?: (id: string, nickname: string) => void;
}) {
  const { unit: u, amenitySplit, application } = unit._proposed;
  const floorPlans = unit.floorPlans;
  const photos = unit.photo_urls ?? [];
  const photo = photos[0] ?? '';

  // Local mock edit state (reseeded per-unit via the `key` on this component).
  const [rent, setRent] = useState<number>(unit.rent ?? 0);
  const [status, setStatus] = useState<CrmListingRow['status']>(unit.status);
  const [notes, setNotes] = useState<string>(unit.user_notes ?? '');
  const [docs, setDocs] = useState(application.documents.map((d) => ({ ...d })));

  // Inline nickname rename (AIN-95): pencil → input → PATCH → local display
  // update + optional host refetch hook. `displayName` is the source of truth
  // for what's shown; it starts at the adapter's fallback (nickname ?? title
  // ?? address ?? 'Saved listing', see to-crm-unit.ts) and only ever changes
  // on a successful save.
  const [displayName, setDisplayName] = useState<string>(u.building);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState<string>(u.building);
  const [savingName, setSavingName] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const startRename = () => {
    setNameDraft(displayName);
    setRenameError(null);
    setIsEditingName(true);
  };

  const cancelRename = () => {
    setNameDraft(displayName);
    setRenameError(null);
    setIsEditingName(false);
  };

  const saveRename = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || savingName) return;
    setSavingName(true);
    setRenameError(null);
    try {
      const response = await fetch(`/api/crm/listings/${encodeURIComponent(unit.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname: trimmed }),
      });
      if (!response.ok) {
        let message = 'Failed to rename listing';
        try {
          const body: unknown = await response.json();
          if (
            body !== null &&
            typeof body === 'object' &&
            typeof (body as { error?: unknown }).error === 'string'
          ) {
            message = (body as { error: string }).error;
          }
        } catch {
          // Non-JSON error body — keep the status fallback message.
        }
        throw new Error(message);
      }
      const body = (await response.json()) as { listing?: { nickname?: string | null } };
      const savedName = body.listing?.nickname ?? trimmed;
      setDisplayName(savedName);
      setIsEditingName(false);
      onRenamed?.(unit.id, savedName);
    } catch (err: unknown) {
      setRenameError(err instanceof Error ? err.message : 'Failed to rename listing');
    } finally {
      setSavingName(false);
    }
  };

  // Analysis tri-state: 'loading' → 'done' | 'error'
  const [analysisState, setAnalysisState] = useState<'loading' | 'done' | 'error'>('loading');
  const [analysis, setAnalysis] = useState<FirstSaveAnalysis | null>(null);

  // Ref on close button for focus management on mount.
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    void crmClient.getAnalysis(unit.id).then((a) => {
      if (alive) {
        setAnalysis(a);
        setAnalysisState('done');
      }
    }).catch(() => {
      if (alive) setAnalysisState('error');
    });
    return () => {
      alive = false;
    };
  }, [unit.id]);

  // Focus the close button on mount and wire Escape to onClose.
  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

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
        aria-modal="true"
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
              {isEditingName ? (
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveRename();
                  }}
                >
                  <input
                    id="f-listing-name"
                    aria-label="Listing name"
                    type="text"
                    value={nameDraft}
                    autoFocus
                    disabled={savingName}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        cancelRename();
                      }
                    }}
                    maxLength={60}
                    className="min-w-0 flex-1 rounded-[8px] border bg-white px-2 py-1 text-[0.78rem] outline-none"
                    style={{ borderColor: 'var(--surface-200)', color: 'var(--surface-900)' }}
                  />
                  <button
                    type="submit"
                    aria-label="Save name"
                    disabled={savingName || nameDraft.trim().length === 0}
                    className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md disabled:opacity-50"
                    style={{ background: 'var(--surface-100)', color: 'var(--surface-600)' }}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel rename"
                    disabled={savingName}
                    onClick={cancelRename}
                    className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md disabled:opacity-50"
                    style={{ background: 'var(--surface-100)', color: 'var(--surface-600)' }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </form>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span data-testid="listing-display-name">{displayName}</span>
                  {u.floorPlan ? <span>{` · Floor plan ${u.floorPlan}`}</span> : null}
                  <button
                    type="button"
                    aria-label="Rename listing"
                    onClick={startRename}
                    className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md"
                    style={{ color: 'var(--surface-400)' }}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </span>
              )}
              {renameError ? (
                <div className="mt-1 text-[0.72rem]" style={{ color: 'var(--fair-bad)' }}>
                  {renameError}
                </div>
              ) : null}
            </div>
          </div>
          <button
            ref={closeButtonRef}
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
          {/* Photo gallery — hero + additional thumbnails */}
          {photos.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: 'var(--surface-200)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={unit.title ?? ''} className="block h-[170px] w-full object-cover" />
              </div>
              {photos.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photos.slice(1).map((url, i) => (
                    <div
                      key={`${url}-${i}`}
                      className="h-16 w-24 flex-shrink-0 overflow-hidden rounded-[10px] border"
                      style={{ borderColor: 'var(--surface-200)' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Photo ${i + 2}`} className="block h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : null}
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

          {/* Listing metadata: description, source link, move-in, saved date */}
          {(unit.description != null || unit.source_url || unit.available_from || unit.saved_at) ? (
            <Block>
              {unit.description != null ? (
                <p
                  className="m-0 text-[0.875rem] leading-relaxed"
                  style={{ color: 'var(--surface-700)' }}
                >
                  {unit.description}
                </p>
              ) : null}
              {(unit.source_url || unit.available_from || unit.saved_at) ? (
                <div
                  className={cn('flex flex-col gap-1.5', unit.description != null ? 'mt-3.5' : '')}
                >
                  {unit.source_url ? (
                    <a
                      href={unit.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold"
                      style={{ color: 'var(--primary-800)' }}
                    >
                      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
                      View original listing
                      {unit.source_site ? (
                        <span
                          className="rounded-full border px-1.5 py-0.5 text-[0.6875rem] font-bold"
                          style={{
                            color: 'var(--surface-500)',
                            borderColor: 'var(--surface-200)',
                            background: 'var(--surface-50)',
                          }}
                        >
                          {unit.source_site}
                        </span>
                      ) : null}
                    </a>
                  ) : null}
                  <div className="flex flex-wrap gap-3.5">
                    {unit.available_from ? (
                      <span
                        data-testid="move-in-date"
                        className="inline-flex items-center gap-1.5 text-[0.8125rem]"
                        style={{ color: 'var(--surface-600)' }}
                      >
                        <Calendar aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
                        Move-in {fmtDate(unit.available_from)}
                      </span>
                    ) : null}
                    {unit.saved_at ? (
                      <span
                        data-testid="saved-at-date"
                        className="inline-flex items-center gap-1.5 text-[0.8125rem]"
                        style={{ color: 'var(--surface-500)' }}
                      >
                        <BookmarkCheck aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
                        Saved {fmtDate(unit.saved_at)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </Block>
          ) : null}

          {/* Amenity split */}
          <Block>
            <SectionLabel icon={<Home className="h-[15px] w-[15px]" />} label="Amenities · unit vs building" />
            <AmenitySplit split={amenitySplit} className="mt-0" />
          </Block>

          {/* Floor plans (AIN-83) — read-only per-plan breakdown for a
              building-page save. Absent entirely when the row has none
              (legacy rows, single-unit saves with no plan data). */}
          {floorPlans.length > 0 ? (
            <Block>
              <SectionLabel icon={<Layers className="h-[15px] w-[15px]" />} label="Floor plans" />
              <div className="flex flex-col">
                {floorPlans.map((plan, i) => (
                  <FloorPlanRow key={`${plan.name}-${i}`} plan={plan} />
                ))}
              </div>
            </Block>
          ) : null}

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
          <AnalysisSection analysisState={analysisState} analysis={analysis} />
        </div>
      </aside>
    </>
  );
}

/** Renders the three async analysis blocks, degrading through tri-state. */
function AnalysisSection({
  analysisState,
  analysis,
}: {
  analysisState: 'loading' | 'done' | 'error';
  analysis: FirstSaveAnalysis | null;
}) {
  if (analysisState === 'error') {
    return (
      <>
        <Block>
          <SectionLabel icon={<DollarSign className="h-[15px] w-[15px]" />} label="True cost" />
          <AnalysisError />
        </Block>
        <Block>
          <SectionLabel icon={<Flag className="h-[15px] w-[15px]" />} label="Red flags" />
          <AnalysisError />
        </Block>
        <Block>
          <SectionLabel icon={<MapPin className="h-[15px] w-[15px]" />} label="Nearby" />
          <AnalysisError />
        </Block>
        <Block>
          <SectionLabel icon={<HelpCircle className="h-[15px] w-[15px]" />} label="One question for you" />
          <AnalysisError />
        </Block>
      </>
    );
  }

  return (
    <>
      <Block>
        <SectionLabel icon={<DollarSign className="h-[15px] w-[15px]" />} label="True cost" />
        {analysisState === 'done' && analysis ? (
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
        {analysisState === 'done' && analysis ? (
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

      {/* Nearby places (placesSnapshot) */}
      <Block>
        <SectionLabel icon={<MapPin className="h-[15px] w-[15px]" />} label="Nearby" />
        {analysisState === 'done' && analysis ? (
          <BranchState branch={analysis.placesSnapshot}>
            {(ps) => (
              <div>
                {Object.entries(ps.categories).map(([cat, items]) => (
                  <div key={cat} className="mb-2.5 last:mb-0">
                    <div
                      className="mb-1.5 text-[0.6875rem] font-extrabold uppercase tracking-[0.08em]"
                      style={{ color: 'var(--surface-400)' }}
                    >
                      {cat}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((n) => (
                        <span
                          key={n}
                          className="rounded-md border px-2 py-1 text-xs font-semibold"
                          style={{
                            color: 'var(--surface-700)',
                            background: 'var(--surface-50)',
                            borderColor: 'var(--surface-200)',
                          }}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </BranchState>
        ) : (
          <LoadingHint />
        )}
      </Block>

      {/* Steering question */}
      <Block>
        <SectionLabel icon={<HelpCircle className="h-[15px] w-[15px]" />} label="One question for you" />
        {analysisState === 'done' && analysis ? (
          <BranchState branch={analysis.steeringQuestion}>
            {(sq) => (
              <p
                className="m-0 text-[0.9375rem] font-bold leading-snug"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--surface-900)' }}
              >
                {sq.question}
              </p>
            )}
          </BranchState>
        ) : (
          <LoadingHint />
        )}
      </Block>
    </>
  );
}

/**
 * Format a floor plan's rent as a single value or a range: `$1,819–$2,118`
 * when min/max differ, `$1,825` when they match (or only one is known),
 * `—` when neither is present. `money` already null-safes each side.
 */
function formatFloorPlanRent(min: number | null, max: number | null): string {
  if (min != null && max != null && min !== max) return `${money(min)}–${money(max)}`;
  return money(min ?? max);
}

/**
 * One read-only floor-plan row (AIN-83): name — beds/baths — sqft —
 * availability, with the rent range right-aligned. Plain React-escaped
 * text throughout — every field originates from a third-party listing page.
 */
function FloorPlanRow({ plan }: { plan: FloorPlan }) {
  const specs = [bedLabel(plan.bedrooms ?? null), plan.bathrooms != null ? `${plan.bathrooms} bath` : null]
    .filter((s): s is string => Boolean(s))
    .join(' · ');
  const sqft = plan.sqft != null ? `${plan.sqft.toLocaleString()} sqft` : null;
  const rent = formatFloorPlanRent(plan.rent_min ?? null, plan.rent_max ?? null);

  return (
    <div
      className="flex items-center justify-between gap-3 border-t py-2 text-[0.8125rem] first:border-t-0 first:pt-0"
      style={{ borderColor: 'var(--surface-100)' }}
    >
      <div className="min-w-0">
        <span className="font-semibold" style={{ color: 'var(--surface-900)' }}>
          {plan.name}
        </span>
        {[specs, sqft, plan.availability].filter(Boolean).map((detail, i) => (
          <span key={i} style={{ color: 'var(--surface-500)' }}>
            {' '}
            · {detail}
          </span>
        ))}
      </div>
      <div className="flex-shrink-0 whitespace-nowrap font-bold" style={{ color: 'var(--surface-900)' }}>
        {rent}
        {rent !== '—' ? <span className="font-medium" style={{ color: 'var(--surface-500)' }}>/mo</span> : null}
      </div>
    </div>
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

function AnalysisError() {
  return (
    <p className="text-sm" style={{ color: 'var(--surface-400)' }}>
      No analysis yet — CribAI runs a deep scan in the background.
    </p>
  );
}
