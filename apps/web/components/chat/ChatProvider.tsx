'use client';

/**
 * ChatProvider — context for the CribAI chat panel.
 *
 * Handles SSE streaming from /api/ai/cribai, stores chat messages
 * with structured ChatBlock[] content, and bridges mission_proposal
 * events into the Concierge sidebar via the onMissionCreated callback.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import { createClient } from '@campusnest/supabase/client';
import type { ChatBlock } from '@campusnest/types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly blocks: readonly ChatBlock[];
}

/** Shape of a mission proposal received via SSE. */
interface PendingProposal {
  readonly intent: string;
  readonly confidence: number;
  readonly extractedFields: Record<string, unknown>;
}

interface ChatContextValue {
  readonly open: boolean;
  readonly messages: readonly ChatMessage[];
  readonly loading: boolean;
  readonly campusSlug: string;
  readonly pendingProposal: PendingProposal | null;
  readonly missionError: string | null;
  readonly setOpen: (open: boolean) => void;
  readonly sendMessage: (text: string) => Promise<void>;
  readonly confirmMission: () => Promise<void>;
  readonly dismissProposal: () => void;
}

/* ------------------------------------------------------------------ */
/*  SSE event shape from /api/ai/cribai                               */
/* ------------------------------------------------------------------ */

interface SSEEvent {
  readonly type: string;
  readonly content?: string;
  readonly message?: string;
  readonly name?: string;
  readonly args?: Record<string, unknown>;
  readonly block?: ChatBlock;
  readonly intent?: string;
  readonly confidence?: number;
  readonly extractedFields?: Record<string, unknown>;
  readonly missionId?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Extract text-only history for the Gemini API (role mapped to user/assistant) */
function buildHistory(
  messages: readonly ChatMessage[]
): readonly { role: 'user' | 'assistant'; content: string }[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.blocks
      .filter((b): b is ChatBlock & { type: 'text' } => b.type === 'text')
      .map((b) => b.content)
      .join('\n'),
  }));
}

/** Replace a message by ID, returning a new array (immutable) */
function replaceMessage(
  messages: readonly ChatMessage[],
  id: string,
  updater: (msg: ChatMessage) => ChatMessage
): readonly ChatMessage[] {
  return messages.map((m) => (m.id === id ? updater(m) : m));
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const ChatContext = createContext<ChatContextValue | null>(null);

interface ChatProviderProps {
  readonly children: ReactNode;
  readonly campusSlug?: string;
  readonly onMissionCreated?: (missionId: string) => void;
}

export function ChatProvider({
  children,
  campusSlug = '',
  onMissionCreated,
}: ChatProviderProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const [missionError, setMissionError] = useState<string | null>(null);

  // Ref to access latest messages inside the streaming loop without stale closures
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // --- Conversation persistence ---
  const conversationIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);

  /** Resolve campus UUID from slug (cached in ref) */
  const campusIdRef = useRef<string | null>(null);
  const resolveCampusId = useCallback(async (): Promise<string | null> => {
    if (campusIdRef.current) return campusIdRef.current;
    if (!campusSlug) return null;
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('campus_configs')
        .select('id')
        .eq('slug', campusSlug)
        .single();
      if (data?.id) {
        campusIdRef.current = data.id as string;
        return campusIdRef.current;
      }
    } catch {
      // Non-critical — persistence won't work without campus ID
    }
    return null;
  }, [campusSlug]);

  /** Create a new conversation and store its ID */
  const ensureConversation = useCallback(async (title: string): Promise<string | null> => {
    if (conversationIdRef.current) return conversationIdRef.current;
    const campusId = await resolveCampusId();
    if (!campusId) return null;
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campusId, title }),
      });
      if (res.ok) {
        const data = await res.json() as { id: string };
        conversationIdRef.current = data.id;
        return data.id;
      }
    } catch {
      // Non-critical — chat still works without persistence
    }
    return null;
  }, [resolveCampusId]);

  /** Fire-and-forget save of a message to the conversation */
  const saveMessage = useCallback(
    (convId: string, role: 'user' | 'assistant', blocks: readonly ChatBlock[]) => {
      fetch(`/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, blocks }),
      }).catch(() => {
        // Non-critical — silent failure, chat still works
      });
    },
    []
  );

  // Reset chat state when campus changes so stale refs don't leak across campuses
  useEffect(() => {
    conversationIdRef.current = null;
    campusIdRef.current = null;
    loadedRef.current = false;
    setMessages([]);
  }, [campusSlug]);

  /** On mount (or campus change), load the most recent conversation's messages */
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    async function loadRecent() {
      try {
        // Resolve campus ID first so we can filter conversations by campus
        const campusId = await resolveCampusId();
        const url = campusId
          ? `/api/conversations?campus_id=${encodeURIComponent(campusId)}`
          : '/api/conversations';
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json() as {
          conversations: readonly { id: string; title: string }[];
        };
        if (!data.conversations || data.conversations.length === 0) return;

        const mostRecent = data.conversations[0];
        if (!mostRecent) return;
        conversationIdRef.current = mostRecent.id;

        // Fetch messages for this conversation
        const msgRes = await fetch(`/api/conversations/${mostRecent.id}`);
        if (!msgRes.ok) return;
        const msgData = await msgRes.json() as {
          messages?: readonly { id: string; role: 'user' | 'assistant'; blocks: ChatBlock[] }[];
        };
        if (!msgData.messages || msgData.messages.length === 0) return;

        const loadedMessages: ChatMessage[] = msgData.messages.map((m) => ({
          id: m.id,
          role: m.role,
          blocks: m.blocks,
        }));
        setMessages(loadedMessages);
      } catch {
        // Non-critical — start with empty chat
      }
    }

    void loadRecent();
  }, [campusSlug, resolveCampusId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // --- Add user message ------------------------------------------------
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      blocks: [{ type: 'text', content: text.trim() }],
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    // --- Placeholder assistant message -----------------------------------
    const assistantId = `assistant-${Date.now()}`;
    const placeholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      blocks: [],
    };
    setMessages((prev) => [...prev, placeholder]);

    // Track assistant blocks locally to avoid React state race on persist
    const localNonTextBlocks: ChatBlock[] = [];

    try {
      // --- Get auth token (best-effort) ----------------------------------
      let authToken: string | null = null;
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        authToken = data.session?.access_token ?? null;
      } catch {
        // No auth — unauthenticated experience
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // --- Build conversation history ------------------------------------
      const history = buildHistory(messagesRef.current.filter(
        (m) => m.id !== assistantId
      ));

      // --- Fetch SSE stream ----------------------------------------------
      const res = await fetch('/api/ai/cribai', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: text.trim(),
          campusSlug,
          history,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`);
      }

      // --- Parse SSE events ----------------------------------------------
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(line.slice(6)) as SSEEvent;
          } catch {
            continue;
          }

          switch (event.type) {
            case 'text': {
              if (!event.content) break;
              accumulatedText += event.content;
              const snapshot = accumulatedText;
              setMessages((prev) =>
                replaceMessage(prev, assistantId, (msg) => {
                  // Replace or append the text block (always last text block)
                  const nonTextBlocks = msg.blocks.filter((b) => b.type !== 'text');
                  return {
                    ...msg,
                    blocks: [...nonTextBlocks, { type: 'text', content: snapshot }],
                  };
                })
              );
              break;
            }

            case 'tool_call': {
              // Show a loading indicator for the tool being called
              if (!event.name) break;
              const toolName = event.name;
              setMessages((prev) =>
                replaceMessage(prev, assistantId, (msg) => ({
                  ...msg,
                  blocks: [...msg.blocks, { type: 'tool_loading', toolName }],
                }))
              );
              break;
            }

            case 'tool_result': {
              // Replace the tool_loading block with the actual result block
              if (!event.block) break;
              const resultBlock = event.block;
              localNonTextBlocks.push(resultBlock);
              setMessages((prev) =>
                replaceMessage(prev, assistantId, (msg) => {
                  // Remove the most recent tool_loading block for this tool
                  const blocks = [...msg.blocks];
                  let loadingIdx = -1;
                  for (let j = blocks.length - 1; j >= 0; j--) {
                    if (blocks[j]?.type === 'tool_loading') {
                      loadingIdx = j;
                      break;
                    }
                  }
                  if (loadingIdx >= 0) {
                    blocks.splice(loadingIdx, 1, resultBlock);
                  } else {
                    blocks.push(resultBlock);
                  }
                  return { ...msg, blocks };
                })
              );
              break;
            }

            case 'mission_proposal': {
              // Store proposal for user confirmation — does not break the stream
              setPendingProposal({
                intent: event.intent ?? '',
                confidence: event.confidence ?? 0,
                extractedFields: event.extractedFields ?? {},
              });
              break;
            }

            case 'mission_created': {
              // Server already created the mission — notify parent and clear proposal
              if (event.missionId) {
                onMissionCreated?.(event.missionId);
              }
              setPendingProposal(null);
              break;
            }

            case 'done':
              break;

            case 'error': {
              const errorText = event.message ?? 'An error occurred.';
              setMessages((prev) =>
                replaceMessage(prev, assistantId, (msg) => ({
                  ...msg,
                  blocks: [...msg.blocks, { type: 'text', content: errorText }],
                }))
              );
              break;
            }
          }
        }
      }

      // --- Persist messages (fire-and-forget) ---
      // Build final blocks from local variables (not React state) to avoid race condition
      const finalBlocks: ChatBlock[] = [
        ...localNonTextBlocks,
        ...(accumulatedText ? [{ type: 'text' as const, content: accumulatedText }] : []),
      ];
      const convId = await ensureConversation(text.trim().slice(0, 80));
      if (convId) {
        saveMessage(convId, 'user', userMessage.blocks);
        if (finalBlocks.length > 0) {
          saveMessage(convId, 'assistant', finalBlocks);
        }
      }
    } catch (err) {
      const errorText =
        err instanceof Error ? err.message : 'Failed to reach AI.';
      setMessages((prev) =>
        replaceMessage(prev, assistantId, (msg) => ({
          ...msg,
          blocks: [{ type: 'text', content: errorText }],
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [campusSlug, onMissionCreated, ensureConversation, saveMessage]);

  /**
   * confirmMission — POST to /api/missions to create the proposed mission.
   * On success, notifies parent via onMissionCreated and clears the proposal.
   */
  const confirmMission = useCallback(async () => {
    if (!pendingProposal) return;
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const missionHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        missionHeaders['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: missionHeaders,
        body: JSON.stringify({
          type: pendingProposal.intent,
          title: pendingProposal.intent.replace(/_/g, ' '),
          goal: `${pendingProposal.intent.replace(/_/g, ' ')} mission`,
          input: pendingProposal.extractedFields,
          campus_slug: campusSlug,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { id: string };
        onMissionCreated?.(data.id);
        setPendingProposal(null);
        setMissionError(null);
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setMissionError(err.error ?? 'Failed to start mission. Please try again.');
      }
    } catch (err) {
      console.error('[ChatProvider] confirmMission failed:', err);
      setMissionError('Failed to start mission. Please try again.');
    }
  }, [pendingProposal, campusSlug, onMissionCreated]);

  /** dismissProposal — user declines the mission proposal and clears any error. */
  const dismissProposal = useCallback(() => {
    setPendingProposal(null);
    setMissionError(null);
  }, []);

  return (
    <ChatContext.Provider
      value={{
        open,
        messages,
        loading,
        campusSlug,
        pendingProposal,
        missionError,
        setOpen,
        sendMessage,
        confirmMission,
        dismissProposal,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return ctx;
}

/** Alias for use in non-chat components that need chat context. */
export const useChat = useChatContext;
