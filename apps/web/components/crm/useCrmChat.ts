'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@campusnest/supabase/client';
import { crmClient } from '@/lib/crm-client';
import type { ChatMessage } from '@/lib/crm/chat-messages';
import {
  messagesFromToolResult,
  projectHistory,
  readCrmSseEvents,
} from '@/lib/crm/chat-stream';

/**
 * The chat loop behind the "My Apartments" workspace (AIN-65).
 *
 * Two modes, flipped by NEXT_PUBLIC_CRM_MOCK (same contract as crm-client):
 *
 *  MOCK (default — anything other than the literal 'false'):
 *   `send(text)` routes on the text shape:
 *    - a URL (`/^https?:\/\//i`)  → addListing → push a `saved-unit` card
 *                                   (resolved from listUnits by the returned
 *                                   id), then getAnalysis → push an `analysis`
 *                                   card.
 *    - /rank|compare/i            → rank('rank') → push a `rank` card.
 *    - anything else              → a canned assistant `text` reply.
 *
 *  REAL ('false'):
 *   `send(text)` POSTs /api/ai/cribai with `surface: 'crm'` + Bearer auth and
 *   maps the SSE stream onto ChatMessage kinds (see lib/crm/chat-stream.ts):
 *   streamed `text` deltas accumulate into one bubble; `tool_result`
 *   machineData fans out to saved-unit / analysis(+steering) / rank cards;
 *   unrecognized tool results degrade to their text block; `error` events and
 *   transport failures render as inline error bubbles. Mission events are
 *   ignored on this surface (v1) and conversations are ephemeral (no
 *   conversationId is ever sent).
 *
 * The user's own message is echoed immediately as a `text` bubble (role
 * 'user') so the thread reads naturally; the assistant response follows. All
 * state writes use functional updaters so awaited pushes never clobber each
 * other from a stale closure.
 */

export type { ChatMessage } from '@/lib/crm/chat-messages';

const URL_RE = /^https?:\/\//i;
const RANK_RE = /rank|compare/i;

const CANNED_REPLY =
  'I can add an apartment the moment you paste its link, or rank everything on your list — just say “rank my places.”';

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/** The CRM workspace is single-campus in v1 (PDR-003). */
const CAMPUS_SLUG = 'uw-madison';

/** Mirror the explore chat: send at most the last ~10 turns as history. */
const MAX_HISTORY_TURNS = 10;

let counter = 0;
const nextId = (): string => `m_${++counter}`;

/** Read at call time (not module scope) so tests can stub the env per-case. */
const isMockMode = (): boolean => process.env.NEXT_PUBLIC_CRM_MOCK !== 'false';

export interface UseCrmChat {
  readonly messages: readonly ChatMessage[];
  send: (text: string) => void;
  readonly pending: boolean;
  /** Name of the tool currently executing server-side (real mode only). */
  readonly pendingTool: string | null;
  /**
   * Propagate a successful inline rename (UnitDetailDrawer's `onRenamed`) into
   * the thread: the `saved-unit` message carrying that unit gets its
   * `nickname` / display building immutably updated in place, so the card
   * re-renders with the new name without a reload or refetch (AIN-95 follow-up).
   */
  renameUnit: (id: string, nickname: string) => void;
}

export function useCrmChat(): UseCrmChat {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [pendingTool, setPendingTool] = useState<string | null>(null);

  // Thread snapshot for history projection — refreshed after every render so
  // send() sees the latest committed thread without re-memoizing on it.
  const messagesRef = useRef<readonly ChatMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Synchronous in-flight guard (state `pending` lags a render) + per-turn
  // abort. Mirrors cribai-chat.tsx: one turn at a time, abort on unmount so a
  // mid-stream navigation doesn't leave the fetch streaming into a dead hook.
  const pendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const push = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const renameUnit = useCallback((id: string, nickname: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.kind === 'saved-unit' && m.unit.id === id
          ? {
              ...m,
              unit: {
                ...m.unit,
                nickname,
                _proposed: {
                  ...m.unit._proposed,
                  unit: { ...m.unit._proposed.unit, building: nickname },
                },
              },
            }
          : m,
      ),
    );
  }, []);

  /** Insert-or-replace by id — used for the streaming assistant text bubble. */
  const upsert = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === msg.id);
      if (index === -1) return [...prev, msg];
      return [...prev.slice(0, index), msg, ...prev.slice(index + 1)];
    });
  }, []);

  /** The original fixture-backed loop — tests + dev default depend on it. */
  const runMockTurn = useCallback(
    async (text: string) => {
      if (URL_RE.test(text)) {
        const result = await crmClient.addListing(text);
        const units = await crmClient.listUnits();
        const saved = units.find((u) => u.id === result.listingId) ?? units[0];
        if (saved) {
          push({ id: nextId(), kind: 'saved-unit', role: 'assistant', unit: saved });
        }
        const analysis = await crmClient.getAnalysis(result.listingId);
        push({ id: nextId(), kind: 'analysis', role: 'assistant', analysis });
        return;
      }

      if (RANK_RE.test(text)) {
        const ranked = await crmClient.rank('rank');
        push({ id: nextId(), kind: 'rank', role: 'assistant', result: ranked });
        return;
      }

      push({ id: nextId(), kind: 'text', role: 'assistant', text: CANNED_REPLY });
    },
    [push],
  );

  /** Real mode — one LLM-first runtime turn over SSE. */
  const runRealTurn = useCallback(
    async (query: string, thread: readonly ChatMessage[], signal: AbortSignal) => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const viewerId = session?.user?.id ?? '';

      // v1 is ephemeral — no conversationId, history is the rendered thread
      // text-projected (the user's new query travels separately as `query`).
      const response = await fetch('/api/ai/cribai', {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          query,
          campusSlug: CAMPUS_SLUG,
          history: projectHistory(thread).slice(-MAX_HISTORY_TURNS),
          surface: 'crm',
        }),
      });

      if (!response.ok) {
        let message = GENERIC_ERROR;
        try {
          const body = (await response.json()) as { error?: unknown };
          if (typeof body.error === 'string' && body.error) message = body.error;
        } catch {
          // Non-JSON error body — keep the generic message.
        }
        push({ id: nextId(), kind: 'text', role: 'assistant', text: `⚠ ${message}` });
        return;
      }
      if (!response.body) {
        throw new Error('No response stream');
      }

      // Streaming text accumulator — one bubble per uninterrupted text run.
      let textId: string | null = null;
      let textContent = '';
      const resetText = () => {
        textId = null;
        textContent = '';
      };

      for await (const event of readCrmSseEvents(response.body)) {
        if (event.type === 'error') {
          push({
            id: nextId(),
            kind: 'text',
            role: 'assistant',
            text: `⚠ ${event.message ?? GENERIC_ERROR}`,
          });
          return;
        }

        // Streamed prose: `{type:'text', content}` (runtime contract) with the
        // legacy bare `{text}` delta shape tolerated for parity w/ explore chat.
        const delta =
          event.type === 'text'
            ? (event.content ?? '')
            : !event.type && typeof event.text === 'string'
              ? event.text
              : null;
        if (delta !== null) {
          textContent += delta;
          textId = textId ?? nextId();
          upsert({ id: textId, kind: 'text', role: 'assistant', text: textContent });
          continue;
        }

        if (event.type === 'tool_call') {
          setPendingTool(event.name ?? null);
          resetText();
          continue;
        }

        if (event.type === 'tool_result') {
          setPendingTool(null);
          resetText();
          for (const msg of messagesFromToolResult(event, viewerId, nextId)) {
            push(msg);
          }
          continue;
        }

        // mission_proposal / mission_created / done / unknown — ignored on
        // the CRM surface in v1 (HITL missions stay on the explore chat).
      }
    },
    [push, upsert],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      // One turn at a time — a second Enter mid-stream is a no-op (the
      // composer is also disabled on `pending`, this is the belt to its braces).
      if (pendingRef.current) return;
      pendingRef.current = true;

      const thread = messagesRef.current;
      const controller = new AbortController();
      abortRef.current = controller;

      // Echo the user's message immediately.
      push({ id: nextId(), kind: 'text', role: 'user', text });
      setPending(true);

      void (async () => {
        try {
          if (isMockMode()) {
            await runMockTurn(text);
          } else {
            await runRealTurn(text, thread, controller.signal);
          }
        } catch (error) {
          // Unmount/abort is not an error — swallow silently (no state writes
          // either; the hook may already be gone).
          if (controller.signal.aborted) return;
          // Log the real error for diagnosis; show users a generic message
          // (raw Error.message can carry internals — review L2).
          console.error('[crm-chat] turn failed:', error);
          push({ id: nextId(), kind: 'text', role: 'assistant', text: `⚠ ${GENERIC_ERROR}` });
        } finally {
          pendingRef.current = false;
          if (!controller.signal.aborted) {
            setPending(false);
            setPendingTool(null);
          }
        }
      })();
    },
    [push, runMockTurn, runRealTurn],
  );

  return { messages, send, pending, pendingTool, renameUnit };
}
