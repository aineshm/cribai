'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Bed, Bath, MapPin, Footprints } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { scaleOnHover } from '@/lib/animations';
import type { ExploreListing } from '@/lib/listing-types';

interface ListingCardProps {
  readonly listing: ExploreListing;
}

/** Stable gradient based on listing ID hash for photo-less cards */
const GRADIENTS = [
  'from-primary-200 to-primary-400',
  'from-secondary-200 to-secondary-400',
  'from-teal-200 to-emerald-400',
  'from-amber-200 to-orange-400',
  'from-rose-200 to-pink-400',
  'from-sky-200 to-blue-400',
  'from-violet-200 to-purple-400',
  'from-lime-200 to-green-400',
] as const;

function gradientForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length] ?? GRADIENTS[0];
}

export function ListingCard({ listing }: ListingCardProps) {
  const bedLabel = listing.beds === null
    ? '—'
    : listing.beds === 0
      ? 'Studio'
      : `${listing.beds} bd`;
  const bathLabel = listing.baths !== null ? `${listing.baths} ba` : null;

  return (
    <motion.div {...scaleOnHover}>
      <Link href={`/listing/${listing.id}`} className="block">
        <Card className="relative overflow-hidden p-0 gap-0">
          {/* Photo or gradient placeholder */}
          {listing.photoUrl ? (
            <div className="relative aspect-[4/3] bg-[var(--surface-100)]">
              <Image
                src={listing.photoUrl}
                alt={listing.title}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              {listing.source === 'sublease' ? (
                <Badge
                  className="absolute bottom-2 left-2 bg-[var(--primary-600)] text-white text-xs border-none"
                >
                  Student Sublease
                </Badge>
              ) : listing.source ? (
                <Badge
                  variant="outline"
                  className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm text-xs capitalize"
                >
                  {listing.source}
                </Badge>
              ) : null}
            </div>
          ) : (
            <div
              className={`relative aspect-[4/3] bg-gradient-to-br ${gradientForId(listing.id)} flex items-center justify-center`}
            >
              <span className="text-white/60 text-sm">No photo</span>
            </div>
          )}

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
                {bathLabel && (
                  <span className="flex items-center gap-1">
                    <Bath className="size-3.5" />
                    {bathLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Title */}
            <h3 className="text-sm font-medium text-foreground leading-snug truncate">
              {listing.title}
            </h3>

            {/* Address & Walk Score */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1 truncate mr-2">
                <MapPin className="size-3 shrink-0" />
                {listing.address}
              </span>
              {listing.walkScore !== null && (
                <span className="flex items-center gap-1 shrink-0">
                  <Footprints className="size-3 text-[var(--secondary-500)]" />
                  {listing.walkScore}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
