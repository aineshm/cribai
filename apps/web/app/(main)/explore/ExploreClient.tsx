'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles, MapPin, Bed, DollarSign, Map as MapIcon, MessageSquare, X } from 'lucide-react';
import { CribAIChat } from '@/components/cribai-chat';
import { useChatContext } from '@/components/chat/ChatProvider';
import { MissionProposalCard } from '@/components/chat/MissionProposalCard';
import { MapPanel } from '@/components/explore/MapPanel';
import type { MapBounds } from '@/components/explore/MapPanel';
import type { ExploreListing } from '@/lib/listing-types';

export interface SearchContext {
  readonly mapArea?: string;
  readonly budget?: string;
  readonly bedrooms?: string;
  readonly amenities?: readonly string[];
}

interface ExploreClientProps {
  readonly featuredListings: readonly ExploreListing[];
}

/** Live filter chips showing what the AI is filtering on */
function ContextBar({ context, onReset }: { readonly context: SearchContext; readonly onReset?: () => void }) {
  const chips: { key: string; label: string; icon: typeof Sparkles }[] = [];

  if (context.mapArea) chips.push({ key: 'map', label: context.mapArea, icon: MapPin });
  if (context.budget) chips.push({ key: 'budget', label: context.budget, icon: DollarSign });
  if (context.bedrooms) chips.push({ key: 'beds', label: context.bedrooms, icon: Bed });
  if (context.amenities) {
    for (const a of context.amenities) {
      chips.push({ key: `amenity-${a}`, label: a, icon: Sparkles });
    }
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar border-b border-gray-100 bg-gray-50/80 px-4 py-2 backdrop-blur-sm">
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-800">
        <Sparkles className="size-3" />
        {chips.length > 0 ? 'Filters' : 'Active Context'}
      </span>
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <span
            key={chip.key}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs text-gray-600 border border-gray-200"
          >
            <Icon className="size-3 text-red-600" />
            {chip.label}
          </span>
        );
      })}
      {chips.length === 0 && (
        <span className="text-xs text-gray-500 shrink-0">
          Start searching to see active filters
        </span>
      )}
      {chips.length > 0 && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
        >
          <X className="size-3" />
          Reset All
        </button>
      )}
    </div>
  );
}

export function ExploreClient({ featuredListings }: ExploreClientProps) {
  const { campusSlug, campusId, isAuthenticated, pendingProposal, setPendingProposal } = useChatContext();

  // Mobile view toggle (chat vs map)
  const [mobileView, setMobileView] = useState<'chat' | 'map'>('chat');

  // Map viewport state
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [lockedBounds, setLockedBounds] = useState<MapBounds | null>(null);
  const [showSearchButton, setShowSearchButton] = useState(false);

  // Live filter context from AI tool calls
  const [searchContext, setSearchContext] = useState<SearchContext>({});

  // AI search results for map overlay (null = show all listings)
  const [aiMapListings, setAiMapListings] = useState<readonly ExploreListing[] | null>(null);
  const [viewportListings, setViewportListings] = useState<readonly ExploreListing[]>([]);
  const [isViewportLoading, setIsViewportLoading] = useState(false);

  // Fly-to center for map when AI results arrive
  const [mapFlyTo, setMapFlyTo] = useState<{ lat: number; lng: number } | null>(null);

  const handleMissionProposal = useCallback(
    (proposal: { intent: string; confidence: number; extractedFields: Record<string, unknown> }) => {
      setPendingProposal(proposal);
    },
    [setPendingProposal],
  );

  const handleBoundsChange = useCallback((bounds: MapBounds) => {
    setMapBounds(bounds);
    // If bounds were locked (user already searched), show "Search this area" when map moves
    if (lockedBounds) {
      setShowSearchButton(true);
    }
  }, [lockedBounds]);

  const handleSearchArea = useCallback(() => {
    // Update locked bounds to current viewport
    setLockedBounds(mapBounds);
    setShowSearchButton(false);
    // Update context bar with map area info
    setSearchContext(prev => ({ ...prev, mapArea: 'Current map area' }));
  }, [mapBounds]);

  const handleMessageSent = useCallback(() => {
    // Lock bounds when user sends a message
    if (mapBounds) {
      setLockedBounds(mapBounds);
      setShowSearchButton(false);
      setSearchContext(prev => ({ ...prev, mapArea: 'Current map area' }));
    }
  }, [mapBounds]);

  const handleMapListings = useCallback((results: readonly { id: string; address: string; rentMonthly: number; beds: number | null; sqft: number | null; photoUrl: string | null; fairnessScore: number | null; latitude: number; longitude: number }[]) => {
    const asExploreListings: readonly ExploreListing[] = results.map(r => ({
      id: r.id,
      title: r.address,
      address: r.address,
      price: r.rentMonthly,
      latitude: r.latitude,
      longitude: r.longitude,
      beds: r.beds,
      baths: null,
      sqft: r.sqft,
      photoUrl: r.photoUrl,
      amenities: [],
      source: 'ai_search',
      sourceUrl: null,
      fairnessScore: r.fairnessScore,
      availableDate: null,
      walkScore: null,
    }));
    setAiMapListings(asExploreListings);

    // Compute center of AI results and fly the map there
    const withCoords = asExploreListings.filter(l => l.latitude != null && l.longitude != null);
    if (withCoords.length > 0) {
      const avgLat = withCoords.reduce((s, l) => s + (l.latitude ?? 0), 0) / withCoords.length;
      const avgLng = withCoords.reduce((s, l) => s + (l.longitude ?? 0), 0) / withCoords.length;
      setMapFlyTo({ lat: avgLat, lng: avgLng });
    }
  }, []);

  /** Reset AI-filtered map results back to the viewport's sublease inventory (AIN-63: discovery is sublease-only) */
  const resetAiResults = useCallback(() => {
    setAiMapListings(null);
    setMapFlyTo(null);
    setSearchContext({});
    setLockedBounds(null);
    setShowSearchButton(false);
  }, []);

  const handleSearchContext = useCallback((ctx: SearchContext) => {
    // Replace (not merge) so stale chips from previous searches are cleared
    setSearchContext(prev => ({
      mapArea: ctx.mapArea ?? prev.mapArea,
      budget: ctx.budget,
      bedrooms: ctx.bedrooms,
      amenities: ctx.amenities,
    }));
  }, []);

  useEffect(() => {
    if (!mapBounds || aiMapListings) {
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      campusSlug,
      minLat: String(mapBounds.minLat),
      maxLat: String(mapBounds.maxLat),
      minLng: String(mapBounds.minLng),
      maxLng: String(mapBounds.maxLng),
      limit: '250',
    });

    setIsViewportLoading(true);
    void fetch(`/api/explore/viewport?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json() as Promise<{ listings: ExploreListing[] }>;
      })
      .then((payload) => {
        if (!cancelled) {
          setViewportListings(payload.listings ?? []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[ExploreClient] Failed to fetch viewport listings:', error);
          setViewportListings([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsViewportLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [campusSlug, mapBounds, aiMapListings]);

  // Use locked bounds (from when search started) if available, otherwise current viewport
  const activeBounds = lockedBounds ?? mapBounds;
  const activeMapListings = aiMapListings ?? viewportListings;

  return (
    <div className="app-mobile-pane flex flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-50/30 via-white to-white">
      {/* Mobile view toggle — hidden on desktop */}
      <div className="flex md:hidden border-b border-gray-100">
        <ContextBar context={searchContext} onReset={resetAiResults} />
        <div className="flex shrink-0 border-l border-gray-100">
          <button
            type="button"
            onClick={() => setMobileView('chat')}
            className={`flex items-center gap-1.5 px-4 min-h-[44px] text-xs font-medium transition-colors ${
              mobileView === 'chat' ? 'text-red-800 bg-red-50' : 'text-gray-400'
            }`}
          >
            <MessageSquare className="size-3.5" />
            Chat
          </button>
          <button
            type="button"
            onClick={() => setMobileView('map')}
            className={`flex items-center gap-1.5 px-4 min-h-[44px] text-xs font-medium transition-colors ${
              mobileView === 'map' ? 'text-red-800 bg-red-50' : 'text-gray-400'
            }`}
          >
            <MapIcon className="size-3.5" />
            Map
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Conversational Search Panel */}
        <div className={`flex min-w-0 min-h-0 flex-col border-r border-gray-100 md:w-1/2 lg:w-7/12 overflow-hidden ${
          mobileView === 'chat' ? 'w-full' : 'hidden md:flex'
        }`}>
          {/* Desktop context bar (mobile one is above) */}
          <div className="hidden md:block">
            <ContextBar context={searchContext} onReset={resetAiResults} />
          </div>
          {pendingProposal && (
            <div className="border-b border-gray-100 px-4 py-3">
              <MissionProposalCard />
            </div>
          )}
          <CribAIChat
            campusSlug={campusSlug}
            campusId={campusId}
            isAuthenticated={isAuthenticated}
            onMissionProposal={handleMissionProposal}
            mapBounds={activeBounds}
            onMessageSent={handleMessageSent}
            onSearchContext={handleSearchContext}
            onMapListings={handleMapListings}
            onChatReset={resetAiResults}
            suppressInlineMap
            className="flex flex-1 flex-col min-h-0"
            featuredListings={featuredListings.slice(0, 6).map(l => ({
              id: l.id,
              title: l.title,
              address: l.address,
              price: l.price,
              photoUrl: l.photoUrl,
              beds: l.beds,
            }))}
          />
        </div>

        {/* Right: Map Panel (always on desktop, togglable on mobile) */}
        <div className={`flex flex-col flex-1 min-h-0 md:flex-none md:block md:w-1/2 lg:w-5/12 ${
          mobileView === 'map' ? 'block w-full' : 'hidden'
        }`}>
          {aiMapListings && (
            <div className="flex items-center justify-between border-b border-gray-100 bg-red-50/80 px-4 py-2 backdrop-blur-sm">
              <span className="flex items-center gap-1.5 text-xs text-red-800">
                <Sparkles className="size-3" />
                Showing {aiMapListings.length} AI result{aiMapListings.length !== 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={resetAiResults}
                className="flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900 transition-colors"
              >
                Show all
                <X className="size-3" />
              </button>
            </div>
          )}
          {!aiMapListings && (
            <div className="flex items-center justify-between border-b border-gray-100 bg-white/80 px-4 py-2 text-xs text-gray-500">
              <span>
                {isViewportLoading
                  ? 'Loading subleases in this area...'
                  : viewportListings.length === 0
                    ? 'No subleases in view yet — zoom out or be the first to post one'
                    : `Showing ${viewportListings.length} sublease${viewportListings.length !== 1 ? 's' : ''} in view`}
              </span>
              {lockedBounds && (
                <button
                  type="button"
                  onClick={() => {
                    setLockedBounds(null);
                    setShowSearchButton(false);
                  }}
                  className="font-medium text-red-700 hover:text-red-900 transition-colors"
                >
                  Live viewport
                </button>
              )}
            </div>
          )}
          <MapPanel
            listings={activeMapListings}
            onBoundsChange={handleBoundsChange}
            showSearchButton={showSearchButton}
            onSearchArea={handleSearchArea}
            flyToCenter={mapFlyTo}
          />
        </div>
      </div>
    </div>
  );
}
