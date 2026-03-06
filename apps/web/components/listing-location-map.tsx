'use client';

import { Map, Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

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
            <svg
              className="h-4 w-4 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </Marker>
      </Map>
    </div>
  );
}
