'use client';

import { useState } from 'react';
import { getScoreColorVariants } from '../lib/score-colors';

interface FairnessBadgeProps {
  readonly score: number;
  readonly data: {
    readonly comparableCount: number;
    readonly percentile: number;
    readonly predictedRent: number;
    readonly delta: number;
    readonly breakdown?: Record<string, number>;
  } | null;
}

function scoreColor(score: number): string {
  const v = getScoreColorVariants(score);
  return `bg-[${v.bg}] text-[${v.text}] border-[${v.border}]`;
}

function scoreBarColor(score: number): string {
  if (score >= 7) return 'bg-[var(--fair-good)]';
  if (score >= 4) return 'bg-[var(--fair-ok)]';
  return 'bg-[var(--fair-bad)]';
}

function scoreLabel(score: number): string {
  if (score >= 8) return 'Great Value';
  if (score >= 6) return 'Fair Price';
  if (score >= 4) return 'Average';
  return 'Overpriced';
}

export function FairnessBadge({ score, data }: FairnessBadgeProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${scoreColor(score)} cursor-pointer transition-colors`}
      >
        {score}/10 — {scoreLabel(score)}
      </button>

      {showDetails && data && (
        <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-xl border border-[var(--surface-200)] bg-white p-4 shadow-[var(--shadow-card-hover)] animate-fade-in">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--surface-400)]">Price Fairness</h4>

          {/* Score bar */}
          <div className="mt-3 h-2 w-full rounded-full bg-[var(--surface-100)]">
            <div
              className={`h-2 rounded-full ${scoreBarColor(score)} transition-all`}
              style={{ width: `${score * 10}%` }}
            />
          </div>

          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">Percentile</dt>
              <dd className="font-medium text-[var(--surface-700)]">{data.percentile}th</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">Predicted Rent</dt>
              <dd className="font-medium text-[var(--surface-700)]">
                ${data.predictedRent.toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">Delta</dt>
              <dd className="font-medium text-[var(--surface-700)]">
                {data.delta > 0 ? '+' : ''}
                {data.delta.toFixed(1)}%
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">Comparables</dt>
              <dd className="font-medium text-[var(--surface-700)]">{data.comparableCount}</dd>
            </div>
          </dl>
          <button
            onClick={() => setShowDetails(false)}
            className="mt-3 text-xs text-[var(--surface-400)] hover:text-[var(--surface-600)] transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
