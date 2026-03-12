'use client';

/**
 * ChatProvider — context for the CribAI chat panel.
 *
 * Handles SSE streaming from /api/ai/cribai, stores chat messages,
 * and bridges mission_proposal events into the Concierge sidebar
 * via the onMissionCreated callback.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
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

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    const assistantId = `assistant-${Date.now()}`;
    const placeholderMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
    };
    setMessages((prev) => [...prev, placeholderMessage]);

    try {
      const res = await fetch('/api/ai/cribai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: text.trim(),
          campusSlug: campusSlug,
          history: [],
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
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
          const event = JSON.parse(line.slice(6)) as {
            type: string;
            content?: string;
            message?: string;
            intent?: string;
            confidence?: number;
            extractedFields?: Record<string, unknown>;
            missionId?: string;
          };
          if (event.type === 'text' && event.content) {
            accumulated += event.content;
            const snapshot = accumulated;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: snapshot } : m
              )
            );
          } else if (event.type === 'mission_proposal') {
            // Store proposal for user confirmation — does not break the stream
            setPendingProposal({
              intent: event.intent ?? '',
              confidence: event.confidence ?? 0,
              extractedFields: event.extractedFields ?? {},
            });
          } else if (event.type === 'mission_created') {
            // Server already created the mission — notify parent and clear proposal
            if (event.missionId) {
              onMissionCreated?.(event.missionId);
            }
            setPendingProposal(null);
          } else if (event.type === 'done') {
            break;
          } else if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: event.message ?? 'An error occurred.' }
                  : m
              )
            );
            break;
          }
        }
      }
    } catch (err) {
      const errorText =
        err instanceof Error ? err.message : 'Failed to reach CribAI.';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: errorText } : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [campusSlug, onMissionCreated]);

  /**
   * confirmMission — POST to /api/missions to create the proposed mission.
   * On success, notifies parent via onMissionCreated and clears the proposal.
   */
  const confirmMission = useCallback(async () => {
    if (!pendingProposal) return;
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
