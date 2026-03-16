'use client';

import { motion } from 'framer-motion';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { ListingCard } from './ListingCard';
import type { ExploreListing } from '@/lib/listing-types';

interface ListingGridProps {
  readonly listings: readonly ExploreListing[];
}

export function ListingGrid({ listings }: ListingGridProps) {
  if (listings.length === 0) {
    return (
      <div className="rounded-[1.75rem] border border-dashed border-[var(--surface-300)] bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
          No direct matches
        </p>
        <h3 className="mt-3 text-2xl font-semibold text-[var(--surface-900)]">
          Your filters are too tight.
        </h3>
        <p className="mt-3 text-sm leading-7 text-[var(--surface-600)]">
          Clear a few filters or ask CampusNest AI for a broader set of options.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      className="grid grid-cols-1 gap-5 sm:grid-cols-2"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {listings.map((listing) => (
        <motion.div key={listing.id} variants={staggerItem}>
          <ListingCard listing={listing} />
        </motion.div>
      ))}
    </motion.div>
  );
}
