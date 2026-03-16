'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { Sparkles, History } from 'lucide-react';
import { CribAIChat } from '@/components/cribai-chat';
import { useChatContext } from '@/components/chat/ChatProvider';
import type { ExploreListing } from '@/lib/listing-types';

interface ExploreClientProps {
  readonly listings: readonly ExploreListing[];
}

/** Context badges shown above the chat */
function ContextBar() {
  return (
    <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar border-b border-gray-100 bg-gray-50/80 px-4 py-2 backdrop-blur-sm">
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
        <Sparkles className="size-3" />
        Active Context
      </span>
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs text-gray-500 border border-gray-200">
        <History className="size-3" />
        Past Searches
      </span>
    </div>
  );
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

/** Map panel with listing pins (placeholder grayscale style) */
function MapPanel({ listings }: { readonly listings: readonly ExploreListing[] }) {
  const pins = useMemo(
    () => listings.filter(l => l.latitude !== null && l.longitude !== null).slice(0, 20),
    [listings],
  );

  return (
    <div className="relative h-full w-full bg-gray-200">
      {/* Grayscale map background */}
      {MAPBOX_TOKEN ? (
        <Image
          src={`https://api.mapbox.com/styles/v1/mapbox/light-v11/static/-89.4012,43.0731,13,0/800x1200?access_token=${MAPBOX_TOKEN}`}
          alt="Map of Madison"
          fill
          className="object-cover grayscale"
          sizes="50vw"
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <p className="text-xs text-gray-400">Map unavailable</p>
        </div>
      )}
      <div className="absolute inset-0 bg-white/20" />

      {/* Map sync badge */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-md backdrop-blur-sm">
        <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
        Synced with chat
      </div>

      {/* Sample listing pins */}
      {pins.slice(0, 5).map((listing, i) => {
        const topPercent = 20 + (i * 15);
        const leftPercent = 15 + (i * 14);
        return (
          <div
            key={listing.id}
            className="absolute z-10"
            style={{ top: `${topPercent}%`, left: `${leftPercent}%` }}
          >
            <div className="rounded-full bg-teal-800 px-2.5 py-1 text-xs font-bold text-white shadow-lg">
              ${listing.price.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ExploreClient({ listings }: ExploreClientProps) {
  const { campusSlug, campusId, isAuthenticated } = useChatContext();

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-white">
      {/* Left: Conversational Search Panel */}
      <div className="flex w-full flex-col md:w-1/2 lg:w-7/12 border-r border-gray-100">
        <ContextBar />
        <CribAIChat
          campusSlug={campusSlug}
          campusId={campusId}
          isAuthenticated={isAuthenticated}
          className="flex flex-1 flex-col"
        />
      </div>

      {/* Right: Map Panel (desktop only) */}
      <div className="hidden md:block md:w-1/2 lg:w-5/12">
        <MapPanel listings={listings} />
      </div>
    </div>
  );
}
