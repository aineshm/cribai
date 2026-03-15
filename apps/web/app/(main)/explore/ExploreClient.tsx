'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { ExploreLayout } from '@/components/explore/ExploreLayout';
import { FilterChips } from '@/components/explore/FilterChips';
import { pageTransition } from '@/lib/animations';
import { filterListings, DEFAULT_FILTERS, type FilterValues } from '@/lib/filter-listings';
import { AIChatButton } from '@/components/chat/AIChatButton';
import { AIChatPanel } from '@/components/chat/AIChatPanel';
import type { ExploreListing } from '@/lib/listing-types';

interface ExploreClientProps {
  readonly listings: readonly ExploreListing[];
}

export function ExploreClient({ listings }: ExploreClientProps) {
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);

  const filteredListings = useMemo(
    () => filterListings(listings, filters),
    [listings, filters]
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

        {/* Sublease CTA banner */}
        <Link
          href="/post"
          className="flex items-center gap-2 rounded-lg bg-[var(--primary-50)] border border-[var(--primary-200)] px-4 py-3 text-sm text-[var(--primary-700)] hover:bg-[var(--primary-100)] transition-colors"
        >
          <Send className="size-4" />
          <span>
            <span className="font-medium">Have a summer sublease?</span>{' '}
            Post it free and reach verified students.
          </span>
        </Link>

        {/* Filters */}
        <FilterChips
          resultCount={filteredListings.length}
          filters={filters}
          onFiltersChange={setFilters}
        />

        {/* Main content: split layout */}
        <ExploreLayout listings={filteredListings} />
      </div>
      <AIChatButton />
      <AIChatPanel />
    </motion.div>
  );
}
