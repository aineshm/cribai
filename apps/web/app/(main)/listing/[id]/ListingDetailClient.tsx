'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pageTransition } from '@/lib/animations';
import { PhotoGallery } from '@/components/listing/PhotoGallery';
import { ListingContent } from '@/components/listing/ListingContent';
import { CTASidebar } from '@/components/listing/CTASidebar';
import { MobileBottomBar } from '@/components/listing/MobileBottomBar';
import { ListingViewStats } from '@/components/listing/ListingViewStats';
import { PostedByBadge } from '@/components/listing/PostedByBadge';
import { EditListingForm } from '@/components/listing/EditListingForm';
import { ListingMap } from '@/components/listing/ListingMap';
import { trackEvent } from '@/lib/track-event';
import type { ListingDetail } from '@/lib/listing-types';

interface ListingDetailClientProps {
  readonly listing: ListingDetail;
  readonly campusSlug?: string;
  readonly isCreatorOrAdmin?: boolean;
  readonly currentUserId?: string | null;
  readonly creatorName?: string | null;
}

export function ListingDetailClient({
  listing: initialListing,
  campusSlug,
  isCreatorOrAdmin = false,
  currentUserId = null,
  creatorName = null,
}: ListingDetailClientProps) {
  const [listing, setListing] = useState(initialListing);

  // Track listing view once per mount (dedup with ref to survive StrictMode double-mount)
  const hasTracked = useRef(false);
  useEffect(() => {
    if (hasTracked.current) return;
    hasTracked.current = true;
    trackEvent('listing_viewed', { listing_id: listing.id });
  }, [listing.id]);

  const handleListingUpdated = useCallback((updated: Partial<ListingDetail>) => {
    setListing(prev => ({ ...prev, ...updated }));
  }, []);

  return (
    <motion.div
      className="min-h-screen bg-[linear-gradient(180deg,#f7faf9_0%,#ffffff_26%)]"
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Top Nav Bar */}
      <div className="sticky top-0 z-30 border-b border-[var(--surface-200)] bg-white/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => window.history.back()}
            aria-label="Go back"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <span className="text-sm font-medium text-foreground truncate">
            {listing.title}
          </span>
        </div>
      </div>

      {/* View stats banner — only renders for listing creator */}
      <ListingViewStats listingId={listing.id} />

      <div className="mx-auto max-w-6xl px-4 py-6 lg:py-8">
        {/* Posted by attribution + Creator edit controls */}
        <div className="mb-4 space-y-3">
          <PostedByBadge source={listing.source} creatorName={creatorName} />

          {isCreatorOrAdmin && currentUserId && (
            <EditListingForm
              listing={listing}
              userId={currentUserId}
              onListingUpdated={handleListingUpdated}
            />
          )}
        </div>

        {/* Photo Gallery */}
        {listing.photoUrls.length > 0 && (
          <PhotoGallery
            photos={listing.photoUrls.map((url, i) => ({
              id: `photo-${i}`,
              gradient: '',
              alt: `${listing.title} photo ${i + 1}`,
              url,
            }))}
          />
        )}

        {/* Map */}
        {listing.latitude != null && listing.longitude != null && (
          <div className="mt-6">
            <ListingMap
              latitude={listing.latitude}
              longitude={listing.longitude}
              address={listing.address}
              price={listing.price}
            />
          </div>
        )}

        {/* Two-Column Layout */}
        <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-[1fr_340px] lg:grid-cols-[1fr_380px]">
          {/* Left Column — Content */}
          <ListingContent listing={listing} />

          {/* Right Column — CTA Sidebar (desktop only) */}
          <div className="hidden md:block">
            <CTASidebar
              price={listing.price}
              listingTitle={listing.title}
              listingAddress={listing.address}
              listingId={listing.id}
              campusSlug={campusSlug}
            />
          </div>
        </div>
      </div>

      {/* Mobile Bottom Bar */}
      <MobileBottomBar
        price={listing.price}
        listingTitle={listing.title}
        listingAddress={listing.address}
        listingId={listing.id}
        campusSlug={campusSlug}
      />
    </motion.div>
  );
}
