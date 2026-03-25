'use client';

import Link from 'next/link';
import { Trophy, Star, DollarSign, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ShortlistItem {
  readonly rank: number;
  readonly address: string;
  readonly listingId: string;
  readonly rentMonthly: number;
  readonly reasoning: string;
  readonly compositeScore: number;
  readonly reviewRating: number | null;
  readonly fairnessScore: number | null;
}

interface MissionResultsProps {
  readonly result: Record<string, unknown> | null;
}

export function MissionResults({ result }: MissionResultsProps) {
  if (!result) return null;

  const report = result.report as Record<string, unknown> | undefined;
  const items = report?.items as readonly ShortlistItem[] | undefined;

  if (!items || items.length === 0) {
    // Empty housing search — no matches found
    if (report && report.totalSearched != null) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h4 className="text-sm font-bold text-slate-800 mb-1">No Matches Found</h4>
          <p className="text-xs text-slate-700">
            Searched {report.totalSearched as number} listing(s) but none matched your criteria. Try broadening your search.
          </p>
        </div>
      );
    }

    // Sublease post result
    if (result.confirmed && result.listingUrl) {
      return (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h4 className="text-sm font-bold text-emerald-800 mb-2">Sublease Published</h4>
          <Link
            href={result.listingUrl as string}
            className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-900 transition-colors"
          >
            View your listing
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      );
    }

    // Generic fallback
    if (Object.keys(result).length > 0) {
      return (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
          <h4 className="text-sm font-bold text-gray-800 mb-1">Mission Complete</h4>
          <p className="text-xs text-gray-500">
            {Object.keys(result).length} result field(s) returned
          </p>
        </div>
      );
    }

    return null;
  }

  // Housing search shortlist
  const totalSearched = (report?.totalSearched as number) ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <Trophy className="size-4 text-slate-500" />
          Top {items.length} Results
        </h4>
        {totalSearched > 0 && (
          <span className="text-xs text-gray-500">
            from {totalSearched} searched
          </span>
        )}
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.listingId}
            href={`/listing/${item.listingId}`}
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:border-red-200 hover:bg-red-50/30 transition-all"
          >
            {/* Rank badge */}
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
              item.rank === 1 ? 'bg-slate-100 text-slate-700' :
              item.rank === 2 ? 'bg-gray-100 text-gray-600' :
              'bg-gray-50 text-gray-500'
            }`}>
              #{item.rank}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{item.address}</p>
              <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1 font-medium text-gray-800">
                  <DollarSign className="size-3" />
                  {item.rentMonthly.toLocaleString()}/mo
                </span>
                {item.reviewRating != null && (
                  <span className="flex items-center gap-1">
                    <Star className="size-3 text-slate-500" fill="currentColor" />
                    {item.reviewRating.toFixed(1)}
                  </span>
                )}
                {item.fairnessScore != null && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    Fairness: {item.fairnessScore}/10
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500 line-clamp-1">{item.reasoning}</p>
            </div>

            <ExternalLink className="size-3.5 text-gray-400 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
