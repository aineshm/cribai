'use client';

import Link from 'next/link';

interface ListingSummary {
  readonly id: string;
  readonly address: string;
  readonly rentMonthly: number;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly fairnessScore: number | null;
  readonly trueCostTotal: number | null;
  readonly amenities: readonly string[];
  readonly campusSlug?: string;
}

function fairnessLabel(score: number): string {
  if (score >= 8) return 'Great';
  if (score >= 6) return 'Fair';
  if (score >= 4) return 'Avg';
  return 'Poor';
}

interface ChatComparisonTableProps {
  readonly listings: readonly ListingSummary[];
  readonly campusSlug: string;
}

export function ChatComparisonTable({ listings, campusSlug }: ChatComparisonTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white" role="table" aria-label="Listing comparison">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
            <th className="px-3 py-2 font-medium">Address</th>
            <th className="px-3 py-2 font-medium">Rent</th>
            <th className="px-3 py-2 font-medium">Beds</th>
            <th className="px-3 py-2 font-medium">Sqft</th>
            <th className="px-3 py-2 font-medium">Fairness</th>
            <th className="px-3 py-2 font-medium">True Cost</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => (
            <tr key={l.id} className="border-b last:border-b-0 hover:bg-gray-50">
              <td className="px-3 py-2">
                <Link
                  href={`/${l.campusSlug ?? campusSlug}/listings/${l.id}`}
                  className="text-blue-600 hover:underline"
                  aria-label={`View ${l.address}`}
                >
                  {l.address}
                </Link>
              </td>
              <td className="px-3 py-2 font-medium">${l.rentMonthly.toLocaleString()}</td>
              <td className="px-3 py-2">{l.bedrooms ?? '-'}</td>
              <td className="px-3 py-2">{l.sqft?.toLocaleString() ?? '-'}</td>
              <td className="px-3 py-2">
                {l.fairnessScore != null
                  ? `${l.fairnessScore}/10 (${fairnessLabel(l.fairnessScore)})`
                  : '-'}
              </td>
              <td className="px-3 py-2">
                {l.trueCostTotal != null
                  ? `$${l.trueCostTotal.toLocaleString()}`
                  : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
