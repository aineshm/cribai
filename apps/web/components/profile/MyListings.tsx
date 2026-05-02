'use client';

import { Home, Eye, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface MyListingItem {
  readonly id: string;
  readonly address: string;
  readonly price: number;
  readonly beds: number | null;
  readonly source: string;
  readonly availableDate: string | null;
  readonly photoUrl: string | null;
}

interface MyListingsProps {
  readonly listings?: readonly MyListingItem[];
}

export function MyListings({ listings }: MyListingsProps) {
  if (!listings || listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 mb-4">
          <Home className="size-7 text-red-600" />
        </div>
        <p className="font-[family-name:var(--font-display)] text-lg font-bold text-gray-900">
          No listings posted yet
        </p>
        <p className="mt-2 text-sm text-gray-500 max-w-xs">
          Post a sublease through CribAI chat and it will appear here.
        </p>
        <Link
          href="/chat"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-900 transition-colors"
        >
          Open Chat
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {listings.map((listing) => (
        <Link
          key={listing.id}
          href={`/listing/${listing.id}`}
          className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-white hover:border-red-200 hover:bg-red-50/30 transition-all"
        >
          {/* Photo or placeholder */}
          {listing.photoUrl ? (
            <img
              src={listing.photoUrl}
              alt={listing.address}
              className="h-16 w-16 rounded-xl object-cover shrink-0"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-50 to-red-100">
              <Home className="size-6 text-red-600 opacity-50" />
            </div>
          )}

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">{listing.address}</p>
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
              <span className="font-medium text-gray-900">${listing.price.toLocaleString()}/mo</span>
              {listing.beds !== null && (
                <span>{listing.beds === 0 ? 'Studio' : `${listing.beds} bed${listing.beds !== 1 ? 's' : ''}`}</span>
              )}
              {listing.availableDate && (
                <span>Available {listing.availableDate}</span>
              )}
            </div>
          </div>

          {/* Action */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1 text-xs text-red-700">
              <Eye className="size-3" />
              View
            </span>
            <ExternalLink className="size-3.5 text-gray-400" />
          </div>
        </Link>
      ))}
    </div>
  );
}
