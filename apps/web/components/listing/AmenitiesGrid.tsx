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
  type LucideIcon,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '@/lib/animations';
import type { AmenityItem } from '@/lib/mock-listing-detail';

const ICON_MAP: Record<string, LucideIcon> = {
  WashingMachine,
  AirVent,
  Utensils,
  Wifi,
  Dumbbell,
  Waves,
  PawPrint,
  Car,
  BookOpen,
  Package,
  Bike,
  Zap,
};

interface AmenitiesGridProps {
  readonly amenities: readonly AmenityItem[];
}

export function AmenitiesGrid({ amenities }: AmenitiesGridProps) {
  return (
    <motion.div
      className="grid grid-cols-2 sm:grid-cols-3 gap-3"
      variants={staggerContainer}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, margin: '-50px' }}
    >
      {amenities.map((amenity) => {
        const Icon = ICON_MAP[amenity.icon];
        return (
          <motion.div
            key={amenity.name}
            className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]"
            variants={staggerItem}
          >
            {Icon ? (
              <Icon className="size-5 text-[var(--primary-700)] shrink-0" />
            ) : (
              <div className="size-5 rounded bg-[var(--primary-100)] shrink-0" />
            )}
            <span className="text-sm text-foreground">{amenity.name}</span>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
