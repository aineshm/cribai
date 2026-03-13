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
      <motion.div className="space-y-3" variants={staggerItem}>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)]">
          {listing.title}
        </h1>

        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <MapPin className="size-4 shrink-0" />
          <span>{listing.address}</span>
        </div>

        {/* Beds / Baths / Sqft */}
        <div className="flex items-center gap-4 text-sm text-foreground">
          {listing.beds !== null && (
            <div className="flex items-center gap-1.5">
              <Bed className="size-4 text-muted-foreground" />
              <span>
                {listing.beds === 0 ? 'Studio' : `${listing.beds} bed${listing.beds !== 1 ? 's' : ''}`}
              </span>
            </div>
          )}
          {listing.baths !== null && (
            <div className="flex items-center gap-1.5">
              <Bath className="size-4 text-muted-foreground" />
              <span>
                {listing.baths} bath{listing.baths !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {listing.sqft !== null && (
            <div className="flex items-center gap-1.5">
              <Maximize className="size-4 text-muted-foreground" />
              <span>{listing.sqft.toLocaleString()} sqft</span>
            </div>
          )}
        </div>

        {/* Mobile price */}
        <div className="md:hidden">
          <span className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">
            ${listing.price.toLocaleString()}
          </span>
          <span className="text-muted-foreground text-sm">/month</span>
        </div>

        {/* Source + available date badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {listing.source}
          </Badge>
          {listing.availableDate && (
            <Badge variant="outline" className="gap-1">
              <Calendar className="size-3" />
              Available {listing.availableDate}
            </Badge>
          )}
          {listing.fairnessScore !== null && (
            <Badge variant="outline" className="gap-1">
              Fairness: {listing.fairnessScore}/10
            </Badge>
          )}
        </div>
      </motion.div>

      <Separator />

      {/* Description */}
      <motion.div className="space-y-3" variants={staggerItem}>
        <SectionHeading>About This Place</SectionHeading>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {listing.description}
        </p>
      </motion.div>

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
          <div className="space-y-3">
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
            <Card className="border-[var(--primary-200)] bg-[var(--primary-50)]/30">
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
            <Card className="border-[var(--secondary-200)] bg-[var(--secondary-50)]/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-[var(--secondary-700)]">
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
      <motion.div className="space-y-3" variants={staggerItem}>
        <SectionHeading>Contact & Source</SectionHeading>
        <div className="flex flex-wrap gap-3">
          {listing.buildingPhone && (
            <a
              href={`tel:${listing.buildingPhone}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary-700)] text-white text-sm hover:bg-[var(--primary-800)] transition-colors"
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--surface-300)] text-sm text-foreground hover:bg-[var(--surface-50)] transition-colors"
            >
              <ExternalLink className="size-4" />
              View on {listing.source}
            </a>
          )}
        </div>
      </motion.div>

      {/* Spacer for mobile bottom bar */}
      <div className="h-20 md:hidden" />
    </motion.div>
  );
}

function SectionHeading({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <h2 className="text-lg font-semibold text-foreground font-[family-name:var(--font-display)]">
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
    <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]">
      <Icon className={`size-5 ${color}`} />
      <span className={`text-xl font-bold ${color}`}>{score}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
