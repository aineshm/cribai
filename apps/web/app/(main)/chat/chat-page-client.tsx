'use client';

import { useState, useCallback } from 'react';
import { CribAIChat } from '../../../components/cribai-chat';
import { ConversationSidebar } from '../../../components/chat/conversation-sidebar';

interface ChatPageClientProps {
  readonly campusSlug: string;
  readonly campusId?: string;
  readonly isAuthenticated: boolean;
}

/**
 * ChatPageClient — Full-page chat with conversation sidebar.
 * This is the canonical chat UI. The floating AIChatPanel is for quick access;
 * this page is for extended conversations and mission management.
 */
export function ChatPageClient({
  campusSlug,
  campusId,
  isAuthenticated,
}: ChatPageClientProps) {
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
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--surface-900)]">
          AI Chat
        </h1>
        <p className="mt-1 text-sm text-[var(--surface-500)]">
          Search listings, compare apartments, explain lease terms, and schedule tours.
        </p>
      </div>

      <div className="flex gap-4">
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
            conversationId={activeConversationId}
            isAuthenticated={isAuthenticated}
            onConversationCreated={handleConversationCreated}
          />
        </div>
      </div>
    </div>
  );
}
