'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Conversation } from '@campusnest/types';

interface ConversationSidebarProps {
  readonly onSelectConversation: (id: string) => void;
  readonly onNewChat: () => void;
  readonly activeConversationId: string | null;
  readonly refreshTrigger: number;
}

export function ConversationSidebar({
  onSelectConversation,
  onNewChat,
  activeConversationId,
  refreshTrigger,
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<readonly Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchConversations = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetchError(false);
    try {
      const res = await fetch('/api/conversations', { signal: controller.signal });
      if (!res.ok) {
        setFetchError(true);
        return;
      }
      const data = (await res.json()) as { conversations: Conversation[] };
      setConversations(data.conversations);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    return () => { abortRef.current?.abort(); };
  }, [fetchConversations, refreshTrigger]);

  // Escape key to close mobile sidebar
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="md:hidden fixed bottom-24 left-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary-600)] text-white shadow-lg"
        aria-label={isOpen ? 'Close conversation history' : 'Open conversation history'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>

      {/* Sidebar panel */}
      <div
        role={isOpen ? 'dialog' : undefined}
        aria-modal={isOpen ? 'true' : undefined}
        aria-label={isOpen ? 'Conversation history' : undefined}
        className={`
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
          fixed md:static
          inset-y-0 left-0 z-30
          w-72 md:w-64
          flex flex-col
          border-r border-[var(--surface-200)] bg-white
          transition-transform duration-200 ease-in-out
          md:rounded-xl md:border md:shadow-[var(--shadow-card)]
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--surface-200)] p-3">
          <h2 className="text-sm font-semibold text-[var(--surface-700)]">Conversations</h2>
          <button
            onClick={() => {
              onNewChat();
              setIsOpen(false);
            }}
            className="rounded-lg bg-[var(--primary-50)] px-3 py-1.5 text-xs font-medium text-[var(--primary-700)] hover:bg-[var(--primary-100)] transition-colors"
          >
            + New Chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-[var(--surface-400)]">Loading...</span>
            </div>
          )}

          {!isLoading && fetchError && (
            <div className="px-3 py-8 text-center">
              <p className="text-xs text-[var(--surface-500)]">Couldn&apos;t load conversations</p>
              <button
                onClick={fetchConversations}
                className="mt-2 text-xs font-medium text-[var(--primary-600)] hover:text-[var(--primary-700)] transition-colors"
              >
                Tap to retry
              </button>
            </div>
          )}

          {!isLoading && !fetchError && conversations.length === 0 && (
            <div className="px-3 py-8 text-center">
              <p className="text-xs text-[var(--surface-400)]">No conversations yet</p>
              <p className="mt-1 text-xs text-[var(--surface-300)]">Start chatting with CribAI</p>
            </div>
          )}

          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => {
                onSelectConversation(conv.id);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-3 text-left border-b border-[var(--surface-100)] hover:bg-[var(--surface-50)] transition-colors ${
                activeConversationId === conv.id ? 'bg-[var(--primary-50)]' : ''
              }`}
            >
              <p className="truncate text-sm font-medium text-[var(--surface-800)]">
                {conv.title}
              </p>
              {conv.lastMessagePreview && (
                <p className="mt-0.5 truncate text-xs text-[var(--surface-400)]">
                  {conv.lastMessagePreview}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
