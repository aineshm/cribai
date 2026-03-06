'use client';

import Link from 'next/link';
import type { MapBlock } from '@campusnest/types';

type MapListing = MapBlock['listings'][number];

interface ChatMapPopupProps {
  readonly listing: MapListing;
  readonly campusSlug: string;
}

export function ChatMapPopup({ listing, campusSlug }: ChatMapPopupProps) {
  return (
    <div className="max-w-[200px]">
      {listing.photoUrl !== null && (
        <img
          src={listing.photoUrl}
          alt={listing.address}
          className="h-24 w-full rounded-t object-cover"
        />
      )}
      <div className="p-2">
        <p className="truncate text-sm font-medium text-gray-900">
          {listing.address}
        </p>
        <p className="text-sm text-gray-600">
          ${listing.rentMonthly.toLocaleString()}/mo
        </p>
        <p className="text-xs text-gray-500">
          {listing.bedrooms != null && <span>{listing.bedrooms}bd</span>}
          {listing.bedrooms != null && listing.bathrooms != null && ' / '}
          {listing.bathrooms != null && <span>{listing.bathrooms}ba</span>}
        </p>
        <Link
          href={`/${campusSlug}/listings/${listing.id}`}
          className="mt-1 inline-block text-xs text-blue-600 hover:underline"
        >
          View details
        </Link>
      </div>
    </div>
  );
}
