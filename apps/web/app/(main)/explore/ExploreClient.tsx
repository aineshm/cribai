'use client';

import { useCallback } from 'react';
import { Sparkles, History } from 'lucide-react';
import { CribAIChat } from '@/components/cribai-chat';
import { useChatContext } from '@/components/chat/ChatProvider';
import { MissionProposalCard } from '@/components/chat/MissionProposalCard';
import { MapPanel } from '@/components/explore/MapPanel';
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

export function ExploreClient({ listings }: ExploreClientProps) {
  const { campusSlug, campusId, isAuthenticated, pendingProposal, setPendingProposal } = useChatContext();

  const handleMissionProposal = useCallback(
    (proposal: { intent: string; confidence: number; extractedFields: Record<string, unknown> }) => {
      setPendingProposal(proposal);
    },
    [setPendingProposal],
  );

  return (
    <div className="app-mobile-pane flex overflow-hidden bg-white">
      {/* Left: Conversational Search Panel */}
      <div className="flex w-full min-w-0 min-h-0 flex-col border-r border-gray-100 md:w-1/2 lg:w-7/12 overflow-hidden">
        <ContextBar />
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
          className="flex flex-1 flex-col min-h-0"
        />
      </div>

      {/* Right: Map Panel (desktop only) */}
      <div className="hidden md:block md:w-1/2 lg:w-5/12">
        <MapPanel listings={listings} />
      </div>
    </div>
  );
}
