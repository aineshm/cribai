'use client';

import { useState } from 'react';

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
  if (score >= 7) return 'bg-green-100 text-green-800 border-green-200';
  if (score >= 4) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-red-100 text-red-800 border-red-200';
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
        className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${scoreColor(score)} cursor-pointer`}
      >
        {score}/10 — {scoreLabel(score)}
      </button>

      {showDetails && data && (
        <div className="absolute right-0 top-full z-10 mt-2 w-64 rounded-lg border bg-white p-4 shadow-lg">
          <h4 className="font-semibold text-gray-900">Price Fairness</h4>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Percentile</dt>
              <dd className="font-medium">{data.percentile}th</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Predicted Rent</dt>
              <dd className="font-medium">
                ${data.predictedRent.toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Delta</dt>
              <dd className="font-medium">
                {data.delta > 0 ? '+' : ''}
                {data.delta.toFixed(1)}%
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Comparables</dt>
              <dd className="font-medium">{data.comparableCount}</dd>
            </div>
          </dl>
          <button
            onClick={() => setShowDetails(false)}
            className="mt-3 text-xs text-gray-400 hover:text-gray-600"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
