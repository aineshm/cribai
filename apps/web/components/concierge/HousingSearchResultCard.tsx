'use client';

import { MapPin, Star, TrendingUp, Footprints } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ShortlistItem, ShortlistReport } from '@campusnest/types';

interface ShortlistItemRowProps {
  readonly item: ShortlistItem;
  readonly isTop: boolean;
}

function ShortlistItemRow({ item, isTop }: ShortlistItemRowProps) {
  return (
    <div className="flex gap-3 py-3 border-b last:border-0">
      <div className="flex-shrink-0 pt-0.5">
        <Badge variant={isTop ? 'default' : 'secondary'} className="w-8 justify-center tabular-nums">
          #{item.rank}
        </Badge>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1 text-sm font-medium truncate min-w-0">
            <MapPin className="size-3.5 flex-shrink-0 text-muted-foreground" />
            <span className="truncate">{item.address}</span>
          </span>
          <span className="flex-shrink-0 text-sm font-semibold">
            ${item.rentMonthly.toLocaleString()}/mo
          </span>
        </div>

        <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
          {item.fairnessScore != null && (
            <span className="flex items-center gap-1">
              <TrendingUp className="size-3" />
              Fair {item.fairnessScore}/10
            </span>
          )}
          {item.reviewRating != null && (
            <span className="flex items-center gap-1">
              <Star className="size-3" />
              {item.reviewRating.toFixed(1)}/5
            </span>
          )}
          {item.walkScore != null && (
            <span className="flex items-center gap-1">
              <Footprints className="size-3" />
              Walk {item.walkScore}
            </span>
          )}
        </div>

        <p className="mt-1 text-xs text-muted-foreground italic leading-relaxed">
          {item.reasoning}
        </p>
      </div>
    </div>
  );
}

interface HousingSearchResultCardProps {
  readonly report: ShortlistReport;
}

export function HousingSearchResultCard({ report }: HousingSearchResultCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          Housing Shortlist
          <span className="text-xs font-normal text-muted-foreground">
            {report.items.length} of {report.totalSearched} listings
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        {report.items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No listings matched your criteria. Try adjusting your budget or preferences.
          </p>
        ) : (
          <div>
            {report.items.map((item, i) => (
              <ShortlistItemRow key={item.listingId} item={item} isTop={i === 0} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
