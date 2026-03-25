'use client';

import { motion } from 'framer-motion';
import {
  Wifi,
  Car,
  Dumbbell,
  Waves,
  PawPrint,
  BookOpen,
  Package,
  Bike,
  Zap,
  AirVent,
  Utensils,
  WashingMachine,
  Sofa,
  Snowflake,
  type LucideIcon,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '@/lib/animations';

/** Maps amenity keywords to icons for display */
const KEYWORD_ICON_MAP: ReadonlyArray<readonly [string, LucideIcon]> = [
  ['laundry', WashingMachine],
  ['washer', WashingMachine],
  ['dryer', WashingMachine],
  ['ac', AirVent],
  ['air conditioning', AirVent],
  ['heating', Snowflake],
  ['dishwasher', Utensils],
  ['wifi', Wifi],
  ['internet', Wifi],
  ['gym', Dumbbell],
  ['fitness', Dumbbell],
  ['pool', Waves],
  ['cat', PawPrint],
  ['dog', PawPrint],
  ['pet', PawPrint],
  ['parking', Car],
  ['garage', Car],
  ['study', BookOpen],
  ['lounge', BookOpen],
  ['package', Package],
  ['locker', Package],
  ['bike', Bike],
  ['ev', Zap],
  ['furnished', Sofa],
] as const;

function iconForAmenity(name: string): LucideIcon | null {
  const lower = name.toLowerCase();
  for (const [keyword, icon] of KEYWORD_ICON_MAP) {
    if (lower.includes(keyword)) return icon;
  }
  return null;
}

/** Known raw keys → human-readable display labels */
const LABEL_MAP: Record<string, string> = {
  'w/d_in_unit': 'Washer/Dryer In Unit',
  'w/d in unit': 'Washer/Dryer In Unit',
  'off-street_parking': 'Off-Street Parking',
  'off_street_parking': 'Off-Street Parking',
  'cats_are_ok_-_purrr': 'Cats OK',
  'cats_are_ok': 'Cats OK',
  'dogs_are_ok_-_wooof': 'Dogs OK',
  'no_smoking': 'No Smoking',
  'rent_period:': 'Rent Period',
  'rent_period': 'Rent Period',
  'furnished': 'Furnished',
  'ev_charging': 'EV Charging',
  'air_conditioning': 'Air Conditioning',
  'in_unit_laundry': 'In-Unit Laundry',
  'street_parking': 'Street Parking',
  'wheelchair_accessible': 'Wheelchair Accessible',
};

function formatAmenityLabel(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (LABEL_MAP[lower]) return LABEL_MAP[lower];
  // Fallback: replace underscores/hyphens with spaces, title case
  return raw
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

interface AmenitiesGridProps {
  readonly amenities: readonly string[];
}

export function AmenitiesGrid({ amenities }: AmenitiesGridProps) {
  return (
    <motion.div
      className="grid grid-cols-2 sm:grid-cols-3 gap-3"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {amenities.map((name) => {
        const Icon = iconForAmenity(name);
        return (
          <motion.div
            key={name}
            className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]"
            variants={staggerItem}
          >
            {Icon ? (
              <Icon className="size-5 text-[var(--primary-700)] shrink-0" />
            ) : (
              <div className="size-5 rounded bg-[var(--primary-100)] shrink-0" />
            )}
            <span className="text-sm text-foreground">{formatAmenityLabel(name)}</span>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
