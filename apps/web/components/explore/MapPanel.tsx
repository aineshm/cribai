'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Map, Marker, Popup } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { motion } from 'framer-motion';
import { MapPin, Search } from 'lucide-react';
import { fadeIn } from '@/lib/animations';
import type { ExploreListing } from '@/lib/listing-types';
import type { ViewStateChangeEvent, MapRef } from 'react-map-gl/mapbox';

export interface MapBounds {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

/** UW-Madison campus center */
const DEFAULT_CENTER = { latitude: 43.0731, longitude: -89.4012 };
const DEFAULT_ZOOM = 13;

interface MapPanelProps {
  readonly listings: readonly ExploreListing[];
  readonly onBoundsChange?: (bounds: MapBounds) => void;
  readonly showSearchButton?: boolean;
  readonly onSearchArea?: () => void;
  /** When provided, the map flies to this center (e.g. after AI search results arrive) */
  readonly flyToCenter?: { lat: number; lng: number } | null;
}

export function MapPanel({ listings, onBoundsChange, showSearchButton, onSearchArea, flyToCenter }: MapPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const boundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<MapRef>(null);

  useEffect(() => {
    return () => {
      if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
    };
  }, []);

  // Fly to center when AI search results arrive
  useEffect(() => {
    if (flyToCenter && mapRef.current) {
      mapRef.current.flyTo({
        center: [flyToCenter.lng, flyToCenter.lat],
        zoom: 14,
        duration: 1200,
      });
    }
  }, [flyToCenter]);

  const handleMarkerClick = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleMoveEnd = useCallback((e: ViewStateChangeEvent) => {
    if (!onBoundsChange) return;
    const bounds = e.target.getBounds();
    if (!bounds) return;
    if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
    boundsTimerRef.current = setTimeout(() => {
      onBoundsChange({
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast(),
      });
    }, 300);
  }, [onBoundsChange]);

  const geoListings = useMemo(
    () => listings.filter((l) => l.latitude != null && l.longitude != null),
    [listings]
  );

  const mapToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!mapToken) {
    return (
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        className="relative flex min-h-[400px] h-full items-center justify-center overflow-hidden rounded-[1.75rem] border border-[var(--surface-200)] bg-[linear-gradient(135deg,#0f766e_0%,#115e59_52%,#f59e0b_150%)]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_34%)]" />
        <div className="relative rounded-[1.5rem] bg-white/95 px-6 py-5 text-center shadow-xl backdrop-blur">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-800">
            <MapPin className="size-5" />
          </div>
          <p className="mt-4 text-lg font-semibold text-[var(--surface-900)]">Map unavailable</p>
          <p className="mt-2 text-sm leading-6 text-[var(--surface-600)]">
            Add `NEXT_PUBLIC_MAPBOX_TOKEN` to enable live price pins and map sync.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={fadeIn}
      initial="initial"
      animate="animate"
      className="relative h-full flex-1 min-h-[400px] overflow-hidden rounded-[1.75rem] border border-[var(--surface-200)] shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
    >
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-2xl bg-white/92 px-4 py-3 shadow-lg backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">
          Live map
        </p>
        <p className="mt-1 text-sm text-[var(--surface-700)]">
          {geoListings.length} listing{geoListings.length !== 1 ? 's' : ''} on map
        </p>
      </div>

      {/* Search this area button */}
      {showSearchButton && onSearchArea && (
        <button
          type="button"
          onClick={onSearchArea}
          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-red-800 shadow-lg border border-gray-200 hover:bg-red-50 transition-colors"
        >
          <Search className="size-4" />
          Search this area
        </button>
      )}

      <Map
        ref={mapRef}
        mapboxAccessToken={mapToken}
        initialViewState={{
          latitude: DEFAULT_CENTER.latitude,
          longitude: DEFAULT_CENTER.longitude,
          zoom: DEFAULT_ZOOM,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        onMoveEnd={handleMoveEnd}
      >
        {geoListings.map((listing) => {
          const isSelected = listing.id === selectedId;
          return (
            <Marker
              key={listing.id}
              latitude={listing.latitude!}
              longitude={listing.longitude!}
              onClick={() => handleMarkerClick(listing.id)}
              anchor="bottom"
              style={{ zIndex: isSelected ? 100 : 1 }}
            >
              <button
                type="button"
                aria-label={`${listing.title || listing.address || 'Listing'} — $${listing.price.toLocaleString()} per month`}
                className="flex flex-col items-center cursor-pointer bg-transparent border-none p-0"
              >
                <div
                  className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold shadow-lg transition-all hover:scale-110 hover:z-50 ${
                    isSelected
                      ? 'bg-[var(--surface-900)] text-white scale-110'
                      : 'bg-red-800 text-white'
                  }`}
                >
                  ${listing.price.toLocaleString()}
                </div>
                {/* Pin tail */}
                <div
                  className={`h-0 w-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent ${
                    isSelected
                      ? 'border-t-[var(--surface-900)]'
                      : 'border-t-[var(--color-red-800,#115e59)]'
                  }`}
                />
              </button>
            </Marker>
          );
        })}
        {selectedId && (() => {
          const listing = geoListings.find((l) => l.id === selectedId);
          if (!listing) return null;
          return (
            <Popup
              latitude={listing.latitude!}
              longitude={listing.longitude!}
              anchor="bottom"
              offset={28}
              closeOnClick={false}
              onClose={() => setSelectedId(null)}
              className="!z-50 [&_.mapboxgl-popup-content]:rounded-xl [&_.mapboxgl-popup-content]:p-0 [&_.mapboxgl-popup-content]:shadow-xl [&_.mapboxgl-popup-tip]:!border-t-white"
            >
              <a
                href={`/listing/${listing.id}`}
                className="block w-56 rounded-xl bg-white p-3 no-underline transition-colors hover:bg-gray-50"
              >
                <p className="text-sm font-bold text-gray-900 truncate">
                  {listing.title || listing.address || 'Listing'}
                </p>
                <p className="mt-1 text-xs text-gray-500 truncate">{listing.address}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-red-800">
                    ${listing.price.toLocaleString()}/mo
                  </span>
                  <span className="text-xs font-medium text-red-700">
                    View →
                  </span>
                </div>
              </a>
            </Popup>
          );
        })()}
      </Map>
    </motion.div>
  );
}
