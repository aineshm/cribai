'use client';

import { Heart, MapPin, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { staggerContainer, staggerItem } from '@/lib/animations';

interface SavedListing {
  readonly id: string;
  readonly title: string;
  readonly address: string;
  readonly price: number;
  readonly imageUrl?: string;
}

interface SavedListingsProps {
  readonly listings?: ReadonlyArray<SavedListing>;
}

// Demo data for UI display
const DEMO_LISTINGS: ReadonlyArray<SavedListing> = [
  {
    id: '1',
    title: 'Cozy Studio near Campus',
    address: '123 College Ave',
    price: 950,
  },
  {
    id: '2',
    title: 'Spacious 2BR Apartment',
    address: '456 University Blvd',
    price: 1400,
  },
  {
    id: '3',
    title: 'Modern Room in Shared House',
    address: '789 Oak St',
    price: 750,
  },
];

export function SavedListings({ listings }: SavedListingsProps) {
  const items = listings ?? DEMO_LISTINGS;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-muted">
          <Heart className="size-7 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-foreground">
          No saved listings yet
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Listings you save will appear here for easy access.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {items.map((listing) => (
        <motion.div key={listing.id} variants={staggerItem}>
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            {/* Image placeholder */}
            <div className="flex h-36 items-center justify-center bg-muted">
              <MapPin className="size-8 text-muted-foreground/30" />
            </div>
            <CardContent className="space-y-2 pt-3">
              <h4 className="text-sm font-semibold text-foreground line-clamp-1">
                {listing.title}
              </h4>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" />
                {listing.address}
              </p>
              <p className="flex items-center gap-1 text-sm font-bold text-primary">
                <DollarSign className="size-3.5" />
                {listing.price}/mo
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
