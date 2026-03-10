'use client';

import { motion } from 'framer-motion';
import { Bed, Bath, Maximize, MapPin } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { LandlordCard } from './LandlordCard';
import { AmenitiesGrid } from './AmenitiesGrid';
import { LeaseSummary } from './LeaseSummary';
import { CommuteSection } from './CommuteSection';
import { ReviewSection } from './ReviewSection';
import type { DetailedListing } from '@/lib/mock-listing-detail';

interface ListingContentProps {
  readonly listing: DetailedListing;
}

export function ListingContent({ listing }: ListingContentProps) {
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
          <div className="flex items-center gap-1.5">
            <Bed className="size-4 text-muted-foreground" />
            <span>
              {listing.beds} bed{listing.beds !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Bath className="size-4 text-muted-foreground" />
            <span>
              {listing.baths} bath{listing.baths !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Maximize className="size-4 text-muted-foreground" />
            <span>{listing.sqft.toLocaleString()} sqft</span>
          </div>
        </div>

        {/* Mobile price (shown on mobile, hidden on desktop where CTASidebar shows it) */}
        <div className="md:hidden">
          <span className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">
            ${listing.price.toLocaleString()}
          </span>
          <span className="text-muted-foreground text-sm">/month</span>
        </div>
      </motion.div>

      <Separator />

      {/* Landlord Card */}
      <div>
        <SectionHeading>Listed By</SectionHeading>
        <LandlordCard landlord={listing.landlord} />
      </div>

      <Separator />

      {/* Description */}
      <motion.div className="space-y-3" variants={staggerItem}>
        <SectionHeading>About This Place</SectionHeading>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {listing.description}
        </p>
      </motion.div>

      <Separator />

      {/* Amenities */}
      <div className="space-y-3">
        <SectionHeading>Amenities</SectionHeading>
        <AmenitiesGrid amenities={listing.amenities} />
      </div>

      <Separator />

      {/* Lease Summary */}
      <div className="space-y-3">
        <SectionHeading>Lease Details</SectionHeading>
        <LeaseSummary leaseSummary={listing.leaseSummary} />
      </div>

      <Separator />

      {/* Commute */}
      <div className="space-y-3">
        <SectionHeading>Commute to Campus</SectionHeading>
        <CommuteSection commuteDistances={listing.commuteDistances} />
      </div>

      <Separator />

      {/* Reviews */}
      <div className="space-y-3">
        <SectionHeading>Student Reviews</SectionHeading>
        <ReviewSection reviews={listing.reviews} />
      </div>

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
