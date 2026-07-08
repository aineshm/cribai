/**
 * The CRM chat thread message contract (AIN-65).
 *
 * One rendered turn in the "My Apartments" thread, discriminated on `kind`.
 * Lives in lib/crm (not the hook file) so the SSE mapping seam
 * (`chat-stream.ts`) and the hook (`useCrmChat.ts`) can both import it
 * without a components↔lib cycle. `useCrmChat` re-exports it for existing
 * consumers (CrmWorkspace).
 */
import type { FirstSaveAnalysis, RankCompareResult } from '@campusnest/ai';
import type { CrmUnit } from './proposed-types';

/** A single rendered turn in the thread. Discriminated on `kind`. */
export type ChatMessage =
  | {
      id: string;
      kind: 'text';
      role: 'user' | 'assistant';
      text: string;
      /**
       * Set on client-seeded messages (e.g. the AIN-104.2 first-run intro)
       * that never went through the LLM. `projectHistory` (chat-stream.ts)
       * excludes these from the turn history sent back to the runtime —
       * the model never "said" this, so it shouldn't see it as its own turn.
       */
      local?: true;
    }
  | { id: string; kind: 'steering'; role: 'assistant'; text: string }
  | { id: string; kind: 'saved-unit'; role: 'assistant'; unit: CrmUnit }
  | { id: string; kind: 'analysis'; role: 'assistant'; analysis: FirstSaveAnalysis }
  | { id: string; kind: 'rank'; role: 'assistant'; result: RankCompareResult };
