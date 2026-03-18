'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CribAIChat } from '../../../components/cribai-chat';
import { ConversationInbox } from '../../../components/chat/ConversationInbox';
import { MissionProposalCard } from '../../../components/chat/MissionProposalCard';
import { useChatContext } from '../../../components/chat/ChatProvider';
import { useConcierge } from '../../../components/concierge/ConciergeProvider';

/**
 * ChatPageClient — Inbox-style chat page.
 *
 * Two states:
 * - No conversation selected: full-width ConversationInbox
 * - Conversation selected (?conversation={id}): focused CribAIChat with back button
 */
export function ChatPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationParam = searchParams.get('conversation');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(conversationParam);
  const [showNewChat, setShowNewChat] = useState(false);
  const { pendingProposal, setPendingProposal, campusId, campusSlug, isAuthenticated } = useChatContext();
  const { missions } = useConcierge();

  // Sync with URL search params (e.g., navigating from Profile chat history)
  useEffect(() => {
    const urlConv = searchParams.get('conversation');
    if (urlConv && urlConv !== activeConversationId) {
      setActiveConversationId(urlConv);
      setShowNewChat(false);
    } else if (!urlConv && activeConversationId) {
      setActiveConversationId(null);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setShowNewChat(false);
    setPendingProposal(null);
    router.push(`/chat?conversation=${id}`);
  }, [setPendingProposal, router]);

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setShowNewChat(true);
    setPendingProposal(null);
    router.push('/chat');
  }, [setPendingProposal, router]);

  const handleBack = useCallback(() => {
    setActiveConversationId(null);
    setShowNewChat(false);
    setPendingProposal(null);
    router.push('/chat');
  }, [setPendingProposal, router]);

  const handleConversationCreated = useCallback((id: string) => {
    setActiveConversationId(id);
    router.push(`/chat?conversation=${id}`);
  }, [router]);

  const handleMissionProposal = useCallback(
    (proposal: { intent: string; confidence: number; extractedFields: Record<string, unknown> }) => {
      setPendingProposal(proposal);
    },
    [setPendingProposal],
  );

  const activeMissions = missions.filter(m =>
    m.status === 'pending' || m.status === 'running' || m.status === 'waiting_approval'
  );

  const showChat = activeConversationId !== null || showNewChat;

  // Focused chat view (conversation selected or new chat)
  if (showChat) {
    return (
      <div className="app-mobile-pane flex flex-col overflow-hidden animate-fade-in bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-50/25 via-white to-white">
        {/* Back button */}
        <div className="shrink-0 px-4 pt-3 pb-1">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="size-4" />
            Back to conversations
          </button>
        </div>

        <div className="flex flex-1 min-h-0 flex-col px-4 pb-4 space-y-3">
          {/* Mission proposal card */}
          {pendingProposal && <MissionProposalCard />}

          {/* Active missions */}
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
    );
  }

  // Inbox view (no conversation selected)
  return (
    <div className="app-mobile-pane flex flex-col overflow-hidden animate-fade-in bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-50/25 via-white to-white">
      <div className="shrink-0 px-4 pt-4 pb-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--surface-900)]">
          CribAI
        </h1>
        <p className="mt-1 text-sm text-[var(--surface-500)]">
          Search listings, compare apartments, explain lease terms, and schedule tours.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <ConversationInbox
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
        />
      </div>
    </div>
  );
}
