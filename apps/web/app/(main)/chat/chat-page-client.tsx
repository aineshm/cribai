'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { CribAIChat } from '../../../components/cribai-chat';
import { ConversationSidebar } from '../../../components/chat/conversation-sidebar';
import { MissionProposalCard } from '../../../components/chat/MissionProposalCard';
import { useChatContext } from '../../../components/chat/ChatProvider';
import { useConcierge } from '../../../components/concierge/ConciergeProvider';

/**
 * ChatPageClient — Full-page chat with conversation sidebar + mission panel.
 * This is the canonical chat UI. The floating AIChatPanel is for quick access;
 * this page is for extended conversations and mission management.
 *
 * All props (campusSlug, campusId, isAuthenticated) come from ChatProvider
 * context, which is set by the layout. This ensures a single source of truth.
 */
export function ChatPageClient() {
  const searchParams = useSearchParams();
  const conversationParam = searchParams.get('conversation');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(conversationParam);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { pendingProposal, setPendingProposal, campusId, campusSlug, isAuthenticated } = useChatContext();
  const { missions } = useConcierge();

  // Sync with URL search params (e.g., navigating from Profile chat history)
  useEffect(() => {
    if (conversationParam && conversationParam !== activeConversationId) {
      setActiveConversationId(conversationParam);
    }
  }, [conversationParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setPendingProposal(null); // clear stale proposal from previous conversation
  }, [setPendingProposal]);

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setPendingProposal(null); // clear stale proposal
  }, [setPendingProposal]);

  const handleConversationCreated = useCallback((id: string) => {
    setActiveConversationId(id);
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const handleMissionProposal = useCallback(
    (proposal: { intent: string; confidence: number; extractedFields: Record<string, unknown> }) => {
      setPendingProposal(proposal);
    },
    [setPendingProposal],
  );

  const activeMissions = missions.filter(m =>
    m.status === 'pending' || m.status === 'running' || m.status === 'waiting_approval'
  );

  return (
    <div className="app-mobile-pane flex flex-col overflow-hidden animate-fade-in">
      <div className="shrink-0 px-4 pt-4 pb-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--surface-900)]">
          AI Chat
        </h1>
        <p className="mt-1 text-sm text-[var(--surface-500)]">
          Search listings, compare apartments, explain lease terms, and schedule tours.
        </p>
      </div>

      <div className="flex flex-1 min-h-0 gap-4 px-4 pb-4">
        {/* Left sidebar: conversations + active missions */}
        {isAuthenticated && (
          <div className="hidden md:flex w-64 shrink-0 flex-col min-h-0 space-y-4 overflow-y-auto">
            <ConversationSidebar
              onSelectConversation={handleSelectConversation}
              onNewChat={handleNewChat}
              activeConversationId={activeConversationId}
              refreshTrigger={refreshTrigger}
            />
            {activeMissions.length > 0 && (
              <div className="rounded-xl border border-[var(--surface-200)] bg-white p-3 space-y-2">
                <h3 className="text-xs font-medium text-[var(--surface-500)] uppercase tracking-wider">
                  Active Missions
                </h3>
                {activeMissions.map(mission => (
                  <div
                    key={mission.id}
                    className="rounded-lg border border-[var(--surface-200)] p-2.5 text-xs space-y-1 hover:border-[var(--primary-300)] transition-colors cursor-pointer"
                  >
                    <div className="font-medium text-[var(--surface-800)]">{mission.title}</div>
                    <div className="text-[var(--surface-500)] capitalize">{mission.status.replace(/_/g, ' ')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-1 min-w-0 min-h-0 flex-col space-y-3">
          {/* Mission proposal card */}
          {pendingProposal && <MissionProposalCard />}

          <CribAIChat
            campusSlug={campusSlug || 'uw-madison'}
            campusId={campusId}
            conversationId={activeConversationId}
            isAuthenticated={isAuthenticated}
            onConversationCreated={handleConversationCreated}
            onMissionProposal={handleMissionProposal}
            className="flex flex-1 flex-col min-h-0"
          />
        </div>
      </div>
    </div>
  );
}
