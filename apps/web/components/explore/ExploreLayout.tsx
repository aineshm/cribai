'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ListingGrid } from './ListingGrid';
import { MapPanel } from './MapPanel';
import { ViewToggle, type ViewMode } from './ViewToggle';
import { fadeIn } from '@/lib/animations';
import type { ExploreListing } from '@/lib/listing-types';

interface ExploreLayoutProps {
  readonly listings: readonly ExploreListing[];
}

export function ExploreLayout({ listings }: ExploreLayoutProps) {
  const [mobileView, setMobileView] = useState<ViewMode>('list');

  return (
    <>
      {/* Mobile: segmented control + single view */}
      <div className="lg:hidden space-y-4">
        <div className="flex justify-center">
          <ViewToggle activeView={mobileView} onViewChange={setMobileView} />
        </div>

        <AnimatePresence mode="wait">
          {mobileView === 'list' ? (
            <motion.div
              key="list"
              variants={fadeIn}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <ListingGrid listings={listings} />
            </motion.div>
          ) : (
            <motion.div
              key="map"
              variants={fadeIn}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <MapPanel listings={listings} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Desktop: 60/40 split */}
      <div className="hidden lg:grid lg:grid-cols-[3fr_2fr] gap-6 h-[calc(100vh-220px)]">
        <div className="overflow-y-auto pr-2 scrollbar-hide">
          <ListingGrid listings={listings} />
        </div>
        <div className="sticky top-0">
          <MapPanel listings={listings} />
        </div>
      </div>
    </>
  );
}
