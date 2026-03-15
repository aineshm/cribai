'use client';

/**
 * ChatProvider — lightweight context for the CribAI chat panel.
 *
 * Manages Sheet open/close state, campus slug, and mission proposal
 * state. All message rendering, streaming, and persistence now live
 * in CribAIChat — this provider no longer duplicates that logic.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { createClient } from '@campusnest/supabase/client';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Shape of a mission proposal received via SSE. */
interface PendingProposal {
  readonly intent: string;
  readonly confidence: number;
  readonly extractedFields: Record<string, unknown>;
}

interface ChatContextValue {
  readonly open: boolean;
  readonly campusSlug: string;
  readonly pendingProposal: PendingProposal | null;
  readonly missionError: string | null;
  readonly setOpen: (open: boolean) => void;
  readonly confirmMission: () => Promise<void>;
  readonly dismissProposal: () => void;
  readonly setPendingProposal: (proposal: PendingProposal | null) => void;
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
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const [missionError, setMissionError] = useState<string | null>(null);

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
        campusSlug,
        pendingProposal,
        missionError,
        setOpen,
        confirmMission,
        dismissProposal,
        setPendingProposal,
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
