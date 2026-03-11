'use client';

import { motion } from 'framer-motion';
import { MapPin, Footprints, Bike, Bus } from 'lucide-react';
import { staggerItem } from '@/lib/animations';
import type { CommuteDistance } from '@/lib/mock-listing-detail';

interface CommuteSectionProps {
  readonly commuteDistances: readonly CommuteDistance[];
}

export function CommuteSection({ commuteDistances }: CommuteSectionProps) {
  return (
    <motion.div className="space-y-4" variants={staggerItem}>
      {/* Map Placeholder */}
      <div className="w-full h-48 rounded-xl bg-gradient-to-br from-[var(--primary-100)] to-[var(--primary-200)] flex items-center justify-center border border-[var(--surface-200)]">
        <div className="text-center">
          <MapPin className="size-8 text-[var(--primary-700)] mx-auto mb-2" />
          <p className="text-sm text-[var(--primary-700)] font-medium">
            Campus Map
          </p>
          <p className="text-xs text-muted-foreground">
            Interactive map coming soon
          </p>
        </div>
      </div>

      {/* Commute Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-200)]">
              <th className="text-left py-2 pr-4 font-medium text-foreground">
                Building
              </th>
              <th className="py-2 px-3 font-medium text-foreground">
                <div className="flex items-center justify-center gap-1.5">
                  <Footprints className="size-4" />
                  <span className="sr-only sm:not-sr-only sm:inline">Walk</span>
                </div>
              </th>
              <th className="py-2 px-3 font-medium text-foreground">
                <div className="flex items-center justify-center gap-1.5">
                  <Bike className="size-4" />
                  <span className="sr-only sm:not-sr-only sm:inline">Bike</span>
                </div>
              </th>
              <th className="py-2 px-3 font-medium text-foreground">
                <div className="flex items-center justify-center gap-1.5">
                  <Bus className="size-4" />
                  <span className="sr-only sm:not-sr-only sm:inline">Bus</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {commuteDistances.map((commute) => (
              <tr
                key={commute.building}
                className="border-b border-[var(--surface-100)]"
              >
                <td className="py-2.5 pr-4 text-foreground">
                  {commute.building}
                </td>
                <td className="py-2.5 px-3 text-center text-muted-foreground">
                  {commute.walkMin} min
                </td>
                <td className="py-2.5 px-3 text-center text-muted-foreground">
                  {commute.bikeMin} min
                </td>
                <td className="py-2.5 px-3 text-center text-muted-foreground">
                  {commute.busMin} min
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
