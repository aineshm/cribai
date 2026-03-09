'use client';

import { useState, useCallback } from 'react';
import { Map, Marker, Popup } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { MapBlock } from '@campusnest/types';
import { ChatMapPopup } from './chat-map-popup';

interface ChatMapBlockProps {
  readonly block: MapBlock;
  readonly campusSlug: string;
}

export function ChatMapBlock({ block, campusSlug }: ChatMapBlockProps) {
  const [selectedListingId, setSelectedListingId] = useState<string | null>(
    null
  );

  const handleMarkerClick = useCallback((listingId: string) => {
    setSelectedListingId(listingId);
  }, []);

  const handlePopupClose = useCallback(() => {
    setSelectedListingId(null);
  }, []);

  if (block.listings.length === 0) {
    return null;
  }

  const mapToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!mapToken) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg bg-[var(--surface-100)]">
        <p className="text-xs text-[var(--surface-400)]">Map unavailable</p>
      </div>
    );
  }

  const selectedListing = block.listings.find(
    (l) => l.id === selectedListingId
  );

  return (
    <div className="overflow-hidden rounded-lg">
      <Map
        mapboxAccessToken={mapToken}
        initialViewState={{
          latitude: block.center.lat,
          longitude: block.center.lng,
          zoom: block.zoom,
        }}
        style={{ width: '100%', height: 300 }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
      >
        {block.listings.map((listing) => {
          const isSelected = listing.id === selectedListingId;
          return (
            <Marker
              key={listing.id}
              latitude={listing.latitude}
              longitude={listing.longitude}
              onClick={() => handleMarkerClick(listing.id)}
            >
              <div
                className={`cursor-pointer rounded-full border px-2 py-1 text-xs font-bold shadow-md ${
                  isSelected
                    ? 'border-[var(--primary-700)] bg-[var(--primary-600)] text-white'
                    : 'border-[var(--surface-200)] bg-white text-[var(--surface-900)]'
                }`}
              >
                ${listing.rentMonthly.toLocaleString()}
              </div>
            </Marker>
          );
        })}

        {selectedListing != null && (
          <Popup
            latitude={selectedListing.latitude}
            longitude={selectedListing.longitude}
            onClose={handlePopupClose}
            closeOnClick={false}
            anchor="bottom"
            offset={15}
          >
            <ChatMapPopup
              listing={selectedListing}
              campusSlug={campusSlug}
            />
          </Popup>
        )}
      </Map>
    </div>
  );
}
