'use client';

import { cn } from '@/lib/utils';
import { Bed, Bath, MapPin, Check, Maximize2 } from 'lucide-react';
import type { CrmUnit, CrmListMember } from '@/lib/crm/proposed-types';
import { money, bedLabel } from '@/lib/crm/format';
import { StatusPill } from './ui/StatusPill';
import { DeadlinePill } from './ui/DeadlinePill';
import { AmenitySplit } from './ui/AmenitySplit';

/**
 * Inline saved-unit chat card — UNIT-forward. Ported from the `.listing-card`
 * markup in workspace-closed.html: leads with the floor-plan/unit label, shows
 * the building as context, emphasizes sqft + rent, and surfaces the application
 * StatusPill / DeadlinePill, the AmenitySplit, an extraction-confidence badge,
 * and an "added by" attribution avatar.
 *
 * Reuses the Phase-1 primitives (StatusPill, DeadlinePill, AmenitySplit) rather
 * than re-implementing them.
 */
/** Confidence (0..1) → fair-scale color treatment (mirrors `.badge-*`). */
function confidenceColors(c: number): { color: string; background: string } {
  if (c >= 0.85) return { color: 'var(--fair-good)', background: 'var(--fair-good-bg)' };
  if (c >= 0.65) return { color: 'var(--fair-ok)', background: 'var(--fair-ok-bg)' };
  return { color: 'var(--fair-bad)', background: 'var(--fair-bad-bg)' };
}

export function SavedUnitCard({
  unit,
  onOpen,
  addedByMember,
}: {
  unit: CrmUnit;
  onOpen?: (id: string) => void;
  /** Resolved roster member who added this unit. When absent, the
   *  "added by" attribution line is omitted (we never parse the member id). */
  addedByMember?: CrmListMember;
}) {
  const { unit: u, amenitySplit, application } = unit._proposed;
  const photo = unit.photo_urls?.[0] ?? '';
  const hasConfidence = unit.extraction_confidence != null;
  const conf = hasConfidence ? Math.round(unit.extraction_confidence! * 100) : 0;
  const confColors = confidenceColors(unit.extraction_confidence ?? 0);
  const interactive = Boolean(onOpen);

  return (
    <div
      className={cn(
        'flex overflow-hidden rounded-2xl border bg-white max-[720px]:flex-col',
        interactive && 'cursor-pointer',
      )}
      style={{ borderColor: 'var(--surface-200)', boxShadow: 'var(--shadow-soft)' }}
      onClick={interactive ? () => onOpen?.(unit.id) : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen?.(unit.id);
              }
            }
          : undefined
      }
    >
      {/* Photo + "Saved" pill */}
      <div
        className="relative w-[168px] flex-shrink-0 overflow-hidden max-[720px]:h-40 max-[720px]:w-full"
        style={{ background: 'var(--surface-100)' }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={unit.title ?? ''} className="block h-full w-full object-cover" />
        ) : null}
        <span
          className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.6875rem] font-extrabold tracking-wide"
          style={{ color: 'var(--fair-good)', background: 'rgba(255,255,255,0.92)', boxShadow: 'var(--shadow-card)' }}
        >
          <Check aria-hidden="true" className="h-3 w-3" /> Saved
        </span>
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1 px-[1.1rem] py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* Lead with the UNIT label (carries the floor-plan token, e.g. "Studio S1") */}
            <h3
              className="m-0 text-[1.0625rem] font-bold leading-tight"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--surface-900)' }}
            >
              {u.unitLabel}
            </h3>
            {/* Building as context */}
            <div
              className="mt-1 text-xs font-semibold"
              style={{ color: 'var(--surface-500)' }}
            >
              {u.building}
            </div>
            <div
              className="mt-1.5 flex items-center gap-1 text-[0.8125rem]"
              style={{ color: 'var(--surface-500)' }}
            >
              <MapPin aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
              {unit.address}
            </div>
          </div>
          <div
            className="whitespace-nowrap text-[1.375rem] font-extrabold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--surface-900)' }}
          >
            {unit.rent != null ? money(unit.rent) : '—'}
            <span className="text-[0.8125rem] font-medium" style={{ color: 'var(--surface-500)' }}>
              /mo
            </span>
          </div>
        </div>

        {/* Meta pills — sqft emphasized. Split number/unit across spans so the
            sqft figure isn't a duplicate "395 sqft" text leaf (the AmenitySplit
            primitive already renders that string from the fixture). */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <MetaPill>
            <Bed aria-hidden="true" className="h-3.5 w-3.5" style={{ color: 'var(--primary-700)' }} />
            {bedLabel(unit.bedrooms)}
          </MetaPill>
          {unit.bathrooms != null ? (
            <MetaPill>
              <Bath aria-hidden="true" className="h-3.5 w-3.5" style={{ color: 'var(--primary-700)' }} />
              {unit.bathrooms} bath
            </MetaPill>
          ) : null}
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold"
            style={{ color: 'var(--primary-800)', background: 'var(--primary-50)', borderColor: 'var(--primary-100)' }}
          >
            <Maximize2 aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{unit.sqft != null ? unit.sqft.toLocaleString() : '—'}</span>
            <span>sq&nbsp;ft</span>
          </span>
          {hasConfidence ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.6875rem] font-bold"
              style={confColors}
            >
              <Check aria-hidden="true" className="h-3 w-3" />
              {conf}% confident extract
            </span>
          ) : null}
        </div>

        {/* Unit vs building amenities (reused primitive) */}
        <AmenitySplit split={amenitySplit} />

        {/* Application affordance: status + deadline + attribution */}
        <div
          className="mt-3.5 flex flex-wrap items-center gap-2.5 border-t pt-3"
          style={{ borderColor: 'var(--surface-200)' }}
        >
          <StatusPill status={unit.status} />
          {application.deadlineLabel &&
          application.stage !== 'decision' &&
          unit.status !== 'declined' ? (
            <DeadlinePill label={application.deadlineLabel} deadline={application.deadline} />
          ) : null}
          {addedByMember ? <AddedBy member={addedByMember} /> : null}
        </div>
      </div>
    </div>
  );
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold"
      style={{ color: 'var(--surface-700)', background: 'var(--surface-50)', borderColor: 'var(--surface-200)' }}
    >
      {children}
    </span>
  );
}

/**
 * "added by" attribution. Renders the RESOLVED roster member (initials + name +
 * brand color), matching the `MemberAvatars` primitive's avatar treatment — no
 * id parsing. Callers omit this entirely when the member can't be resolved.
 */
function AddedBy({ member }: { member: CrmListMember }) {
  return (
    <span
      className="ml-auto inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold"
      style={{ color: 'var(--surface-400)' }}
      aria-label={`Added by ${member.name}`}
    >
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[0.5rem] font-extrabold text-white"
        style={{ background: member.color, boxShadow: 'inset 0 0 0 1.5px #fff, var(--shadow-card)' }}
        aria-hidden="true"
      >
        {member.initials}
      </span>
      added by {member.name}
    </span>
  );
}
