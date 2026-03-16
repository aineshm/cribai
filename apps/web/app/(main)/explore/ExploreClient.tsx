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
      className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f7faf9_100%)]"
      variants={pageTransition}
      initial="initial"
      animate="animate"
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="space-y-6">
            <section className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#0f766e_0%,#115e59_46%,#f59e0b_160%)] px-6 py-8 text-white shadow-[0_24px_70px_rgba(15,118,110,0.22)] sm:px-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_32%)]" />
              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-sm font-medium backdrop-blur">
                    <Send className="size-4 text-amber-300" />
                    CampusNest Discovery
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                      Find your perfect off-campus home
                    </h1>
                    <p className="max-w-xl text-sm leading-7 text-white/80 sm:text-base">
                      Browse verified listings, filter fast, and use AI when the normal
                      search UI stops being enough.
                    </p>
                  </div>
                </div>

                <div className="rounded-[1.5rem] bg-white/95 p-4 text-[var(--surface-800)] shadow-xl backdrop-blur sm:max-w-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
                    Live context
                  </p>
                  <p className="mt-2 text-sm leading-6">
                    {filteredListings.length} matches after filters. Summer subleases, pet-friendly
                    spots, and walkable options surface first.
                  </p>
                </div>
              </div>
            </section>

            <Link
              href="/post"
              className="flex items-center justify-between gap-3 rounded-[1.5rem] border border-teal-100 bg-teal-50 px-5 py-4 text-sm text-teal-900 shadow-sm transition-colors hover:bg-teal-100"
            >
              <span className="flex items-center gap-2">
                <Send className="size-4" />
                <span>
                  <span className="font-semibold">Have a summer sublease?</span>{' '}
                  Post it free and reach verified students.
                </span>
              </span>
              <span className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-teal-700 sm:inline">
                Post now
              </span>
            </Link>

            <div className="rounded-[1.75rem] border border-[var(--surface-200)] bg-white px-4 py-4 shadow-[0_16px_40px_rgba(0,0,0,0.04)] sm:px-5">
              <FilterChips
                resultCount={filteredListings.length}
                filters={filters}
                onFiltersChange={setFilters}
              />
            </div>

            <ExploreLayout listings={filteredListings} />
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-[1.75rem] border border-[var(--surface-200)] bg-white p-5 shadow-[0_16px_40px_rgba(0,0,0,0.05)]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
                Ask AI when you get stuck
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-[var(--surface-900)]">
                Let CampusNest narrow it down.
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--surface-600)]">
                Ask for quieter buildings, cat-friendly leases, sublease-only options, or better
                value near a specific campus building.
              </p>
              <div className="mt-5 space-y-2 text-sm text-[var(--surface-600)]">
                <div className="rounded-2xl bg-[var(--surface-50)] px-4 py-3">
                  “Find the quietest 2-bed near Engineering under $1,200.”
                </div>
                <div className="rounded-2xl bg-[var(--surface-50)] px-4 py-3">
                  “Which of these has the best landlord reviews?”
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <AIChatButton />
    </motion.div>
  );
}
