'use client';

import { useCallback, useState } from 'react';
import type { FirstSaveAnalysis, RankCompareResult } from '@campusnest/ai';
import type { CrmUnit } from '@/lib/crm/proposed-types';
import { crmClient } from '@/lib/crm-client';

/**
 * The mock chat loop behind the "My Apartments" workspace.
 *
 * `send(text)` routes on the text shape:
 *  - a URL (`/^https?:\/\//i`)  → addListing → push a `saved-unit` card
 *                                 (resolved from listUnits by the returned id),
 *                                 then getAnalysis → push an `analysis` card.
 *  - /rank|compare/i            → rank('rank') → push a `rank` card.
 *  - anything else              → a canned assistant `text` reply.
 *
 * The user's own message is echoed immediately as a `text` bubble (role 'user')
 * so the thread reads naturally; the assistant response follows.
 *
 * All state writes use functional updaters so the two awaited pushes on the URL
 * path never clobber each other from a stale closure. Member ("added by")
 * resolution is intentionally kept OFF the critical path — SavedUnitCard renders
 * fine without it — so the saved-unit message lands promptly.
 */

/** A single rendered turn in the thread. Discriminated on `kind`. */
export type ChatMessage =
  | { id: string; kind: 'text'; role: 'user' | 'assistant'; text: string }
  | { id: string; kind: 'steering'; role: 'assistant'; text: string }
  | { id: string; kind: 'saved-unit'; role: 'assistant'; unit: CrmUnit }
  | { id: string; kind: 'analysis'; role: 'assistant'; analysis: FirstSaveAnalysis }
  | { id: string; kind: 'rank'; role: 'assistant'; result: RankCompareResult };

const URL_RE = /^https?:\/\//i;
const RANK_RE = /rank|compare/i;

const CANNED_REPLY =
  'I can add an apartment the moment you paste its link, or rank everything on your list — just say “rank my places.”';

let counter = 0;
const nextId = (): string => `m_${++counter}`;

export interface UseCrmChat {
  readonly messages: readonly ChatMessage[];
  send: (text: string) => void;
  readonly pending: boolean;
}

export function useCrmChat(): UseCrmChat {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [pending, setPending] = useState(false);

  const push = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      // Echo the user's message immediately.
      push({ id: nextId(), kind: 'text', role: 'user', text });
      setPending(true);

      void (async () => {
        try {
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
        } finally {
          setPending(false);
        }
      })();
    },
    [push],
  );

  return { messages, send, pending };
}
