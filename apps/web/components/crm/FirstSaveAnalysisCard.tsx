'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles, DollarSign, Flag, MapPin, HelpCircle, AlertTriangle } from 'lucide-react';
import type { FirstSaveAnalysis } from '@campusnest/ai';
import { BranchState } from './ui/BranchState';

/**
 * The first-save "wow" analysis card. FOUR sections — True Cost, Red Flags,
 * Nearby, and One question — each rendered through the crash-safe Phase-1
 * `BranchState`, so a skipped/error fanout branch never reads `.data` and never
 * crashes. Ported from the `.analysis` card in workspace-closed.html.
 *
 * NOTE: the mockup's extra "Confidence" cell is intentionally dropped — it is
 * not part of the `FirstSaveAnalysis` contract.
 */
const money = (n: number): string => `$${n.toLocaleString()}`;

/**
 * Canonical quick-reply chips for the steering question. Mirror the contract's
 * fixed steering prompt ("…price, commute, or space?") in
 * packages/ai/src/crm/first-save-analysis.ts.
 */
const QUICK_REPLIES = ['Price', 'Commute', 'Space'] as const;

export function FirstSaveAnalysisCard({
  analysis,
  onAnswer,
}: {
  analysis: FirstSaveAnalysis;
  onAnswer?: (a: string) => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-[20px] border bg-white"
      style={{ borderColor: 'var(--surface-200)', boxShadow: 'var(--shadow-soft)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 border-b px-[1.3rem] py-[1.1rem]"
        style={{
          borderColor: 'var(--surface-200)',
          background: 'linear-gradient(180deg, rgba(254, 242, 242, 0.5), rgba(255,255,255,0))',
        }}
      >
        <span
          className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-white"
          style={{ background: 'linear-gradient(135deg, var(--primary-700), var(--primary-900))' }}
          aria-hidden="true"
        >
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h3
            className="m-0 text-[1.0625rem] font-extrabold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--surface-900)' }}
          >
            First look
          </h3>
          <p className="m-0 mt-0.5 text-[0.78rem]" style={{ color: 'var(--surface-500)' }}>
            I ran four checks the moment you saved it.
          </p>
        </div>
      </div>

      {/* Four-section grid */}
      <div
        className="grid grid-cols-1 gap-px min-[720px]:grid-cols-2"
        style={{ background: 'var(--surface-200)' }}
      >
        {/* True Cost */}
        <Section icon={<DollarSign className="h-[15px] w-[15px]" />} label="True Cost">
          <BranchState branch={analysis.trueCost}>
            {(tc) => (
              <div>
                <CostRow label="Rent" value={tc.rent} />
                <CostRow label="Utilities" value={tc.utilities} />
                <CostRow label="Parking" value={tc.parking} />
                <CostRow label="Internet" value={tc.internet} />
                <CostRow label="Laundry" value={tc.laundry} />
                <CostRow label="Renter insurance" value={tc.renterInsurance} />
                <CostRow label="Move-in (amortized)" value={tc.moveInFees} />
                <div
                  className="mt-2.5 flex items-baseline justify-between border-t pt-2.5"
                  style={{ borderTop: '1.5px dashed var(--surface-200)' }}
                >
                  <span
                    className="text-[0.78rem] font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--surface-700)' }}
                  >
                    Total / mo
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
              </div>
            )}
          </BranchState>
        </Section>

        {/* Red Flags */}
        <Section icon={<Flag className="h-[15px] w-[15px]" />} label="Red Flags">
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
                        <AlertTriangle aria-hidden="true" className="h-3 w-3" />
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
        </Section>

        {/* Nearby (the skipped branch in the partial fixture) */}
        <Section icon={<MapPin className="h-[15px] w-[15px]" />} label="Nearby">
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
        </Section>

        {/* One question — full-width footer */}
        <div
          className="px-[1.3rem] pb-[1.35rem] pt-[1.2rem] min-[720px]:col-span-2"
          style={{
            background: 'linear-gradient(180deg, #fff, rgba(254, 242, 242, 0.45))',
            borderTop: '1px solid var(--surface-200)',
          }}
        >
          <SectionLabel icon={<HelpCircle className="h-[15px] w-[15px]" />} label="One question for you" />
          <BranchState branch={analysis.steeringQuestion}>
            {(sq) => (
              <div>
                <p
                  className="m-0 mb-3.5 text-[1.0625rem] font-bold leading-snug"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--surface-900)' }}
                >
                  {sq.question}
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_REPLIES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => onAnswer?.(r)}
                      className="rounded-full border px-3 py-1.5 text-sm font-bold"
                      style={{
                        color: 'var(--primary-800)',
                        background: 'var(--primary-50)',
                        borderColor: 'var(--primary-100)',
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </BranchState>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-white px-[1.3rem] py-[1.15rem]">
      <SectionLabel icon={icon} label={label} />
      {children}
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className={cn('mb-3.5 flex items-center gap-2')}>
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

function CostRow({ label, value }: { label: string; value: number }) {
  const free = value === 0;
  return (
    <div className="flex items-center justify-between py-[0.3rem] text-sm">
      <span style={{ color: 'var(--surface-500)' }}>{label}</span>
      <span
        className={free ? 'font-bold' : 'font-semibold'}
        style={{ color: free ? 'var(--fair-good)' : 'var(--surface-800)' }}
      >
        {free ? 'Included' : money(value)}
      </span>
    </div>
  );
}
