'use client';

import { motion } from 'framer-motion';
import {
  Bed,
  Bath,
  Maximize,
  MapPin,
  Footprints,
  Bike,
  Bus,
  Calendar,
  Phone,
  ExternalLink,
  Tag,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { AmenitiesGrid } from './AmenitiesGrid';
import type { ListingDetail } from '@/lib/listing-types';

interface ListingContentProps {
  readonly listing: ListingDetail;
}

export function ListingContent({ listing }: ListingContentProps) {
  const hasScores =
    listing.walkScore !== null ||
    listing.bikeScore !== null ||
    listing.transitScore !== null;

  return (
    <motion.div
      className="space-y-8"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Title & Quick Info */}
      <motion.div
        className="rounded-[1.75rem] border border-[var(--surface-200)] bg-white p-6 shadow-[0_16px_36px_rgba(15,23,42,0.05)]"
        variants={staggerItem}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
          CampusNest listing
        </p>
        <h1 className="mt-3 text-2xl font-bold text-foreground font-[family-name:var(--font-display)] md:text-3xl">
          {listing.title}
        </h1>

        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" />
          <span>{listing.address}</span>
        </div>

        {/* Beds / Baths / Sqft */}
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-foreground">
          {listing.beds !== null && (
            <div className="flex items-center gap-1.5 rounded-full bg-[var(--surface-50)] px-3 py-2">
              <Bed className="size-4 text-teal-700" />
              <span>
                {listing.beds === 0 ? 'Studio' : `${listing.beds} bed${listing.beds !== 1 ? 's' : ''}`}
              </span>
            </div>
          )}
          {listing.baths !== null && (
            <div className="flex items-center gap-1.5 rounded-full bg-[var(--surface-50)] px-3 py-2">
              <Bath className="size-4 text-teal-700" />
              <span>
                {listing.baths} bath{listing.baths !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {listing.sqft !== null && (
            <div className="flex items-center gap-1.5 rounded-full bg-[var(--surface-50)] px-3 py-2">
              <Maximize className="size-4 text-teal-700" />
              <span>{listing.sqft.toLocaleString()} sqft</span>
            </div>
          )}
        </div>

        {/* Mobile price */}
        <div className="mt-5 md:hidden">
          <span className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">
            ${listing.price.toLocaleString()}
          </span>
          <span className="text-muted-foreground text-sm">/month</span>
        </div>

        {/* Source + available date badges */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="capitalize border-teal-200 bg-teal-50 text-teal-800">
            {listing.source}
          </Badge>
          {listing.availableDate && (
            <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-800">
              <Calendar className="size-3" />
              Available {listing.availableDate}
            </Badge>
          )}
          {listing.fairnessScore !== null && (
            <Badge variant="outline" className="gap-1 border-[var(--surface-200)] bg-white">
              Fairness: {listing.fairnessScore}/10
            </Badge>
          )}
        </div>
      </motion.div>

      {/* Description — hidden when empty or just an address restatement */}
      {listing.description && listing.description.length > 50 && (
        <>
          <Separator />
          <motion.div className="space-y-3 rounded-[1.75rem] border border-[var(--surface-200)] bg-white p-6 shadow-[0_14px_34px_rgba(15,23,42,0.04)]" variants={staggerItem}>
            <SectionHeading>About This Place</SectionHeading>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {listing.description}
            </p>
          </motion.div>
        </>
      )}

      {/* Walk / Bike / Transit Scores */}
      {hasScores && (
        <>
          <Separator />
          <motion.div className="space-y-3" variants={staggerItem}>
            <SectionHeading>Location Scores</SectionHeading>
            <div className="grid grid-cols-3 gap-3">
              {listing.walkScore !== null && (
                <ScoreCard icon={Footprints} label="Walk Score" score={listing.walkScore} />
              )}
              {listing.bikeScore !== null && (
                <ScoreCard icon={Bike} label="Bike Score" score={listing.bikeScore} />
              )}
              {listing.transitScore !== null && (
                <ScoreCard icon={Bus} label="Transit Score" score={listing.transitScore} />
              )}
            </div>
          </motion.div>
        </>
      )}

      {/* Amenities */}
      {listing.amenities.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3 rounded-[1.75rem] border border-[var(--surface-200)] bg-white p-6 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
            <SectionHeading>Amenities</SectionHeading>
            <AmenitiesGrid amenities={listing.amenities} />
          </div>
        </>
      )}

      {/* Lease Term */}
      {listing.leaseTerm && (
        <>
          <Separator />
          <motion.div className="space-y-3" variants={staggerItem}>
            <SectionHeading>Lease Details</SectionHeading>
            <Card className="rounded-[1.5rem] border-teal-100 bg-teal-50/80">
              <CardContent className="p-4">
                <p className="text-sm text-foreground">
                  <span className="font-medium">Lease Term:</span> {listing.leaseTerm}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}

      {/* Special Offers */}
      {listing.specialOffers.length > 0 && (
        <>
          <Separator />
          <motion.div className="space-y-3" variants={staggerItem}>
            <SectionHeading>Special Offers</SectionHeading>
            <Card className="rounded-[1.5rem] border-amber-100 bg-amber-50/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-amber-800">
                  <Tag className="size-4" />
                  Current Promotions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {listing.specialOffers.map((offer, i) => (
                  <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                    {offer}
                  </p>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}


      {/* Contact & Source */}
      <Separator />
      <motion.div className="space-y-3 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm" variants={staggerItem}>
        <SectionHeading>Contact & Source</SectionHeading>
        <div className="flex flex-wrap gap-3">
          {listing.buildingPhone && (
            <a
              href={`tel:${listing.buildingPhone}`}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-2 text-sm text-white transition-colors hover:bg-teal-900"
            >
              <Phone className="size-4" />
              {listing.buildingPhone}
            </a>
          )}
          {listing.sourceUrl && (
            <a
              href={listing.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--surface-300)] px-4 py-2 text-sm text-foreground transition-colors hover:bg-[var(--surface-50)]"
            >
              <ExternalLink className="size-4" />
              View on {listing.source}
            </a>
          )}
        </div>
      </motion.div>

      {/* Spacer for mobile bottom bar */}
      <div className="h-[calc(5rem+var(--safe-area-bottom))] md:hidden" />
    </motion.div>
  );
}

function SectionHeading({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground">
      {children}
    </h2>
  );
}

function ScoreCard({
  icon: Icon,
  label,
  score,
}: {
  readonly icon: React.ElementType;
  readonly label: string;
  readonly score: number;
}) {
  const color =
    score >= 70
      ? 'text-[var(--fair-good)]'
      : score >= 50
        ? 'text-[var(--secondary-500)]'
        : 'text-muted-foreground';

  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[1.25rem] border border-[var(--surface-200)] bg-[var(--surface-50)] p-4">
      <Icon className={`size-5 ${color}`} />
      <span className={`text-xl font-bold ${color}`}>{score}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
