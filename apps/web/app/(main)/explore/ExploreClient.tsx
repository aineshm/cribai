'use client';

import { useCallback, useState } from 'react';
import { Sparkles, MapPin, Bed, DollarSign, Map as MapIcon, MessageSquare } from 'lucide-react';
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
  readonly listings: readonly ExploreListing[];
}

/** Live filter chips showing what the AI is filtering on */
function ContextBar({ context }: { readonly context: SearchContext }) {
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
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
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
            <Icon className="size-3 text-teal-600" />
            {chip.label}
          </span>
        );
      })}
      {chips.length === 0 && (
        <span className="text-xs text-gray-400 shrink-0">
          Start searching to see active filters
        </span>
      )}
    </div>
  );
}

export function ExploreClient({ listings }: ExploreClientProps) {
  const { campusSlug, campusId, isAuthenticated, pendingProposal, setPendingProposal } = useChatContext();

  // Mobile view toggle (chat vs map)
  const [mobileView, setMobileView] = useState<'chat' | 'map'>('chat');

  // Map viewport state
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [lockedBounds, setLockedBounds] = useState<MapBounds | null>(null);
  const [showSearchButton, setShowSearchButton] = useState(false);

  // Live filter context from AI tool calls
  const [searchContext, setSearchContext] = useState<SearchContext>({});

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

  const handleSearchContext = useCallback((ctx: SearchContext) => {
    setSearchContext(prev => ({ ...prev, ...ctx }));
  }, []);

  // Use locked bounds (from when search started) if available, otherwise current viewport
  const activeBounds = lockedBounds ?? mapBounds;

  return (
    <div className="app-mobile-pane flex flex-col overflow-hidden bg-white">
      {/* Mobile view toggle — hidden on desktop */}
      <div className="flex md:hidden border-b border-gray-100">
        <ContextBar context={searchContext} />
        <div className="flex shrink-0 border-l border-gray-100">
          <button
            type="button"
            onClick={() => setMobileView('chat')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              mobileView === 'chat' ? 'text-teal-800 bg-teal-50' : 'text-gray-400'
            }`}
          >
            <MessageSquare className="size-3" />
            Chat
          </button>
          <button
            type="button"
            onClick={() => setMobileView('map')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              mobileView === 'map' ? 'text-teal-800 bg-teal-50' : 'text-gray-400'
            }`}
          >
            <MapIcon className="size-3" />
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
            <ContextBar context={searchContext} />
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
            className="flex flex-1 flex-col min-h-0"
          />
        </div>

        {/* Right: Map Panel (always on desktop, togglable on mobile) */}
        <div className={`md:block md:w-1/2 lg:w-5/12 ${
          mobileView === 'map' ? 'block w-full' : 'hidden'
        }`}>
          <MapPanel
            listings={listings}
            onBoundsChange={handleBoundsChange}
            showSearchButton={showSearchButton}
            onSearchArea={handleSearchArea}
          />
        </div>
      </div>
    </div>
  );
}
