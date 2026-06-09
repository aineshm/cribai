'use client';

import { cn } from '@/lib/utils';
import type { RankCompareResult, RankedListing, CompareRow } from '@campusnest/ai';
import { money, bedLabel } from '@/lib/crm/format';

/**
 * Renders a RankCompareResult, discriminating on `result.mode`:
 *
 * - `rank`    → a scored leaderboard (medal + overall score bar + per-dimension
 *               mini-bars). Ported from the Rank tab in workspace-canvas-open.html.
 *               Rendered as a real <ul>/<li> list so each ranked row is a listitem.
 * - `compare` → a side-by-side <table> (one column per listing; rows for rent,
 *               beds, baths, sqft, amenities). Ported from the Compare tab.
 *
 * `RankedListing` / `CompareRow` arrive fully typed off the discriminated union,
 * so no separate contract import is needed beyond the result type itself.
 */
/**
 * Per-dimension mini-bars, in display order. Keys are the real contract scoring
 * features (`SCORING_FEATURES` in packages/ai/src/crm/scoring-features.ts) used
 * to read `item.breakdown[key]`; `label` is the human-facing display string.
 */
const DIMENSIONS = [
  { key: 'rent', label: 'Price' },
  { key: 'bedrooms', label: 'Beds' },
  { key: 'sqft', label: 'Space' },
  { key: 'commute', label: 'Commute' },
] as const;

/** Score (0..100) → fair-scale color treatment (mirrors `.dim-bar .fill.{good,ok,bad}`). */
function scoreColor(v: number): string {
  if (v >= 80) return 'var(--fair-good)';
  if (v >= 60) return 'var(--fair-ok)';
  return 'var(--fair-bad)';
}

export function RankCompareTable({ result }: { result: RankCompareResult }) {
  if (result.mode === 'rank') return <RankBoard ranked={result.ranked} />;
  return <CompareGrid rows={result.rows} />;
}

// ---------------------------------------------------------------------------
// Rank: scored leaderboard
// ---------------------------------------------------------------------------
function RankBoard({ ranked }: { ranked: readonly RankedListing[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
      {ranked.map((item, idx) => (
        <RankRow key={item.listingId} item={item} rank={idx + 1} top={idx === 0} />
      ))}
    </ul>
  );
}

function RankRow({ item, rank, top }: { item: RankedListing; rank: number; top: boolean }) {
  return (
    <li
      className="flex items-start gap-[1.1rem] rounded-2xl border bg-white p-[1.1rem]"
      style={{
        borderColor: top ? 'var(--primary-200)' : 'var(--surface-200)',
        boxShadow: top ? 'var(--shadow-soft)' : 'var(--shadow-card)',
      }}
    >
      {/* Medal / rank index */}
      <div
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-lg font-extrabold"
        style={
          top
            ? {
                color: '#fff',
                background: 'linear-gradient(135deg, var(--primary-700), var(--primary-900))',
                boxShadow: '0 4px 12px rgba(127, 29, 29, 0.25)',
                fontFamily: 'var(--font-display)',
              }
            : { color: 'var(--surface-500)', background: 'var(--surface-100)', fontFamily: 'var(--font-display)' }
        }
        aria-hidden="true"
      >
        {rank}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-2.5 flex items-start justify-between gap-3.5">
          <h3
            className="m-0 min-w-0 text-[1.0625rem] font-bold leading-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--surface-900)' }}
          >
            {item.title}
          </h3>
          <div className="flex-shrink-0 text-right">
            <div
              className="text-[1.875rem] font-extrabold leading-none"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--primary-800)' }}
            >
              {item.score}
              <span className="text-[0.8125rem] font-medium" style={{ color: 'var(--surface-400)' }}>
                /100
              </span>
            </div>
            <div
              className="mt-0.5 text-[0.625rem] font-extrabold uppercase tracking-[0.1em]"
              style={{ color: 'var(--surface-400)' }}
            >
              Score
            </div>
          </div>
        </div>

        {/* Overall score bar */}
        <div
          className="mb-[0.95rem] h-2 overflow-hidden rounded-full"
          style={{ background: 'var(--surface-100)' }}
          role="presentation"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${clampPct(item.score)}%`,
              background: 'linear-gradient(90deg, var(--primary-700), var(--accent-500))',
            }}
          />
        </div>

        {/* Per-dimension mini-bars */}
        <div className="grid grid-cols-4 gap-3.5 max-[720px]:grid-cols-2">
          {DIMENSIONS.map((dim) => {
            const v = item.breakdown[dim.key];
            if (v == null) return null;
            return <DimBar key={dim.key} name={dim.label} value={v} />;
          })}
        </div>
      </div>
    </li>
  );
}

function DimBar({ name, value }: { name: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between">
        <span
          className="text-[0.625rem] font-extrabold uppercase tracking-[0.08em]"
          style={{ color: 'var(--surface-400)' }}
        >
          {name}
        </span>
        <span className="text-[0.8125rem] font-bold" style={{ color: 'var(--surface-700)' }}>
          {value}
        </span>
      </div>
      <div
        className="h-[5px] overflow-hidden rounded-full"
        style={{ background: 'var(--surface-100)' }}
        role="presentation"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${clampPct(value)}%`, background: scoreColor(value) }}
        />
      </div>
    </div>
  );
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

// ---------------------------------------------------------------------------
// Compare: side-by-side table
// ---------------------------------------------------------------------------
function CompareGrid({ rows }: { rows: readonly CompareRow[] }) {
  const headCell = 'border-b px-4 py-3 text-left text-[0.8125rem]';
  const rowLabel =
    'w-40 border-b px-4 py-3 text-left text-[0.6875rem] font-bold uppercase tracking-[0.06em]';
  const dataCell = 'border-b px-4 py-3 text-left text-[0.8125rem] font-semibold';

  return (
    <div
      className="overflow-hidden rounded-2xl border bg-white"
      style={{ borderColor: 'var(--surface-200)', boxShadow: 'var(--shadow-card)' }}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th
              scope="col"
              className={cn(headCell, 'font-bold')}
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--surface-900)',
                background: 'var(--surface-50)',
                borderColor: 'var(--surface-200)',
              }}
            >
              Field
            </th>
            {rows.map((r) => (
              <th
                key={r.listingId}
                scope="col"
                className={cn(headCell, 'text-[0.9375rem] font-bold')}
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--surface-900)',
                  background: 'var(--surface-50)',
                  borderColor: 'var(--surface-200)',
                }}
              >
                {r.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <CompareBodyRow
            label="Rent"
            rows={rows}
            cell={(r) => (r.rent != null ? `${money(r.rent)}/mo` : '—')}
            rowLabelCls={rowLabel}
            dataCellCls={dataCell}
          />
          <CompareBodyRow
            label="Beds"
            rows={rows}
            cell={(r) => bedLabel(r.bedrooms)}
            rowLabelCls={rowLabel}
            dataCellCls={dataCell}
          />
          <CompareBodyRow
            label="Baths"
            rows={rows}
            cell={(r) => (r.bathrooms != null ? `${r.bathrooms} bath` : '—')}
            rowLabelCls={rowLabel}
            dataCellCls={dataCell}
          />
          <CompareBodyRow
            label="Sqft"
            rows={rows}
            cell={(r) => (r.sqft != null ? `${r.sqft.toLocaleString()} sqft` : '—')}
            rowLabelCls={rowLabel}
            dataCellCls={dataCell}
          />
          <CompareBodyRow
            label="Amenities"
            rows={rows}
            cell={(r) => (r.amenities.length > 0 ? r.amenities.join(', ') : '—')}
            rowLabelCls={rowLabel}
            dataCellCls={dataCell}
          />
        </tbody>
      </table>
    </div>
  );
}

function CompareBodyRow({
  label,
  rows,
  cell,
  rowLabelCls,
  dataCellCls,
}: {
  label: string;
  rows: readonly CompareRow[];
  cell: (row: CompareRow) => string;
  rowLabelCls: string;
  dataCellCls: string;
}) {
  return (
    <tr>
      <th
        scope="row"
        className={rowLabelCls}
        style={{ color: 'var(--surface-500)', background: 'var(--surface-50)', borderColor: 'var(--surface-200)' }}
      >
        {label}
      </th>
      {rows.map((r) => (
        <td key={r.listingId} className={dataCellCls} style={{ color: 'var(--surface-800)', borderColor: 'var(--surface-200)' }}>
          {cell(r)}
        </td>
      ))}
    </tr>
  );
}
