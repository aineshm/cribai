'use client';

import { Map, Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin } from 'lucide-react';

interface ListingMapProps {
  readonly latitude: number;
  readonly longitude: number;
  readonly address: string;
  readonly price: number;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

export function ListingMap({ latitude, longitude, address, price }: ListingMapProps) {
  if (!MAPBOX_TOKEN) return null;

  return (
    <div className="rounded-2xl overflow-hidden border border-[var(--surface-200)] shadow-sm">
      <Map
        initialViewState={{
          latitude,
          longitude,
          zoom: 15,
        }}
        style={{ width: '100%', height: 240 }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        interactive={false}
        attributionControl={false}
      >
        <Marker latitude={latitude} longitude={longitude} anchor="bottom">
          <div className="flex flex-col items-center">
            <div className="rounded-lg bg-red-800 px-2 py-1 text-xs font-bold text-white shadow-md">
              ${price.toLocaleString()}/mo
            </div>
            <MapPin className="size-6 text-red-800 drop-shadow-md -mt-0.5" fill="currentColor" />
          </div>
        </Marker>
      </Map>
      <div className="bg-white px-4 py-2.5 text-xs text-muted-foreground">
        <MapPin className="inline size-3 mr-1 -mt-0.5" />
        {address}
      </div>
    </div>
  );
}
