'use client';

import { useState } from 'react';
import { ListingCard } from './listing-card';

interface ListingData {
  readonly id: string;
  readonly address: string;
  readonly rent_monthly: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly fairness_score: number | null;
  readonly true_cost_total: number | null;
  readonly amenities: readonly string[];
  readonly photo_urls: readonly string[];
  readonly source_url: string | null;
  readonly last_seen_at: string | null;
  readonly is_active: boolean;
}

interface StaleSectionProps {
  readonly listings: readonly ListingData[];
  readonly campusSlug: string;
  readonly savedListingIds?: ReadonlySet<string>;
}

export function StaleSection({ listings, campusSlug, savedListingIds }: StaleSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (listings.length === 0) return null;

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 text-sm font-medium text-[var(--surface-500)] hover:text-[var(--surface-700)] transition-colors"
      >
        <span
          className="inline-block transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          &#9654;
        </span>
        Possibly outdated ({listings.length})
      </button>

      {isOpen && (
        <div className="mt-4 opacity-70 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing, index) => (
            <div
              key={listing.id}
              className="stagger-item"
              style={{ '--stagger-index': index } as React.CSSProperties}
            >
              <ListingCard listing={listing} campusSlug={campusSlug} isSaved={savedListingIds?.has(listing.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
