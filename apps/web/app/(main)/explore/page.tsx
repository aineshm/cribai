'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ExploreLayout } from '@/components/explore/ExploreLayout';
import { FilterChips } from '@/components/explore/FilterChips';
import { mockListings } from '@/lib/mock-listings';
import { pageTransition } from '@/lib/animations';
import { filterListings, type ActiveFilters } from '@/lib/filter-listings';
import { AIChatButton } from '@/components/chat/AIChatButton';
import { AIChatPanel } from '@/components/chat/AIChatPanel';

export default function ExplorePage() {
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(new Set());

  const filteredListings = useMemo(
    () => filterListings(mockListings, activeFilters),
    [activeFilters]
  );

  return (
    <motion.div
      className="min-h-screen bg-background"
      variants={pageTransition}
      initial="initial"
      animate="animate"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">
            Explore Apartments
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Find your perfect off-campus home
          </p>
        </div>

        {/* Filters */}
        <FilterChips
          resultCount={filteredListings.length}
          activeFilters={activeFilters}
          onFiltersChange={setActiveFilters}
        />

        {/* Main content: split layout */}
        <ExploreLayout listings={filteredListings} />
      </div>
      <AIChatButton />
      <AIChatPanel />
    </motion.div>
  );
}
