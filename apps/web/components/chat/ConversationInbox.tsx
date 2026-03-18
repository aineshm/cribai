'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Conversation } from '@campusnest/types';
import { MessageSquare, Plus } from 'lucide-react';

interface ConversationInboxProps {
  readonly onSelectConversation: (id: string) => void;
  readonly onNewChat: () => void;
}

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? 'hour' : 'hours'} ago`;
  if (diffDay === 1) return 'Yesterday';

  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function SkeletonRow() {
  return (
    <div className="border-b border-gray-100 px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-16 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="mt-2 h-3 w-60 animate-pulse rounded bg-gray-100" />
    </div>
  );
}

export function ConversationInbox({
  onSelectConversation,
  onNewChat,
}: ConversationInboxProps) {
  const [conversations, setConversations] = useState<readonly Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchConversations]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5">
        <h1 className="text-lg font-semibold text-gray-900">Your Conversations</h1>
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 rounded-full bg-teal-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-900"
        >
          <Plus className="size-4" />
          New Chat
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {/* Error state */}
      {!isLoading && fetchError && (
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-gray-500">Could not load conversations</p>
          <button
            onClick={fetchConversations}
            className="mt-3 text-sm font-medium text-teal-700 transition-colors hover:text-teal-800"
          >
            Tap to retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !fetchError && conversations.length === 0 && (
        <div className="flex flex-col items-center px-4 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <MessageSquare className="size-7 text-gray-400" />
          </div>
          <p className="mt-4 text-sm font-medium text-gray-700">
            No conversations yet
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Start chatting with CribAI!
          </p>
          <button
            onClick={onNewChat}
            className="mt-5 flex items-center gap-1.5 rounded-full bg-teal-800 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-900"
          >
            <Plus className="size-4" />
            New Chat
          </button>
        </div>
      )}

      {/* Conversation list */}
      {!isLoading && !fetchError && conversations.length > 0 && (
        <div>
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className="w-full border-b border-gray-100 px-4 py-4 text-left transition-colors hover:bg-gray-50 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {conv.title}
                </p>
                <span className="shrink-0 text-xs text-gray-400">
                  {formatRelativeTime(conv.updatedAt)}
                </span>
              </div>
              {conv.lastMessagePreview && (
                <p className="mt-1 truncate text-xs text-gray-500">
                  {conv.lastMessagePreview}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
