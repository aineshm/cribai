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
  useRef,
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
  readonly campusId: string | undefined;
  readonly isAuthenticated: boolean;
  readonly pendingProposal: PendingProposal | null;
  readonly missionError: string | null;
  readonly draftPrompt: string | null;
  readonly setOpen: (open: boolean) => void;
  readonly confirmMission: () => Promise<void>;
  readonly dismissProposal: () => void;
  readonly setPendingProposal: (proposal: PendingProposal | null) => void;
  readonly setDraftPrompt: (prompt: string | null) => void;
  readonly clearDraftPrompt: () => void;
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const ChatContext = createContext<ChatContextValue | null>(null);

interface ChatProviderProps {
  readonly children: ReactNode;
  readonly campusSlug?: string;
  readonly campusId?: string;
  readonly isAuthenticated?: boolean;
  readonly onMissionCreated?: (missionId: string) => void;
}

export function ChatProvider({
  children,
  campusSlug = '',
  campusId,
  isAuthenticated = false,
  onMissionCreated,
}: ChatProviderProps) {
  const [open, setOpen] = useState(false);
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState<string | null>(null);
  const isConfirmingRef = useRef(false);

  /**
   * confirmMission — POST to /api/missions to create the proposed mission.
   * On success, notifies parent via onMissionCreated and clears the proposal.
   */
  const confirmMission = useCallback(async () => {
    if (!pendingProposal || isConfirmingRef.current) return;
    isConfirmingRef.current = true;
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMissionError('You must be signed in to start a mission.');
        return;
      }
      const missionHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      };
      // Always provide campus_slug as fallback; prefer campusId if available
      const slug = campusSlug || 'uw-madison';
      const campusPayload = campusId
        ? { campusId, campus_slug: slug }
        : { campus_slug: slug };

      const intentLabel = pendingProposal.intent.replace(/_/g, ' ');
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: missionHeaders,
        body: JSON.stringify({
          type: pendingProposal.intent,
          title: intentLabel.charAt(0).toUpperCase() + intentLabel.slice(1),
          goal: `${intentLabel} mission`,
          input: pendingProposal.extractedFields,
          ...campusPayload,
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
    } finally {
      isConfirmingRef.current = false;
    }
  }, [pendingProposal, campusId, campusSlug, onMissionCreated]);

  /** dismissProposal — user declines the mission proposal and clears any error. */
  const dismissProposal = useCallback(() => {
    setPendingProposal(null);
    setMissionError(null);
  }, []);

  /** Wraps setPendingProposal to also clear stale missionError from previous proposals. */
  const setProposal = useCallback((proposal: PendingProposal | null) => {
    setPendingProposal(proposal);
    setMissionError(null);
  }, []);

  const clearDraftPrompt = useCallback(() => {
    setDraftPrompt(null);
  }, []);

  return (
    <ChatContext.Provider
      value={{
        open,
        campusSlug,
        campusId,
        isAuthenticated,
        pendingProposal,
        missionError,
        draftPrompt,
        setOpen,
        confirmMission,
        dismissProposal,
        setPendingProposal: setProposal,
        setDraftPrompt,
        clearDraftPrompt,
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
