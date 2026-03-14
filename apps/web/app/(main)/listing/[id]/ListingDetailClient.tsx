'use client';

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pageTransition } from '@/lib/animations';
import { PhotoGallery } from '@/components/listing/PhotoGallery';
import { ListingContent } from '@/components/listing/ListingContent';
import { CTASidebar } from '@/components/listing/CTASidebar';
import { MobileBottomBar } from '@/components/listing/MobileBottomBar';
import type { ListingDetail } from '@/lib/listing-types';

interface ListingDetailClientProps {
  readonly listing: ListingDetail;
}

export function ListingDetailClient({ listing }: ListingDetailClientProps) {
  return (
    <motion.div
      className="min-h-screen bg-background"
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Top Nav Bar */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-[var(--surface-200)]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
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

      <div className="max-w-6xl mx-auto px-4 py-6">
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

        {/* Two-Column Layout */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-[1fr_340px] lg:grid-cols-[1fr_380px] gap-8">
          {/* Left Column — Content */}
          <ListingContent listing={listing} />

          {/* Right Column — CTA Sidebar (desktop only) */}
          <div className="hidden md:block">
            <CTASidebar price={listing.price} listingTitle={listing.title} listingId={listing.id} />
          </div>
        </div>
      </div>

      {/* Mobile Bottom Bar */}
      <MobileBottomBar price={listing.price} listingTitle={listing.title} listingId={listing.id} />
    </motion.div>
  );
}
