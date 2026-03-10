'use client';

import { motion } from 'framer-motion';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { ListingCard } from './ListingCard';
import type { Listing } from '@/lib/mock-listings';

interface ListingGridProps {
  readonly listings: readonly Listing[];
}

export function ListingGrid({ listings }: ListingGridProps) {
  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
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
