'use client';

import { useEffect, useState } from 'react';
import { Eye, Users } from 'lucide-react';

interface ViewStats {
  readonly totalViews: number;
  readonly uniqueViewers: number;
}

interface ListingViewStatsProps {
  readonly listingId: string;
}

/**
 * Fetches and displays listing view statistics.
 * Only visible to the listing creator — the API returns 401/403 for
 * unauthenticated users or non-creators, in which case we render nothing.
 */
export function ListingViewStats({ listingId }: ListingViewStatsProps) {
  const [stats, setStats] = useState<ViewStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        const res = await fetch(`/api/listings/${listingId}/stats`);
        if (!res.ok) return; // Not the creator or not logged in — hide stats
        const data = await res.json() as ViewStats;
        if (!cancelled) {
          setStats(data);
        }
      } catch {
        // Silently fail — stats are non-critical
      }
    }

    fetchStats();

    return () => {
      cancelled = true;
    };
  }, [listingId]);

  // Don't render anything if user isn't the creator or stats unavailable
  if (!stats) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <div className="flex items-center gap-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span className="text-sm font-medium text-emerald-800">
          Your listing stats
        </span>
        <div className="flex items-center gap-1.5 text-sm text-emerald-700">
          <Eye className="size-4" aria-hidden="true" />
          <span>
            {stats.totalViews} {stats.totalViews === 1 ? 'view' : 'views'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-emerald-700">
          <Users className="size-4" aria-hidden="true" />
          <span>
            {stats.uniqueViewers} unique {stats.uniqueViewers === 1 ? 'visitor' : 'visitors'}
          </span>
        </div>
      </div>
    </div>
  );
}
