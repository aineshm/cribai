'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Bed, Bath, MapPin, Footprints, Home, Sparkles } from 'lucide-react';
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
  const sourceLabel = listing.source === 'sublease'
    ? 'Student sublease'
    : listing.source
      ? listing.source
      : null;

  return (
    <motion.div {...scaleOnHover}>
      <Link href={`/listing/${listing.id}`} className="block">
        <Card className="group relative overflow-hidden gap-0 rounded-[1.75rem] border border-[var(--surface-200)] bg-white p-0 shadow-[0_14px_36px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_22px_54px_rgba(15,118,110,0.14)]">
          {/* Photo or gradient placeholder */}
          {listing.photoUrl ? (
            <div className="relative aspect-[4/3] bg-[var(--surface-100)]">
              <Image
                src={listing.photoUrl}
                alt={listing.title}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0)_32%,rgba(15,23,42,0.18)_100%)]" />
            </div>
          ) : (
            <div
              className={`relative aspect-[4/3] bg-gradient-to-br ${gradientForId(listing.id)} flex items-center justify-center gap-2`}
            >
              <Home className="size-4 text-white/60" />
              <span className="text-white/60 text-sm">No photos yet</span>
            </div>
          )}

          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
            {listing.source === 'sublease' && (
              <Badge className="border-none bg-white/92 text-teal-800 shadow-sm backdrop-blur-sm">
                <Sparkles className="mr-1 size-3 text-amber-500" />
                Student sublease
              </Badge>
            )}
            {listing.walkScore !== null && (
              <Badge
                variant="outline"
                className="border-white/50 bg-white/82 text-[var(--surface-700)] backdrop-blur-sm"
              >
                <Footprints className="mr-1 size-3 text-teal-700" />
                Walk {listing.walkScore}
              </Badge>
            )}
          </div>

          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                  CribAI match
                </p>
                <h3 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-[var(--surface-900)]">
                  {listing.title}
                </h3>
              </div>
              <span className="shrink-0 text-xl font-bold text-[var(--surface-900)]">
                ${listing.price.toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground">
                  /mo
                </span>
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-sm text-[var(--surface-500)]">
              <MapPin className="size-3.5 shrink-0 text-teal-700" />
              <span className="truncate">{listing.address}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-50)] px-3 py-1.5 font-medium text-[var(--surface-700)]">
                <Bed className="size-3.5 text-teal-700" />
                {bedLabel}
              </span>
              {bathLabel && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-50)] px-3 py-1.5 font-medium text-[var(--surface-700)]">
                  <Bath className="size-3.5 text-teal-700" />
                  {bathLabel}
                </span>
              )}
              {sourceLabel && listing.source !== 'sublease' && (
                <span className="inline-flex rounded-full bg-amber-50 px-3 py-1.5 font-medium capitalize text-amber-800">
                  {sourceLabel}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[var(--surface-200)] pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 truncate pr-3">
                <MapPin className="size-3 shrink-0" />
                View full details
              </span>
              {listing.walkScore !== null && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 font-medium text-teal-800">
                  <Footprints className="size-3 text-amber-500" />
                  Walk score {listing.walkScore}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
