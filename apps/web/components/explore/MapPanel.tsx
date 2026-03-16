'use client';

import { useState, useCallback, useMemo } from 'react';
import { Map, Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { fadeIn } from '@/lib/animations';
import type { ExploreListing } from '@/lib/listing-types';

/** UW-Madison campus center */
const DEFAULT_CENTER = { latitude: 43.0731, longitude: -89.4012 };
const DEFAULT_ZOOM = 13;

interface MapPanelProps {
  readonly listings: readonly ExploreListing[];
}

export function MapPanel({ listings }: MapPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleMarkerClick = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

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
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-800">
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
      className="relative h-full min-h-[400px] overflow-hidden rounded-[1.75rem] border border-[var(--surface-200)] shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
    >
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-2xl bg-white/92 px-4 py-3 shadow-lg backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
          Live map
        </p>
        <p className="mt-1 text-sm text-[var(--surface-700)]">
          {geoListings.length} geocoded matches syncing with your filters
        </p>
      </div>
      <Map
        mapboxAccessToken={mapToken}
        initialViewState={{
          latitude: DEFAULT_CENTER.latitude,
          longitude: DEFAULT_CENTER.longitude,
          zoom: DEFAULT_ZOOM,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
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
            >
              <div className="flex flex-col items-center cursor-pointer">
                <div
                  className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold shadow-lg transition-colors ${
                    isSelected
                      ? 'bg-[var(--surface-900)] text-white'
                      : 'bg-teal-800 text-white'
                  }`}
                >
                  ${listing.price.toLocaleString()}
                </div>
                {/* Pin tail */}
                <div
                  className={`h-0 w-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent ${
                    isSelected
                      ? 'border-t-[var(--surface-900)]'
                      : 'border-t-[var(--color-teal-800,#115e59)]'
                  }`}
                />
              </div>
            </Marker>
          );
        })}
      </Map>
    </motion.div>
  );
}
