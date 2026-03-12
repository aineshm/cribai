'use client';

import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { fadeIn } from '@/lib/animations';
import type { Listing } from '@/lib/mock-listings';

interface MapPanelProps {
  readonly listings: readonly Listing[];
}

/** Predefined positions for mock price markers (percentage-based) */
const markerPositions = [
  { top: '18%', left: '25%' },
  { top: '32%', left: '62%' },
  { top: '48%', left: '38%' },
  { top: '22%', left: '78%' },
  { top: '65%', left: '52%' },
  { top: '55%', left: '20%' },
  { top: '40%', left: '48%' },
  { top: '72%', left: '70%' },
  { top: '28%', left: '42%' },
  { top: '58%', left: '82%' },
] as const;

export function MapPanel({ listings }: MapPanelProps) {
  return (
    <motion.div
      variants={fadeIn}
      initial="initial"
      animate="animate"
      className="relative h-full min-h-[400px] rounded-xl overflow-hidden bg-[var(--surface-100)] border border-[var(--surface-200)]"
    >
      {/* Grid pattern background */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(var(--surface-300) 1px, transparent 1px), linear-gradient(90deg, var(--surface-300) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Map placeholder label */}
      <div className="absolute top-4 left-4 flex items-center gap-2 text-sm text-muted-foreground bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-[var(--surface-200)]">
        <MapPin className="size-4 text-[var(--primary-700)]" />
        <span>Map integration coming in v1.2</span>
      </div>

      {/* Price marker pins */}
      {listings.slice(0, markerPositions.length).map((listing, index) => {
        const pos = markerPositions[index] as { top: string; left: string };
        return (
          <motion.div
            key={listing.id}
            className="absolute z-10 cursor-pointer"
            style={{ top: pos.top, left: pos.left }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 + index * 0.08, type: 'spring', stiffness: 400, damping: 20 }}
          >
            <div className="bg-[var(--primary-700)] text-white text-xs font-semibold px-2 py-1 rounded-lg shadow-md whitespace-nowrap">
              ${listing.price.toLocaleString()}
            </div>
            {/* Pin tail */}
            <div className="w-0 h-0 mx-auto border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[var(--primary-700)]" />
          </motion.div>
        );
      })}

      {/* Center campus marker */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
        <div className="flex flex-col items-center gap-1">
          <div className="bg-[var(--secondary-500)] text-[var(--secondary-foreground)] text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md">
            UW-Madison
          </div>
          <div className="w-3 h-3 rounded-full bg-[var(--secondary-500)] border-2 border-white shadow-md" />
        </div>
      </div>
    </motion.div>
  );
}
