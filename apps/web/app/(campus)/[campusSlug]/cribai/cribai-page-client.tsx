'use client';

import { useState, useCallback } from 'react';
import { CribAIChat } from '../../../../components/cribai-chat';
import { ConversationSidebar } from '../../../../components/chat/conversation-sidebar';

interface CribAIChatPageProps {
  readonly campusSlug: string;
  readonly campusId?: string;
  readonly isAuthenticated: boolean;
  readonly initialListingId?: string;
  readonly initialAddress?: string;
}

export function CribAIChatPage({
  campusSlug,
  campusId,
  isAuthenticated,
  initialListingId,
  initialAddress,
}: CribAIChatPageProps) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  const handleConversationCreated = useCallback((id: string) => {
    setActiveConversationId(id);
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <div className="animate-fade-in">
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--surface-900)]">CribAI</h1>
      <p className="mt-1 text-sm text-[var(--surface-500)]">
        Your AI housing advisor. Ask about prices, neighborhoods, fairness scores, and more.
      </p>
      <div className="mt-4 flex gap-4">
        {isAuthenticated && (
          <ConversationSidebar
            onSelectConversation={handleSelectConversation}
            onNewChat={handleNewChat}
            activeConversationId={activeConversationId}
            refreshTrigger={refreshTrigger}
          />
        )}
        <div className="flex-1 min-w-0">
          <CribAIChat
            campusSlug={campusSlug}
            campusId={campusId}
            initialListingId={initialListingId}
            initialAddress={initialAddress}
            conversationId={activeConversationId}
            isAuthenticated={isAuthenticated}
            onConversationCreated={handleConversationCreated}
          />
        </div>
      </div>
    </div>
  );
}
