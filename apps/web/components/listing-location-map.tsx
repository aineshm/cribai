'use client';

import { Map, Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin } from 'lucide-react';

interface ListingLocationMapProps {
  readonly latitude: number;
  readonly longitude: number;
  readonly address: string;
}

export function ListingLocationMap({
  latitude,
  longitude,
  address,
}: ListingLocationMapProps) {
  return (
    <div className="overflow-hidden rounded-lg">
      <Map
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        initialViewState={{
          latitude,
          longitude,
          zoom: 15,
        }}
        style={{ width: '100%', height: 250 }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
      >
        <Marker latitude={latitude} longitude={longitude}>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[var(--primary-600)] shadow-lg"
            title={address}
          >
            <MapPin className="h-4 w-4 text-white" fill="currentColor" strokeWidth={0} />
          </div>
        </Marker>
      </Map>
    </div>
  );
}
