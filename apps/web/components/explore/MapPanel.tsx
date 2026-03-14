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
        className="relative h-full min-h-[400px] rounded-xl overflow-hidden bg-[var(--surface-100)] border border-[var(--surface-200)] flex items-center justify-center"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4 text-[var(--primary-700)]" />
          <span>Map unavailable</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={fadeIn}
      initial="initial"
      animate="animate"
      className="relative h-full min-h-[400px] rounded-xl overflow-hidden border border-[var(--surface-200)]"
    >
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
                  className={`text-xs font-semibold px-2 py-1 rounded-lg shadow-md whitespace-nowrap transition-colors ${
                    isSelected
                      ? 'bg-[var(--surface-900)] text-white'
                      : 'bg-[var(--primary-700)] text-white'
                  }`}
                >
                  ${listing.price.toLocaleString()}
                </div>
                {/* Pin tail */}
                <div
                  className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] ${
                    isSelected
                      ? 'border-t-[var(--surface-900)]'
                      : 'border-t-[var(--primary-700)]'
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
