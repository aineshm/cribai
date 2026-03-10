'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign,
  Bed,
  MapPin,
  Calendar,
  PawPrint,
  Sofa,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { springConfig } from '@/lib/animations';

interface FilterDef {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ElementType;
}

const filters: readonly FilterDef[] = [
  { id: 'price', label: 'Price', icon: DollarSign },
  { id: 'beds', label: 'Beds', icon: Bed },
  { id: 'distance', label: 'Distance', icon: MapPin },
  { id: 'move-in', label: 'Move-in Date', icon: Calendar },
  { id: 'pets', label: 'Pet Friendly', icon: PawPrint },
  { id: 'furnished', label: 'Furnished', icon: Sofa },
] as const;

interface FilterChipsProps {
  readonly resultCount: number;
  readonly campusName?: string;
}

export function FilterChips({
  resultCount,
  campusName = 'UW-Madison',
}: FilterChipsProps) {
  const [activeFilters, setActiveFilters] = useState<ReadonlySet<string>>(
    new Set()
  );

  const toggleFilter = useCallback((filterId: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filterId)) {
        next.delete(filterId);
      } else {
        next.add(filterId);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-3">
      {/* Scrollable filter row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {filters.map((filter) => {
          const isActive = activeFilters.has(filter.id);
          const Icon = filter.icon;

          return (
            <motion.div
              key={filter.id}
              layout
              transition={springConfig.snappy}
            >
              <Button
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                className={`shrink-0 gap-1.5 rounded-full ${
                  isActive
                    ? 'bg-[var(--primary-700)] text-white hover:bg-[var(--primary-800)]'
                    : ''
                }`}
                onClick={() => toggleFilter(filter.id)}
              >
                <Icon className="size-3.5" />
                {filter.label}
                <AnimatePresence>
                  {isActive && (
                    <motion.span
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 'auto', opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={springConfig.snappy}
                    >
                      <X className="size-3" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </motion.div>
          );
        })}
      </div>

      {/* Result count */}
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{resultCount}</span>{' '}
        apartments near {campusName}
      </p>
    </div>
  );
}
