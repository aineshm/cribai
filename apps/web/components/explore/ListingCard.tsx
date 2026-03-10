'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bed,
  Bath,
  MapPin,
  Star,
  Heart,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { scaleOnHover } from '@/lib/animations';
import type { Listing } from '@/lib/mock-listings';

interface ListingCardProps {
  readonly listing: Listing;
}

export function ListingCard({ listing }: ListingCardProps) {
  const [saved, setSaved] = useState(listing.isSaved);

  const bedLabel = listing.beds === 0 ? 'Studio' : `${listing.beds} bd`;
  const bathLabel = `${listing.baths} ba`;

  return (
    <motion.div {...scaleOnHover}>
      <Card className="relative overflow-hidden p-0 gap-0">
        {/* Photo placeholder */}
        <div
          className={`relative aspect-[4/3] bg-gradient-to-br ${listing.photos[0]} flex items-end`}
        >
          {/* Save button */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-2 bg-white/80 backdrop-blur-sm hover:bg-white/90 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              setSaved((prev) => !prev);
            }}
          >
            <Heart
              className={`size-4 ${
                saved
                  ? 'fill-[var(--accent-500)] text-[var(--accent-500)]'
                  : 'text-[var(--surface-600)]'
              }`}
            />
          </Button>

          {/* AI Verified badge */}
          {listing.isVerified && (
            <Badge
              variant="outline"
              className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm text-[var(--primary-700)] border-[var(--primary-200)]"
            >
              <ShieldCheck className="size-3" />
              AI Verified
            </Badge>
          )}
        </div>

        <CardContent className="p-3 space-y-2">
          {/* Price & beds/baths */}
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold text-foreground">
              ${listing.price.toLocaleString()}
              <span className="text-sm font-normal text-muted-foreground">
                /mo
              </span>
            </span>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Bed className="size-3.5" />
                {bedLabel}
              </span>
              <span className="flex items-center gap-1">
                <Bath className="size-3.5" />
                {bathLabel}
              </span>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-sm font-medium text-foreground leading-snug truncate">
            {listing.title}
          </h3>

          {/* Distance & Rating */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {listing.distanceToCampus} mi to campus
            </span>
            <span className="flex items-center gap-1">
              <Star className="size-3 fill-[var(--secondary-500)] text-[var(--secondary-500)]" />
              {listing.rating}
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
