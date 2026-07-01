/**
 * CRM chat ↔ LLM-first runtime SSE seam (AIN-65).
 *
 * Pure helpers the `useCrmChat` hook composes for its REAL send() path:
 *
 *  - `readCrmSseEvents`     — turns the /api/ai/cribai response body into a
 *                             stream of parsed `data:` events (browser-safe
 *                             getReader() loop, mirrors cribai-chat.tsx).
 *  - `messagesFromToolResult` — maps a `tool_result` event's `machineData`
 *                             (CrmMachineData union, PR #91) onto ChatMessage
 *                             card kinds; absence of recognized machineData
 *                             degrades to the plain-text block (sign-in gate,
 *                             errors, legacy tools).
 *  - `projectHistory`       — text-projects the rendered thread into the
 *                             `{role, content}` history turns the route's
 *                             parseHistory accepts.
 *
 * All payload checks are defensive: events come from our own server, but the
 * thread must degrade to text — never crash — on unexpected shapes.
 */
import type { CrmListingRow, FirstSaveAnalysis, RankCompareResult } from '@campusnest/ai';
import type { ChatMessage } from './chat-messages';
import { toCrmUnit } from './to-crm-unit';

/** Parsed shape of one SSE `data:` event from /api/ai/cribai (subset). */
export interface CrmSseEvent {
  readonly type?: string;
  readonly content?: string;
  readonly text?: string;
  readonly name?: string;
  readonly block?: {
    readonly type?: string;
    readonly content?: string;
    /** listing_card / map blocks carry a listings array (legacy explore tools). */
    readonly listings?: readonly unknown[];
  };
  readonly machineData?: unknown;
  readonly message?: string;
}

/** A single text-projected history turn (the route's parseHistory contract). */
export interface HistoryTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEvent(data: string): CrmSseEvent | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return isRecord(parsed) ? (parsed as CrmSseEvent) : null;
  } catch {
    return null;
  }
}

/**
 * Read the SSE response body and yield parsed `data:` events. Uses an
 * explicit `getReader()` loop (NOT for-await over the stream) so it works in
 * every browser. `[DONE]`, comments, and malformed JSON are skipped.
 */
export async function* readCrmSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<CrmSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        const event = parseEvent(data);
        if (event) yield event;
      }
    }

    // Flush any complete trailing line the server sent without a final \n.
    const tail = buffer + decoder.decode();
    if (tail.startsWith('data: ') && tail.slice(6) !== '[DONE]') {
      const event = parseEvent(tail.slice(6));
      if (event) yield event;
    }
  } finally {
    // Early generator exit (error event, consumer break) must cancel the body,
    // not just release the lock — releaseLock alone leaves the stream open.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Narrow an unknown machineData payload to a CrmListingRow-bearing add_listing. */
function asSavedListing(md: Record<string, unknown>): CrmListingRow | null {
  const listing = md.listing;
  return isRecord(listing) && typeof listing.id === 'string'
    ? (listing as unknown as CrmListingRow)
    : null;
}

function asAnalysis(md: Record<string, unknown>): FirstSaveAnalysis | null {
  const analysis = md.analysis;
  return isRecord(analysis) && typeof analysis.listingId === 'string'
    ? (analysis as unknown as FirstSaveAnalysis)
    : null;
}

function asRankResult(md: Record<string, unknown>): RankCompareResult | null {
  const result = md.result;
  if (!isRecord(result)) return null;
  if (result.mode === 'rank' && Array.isArray(result.ranked)) {
    return result as unknown as RankCompareResult;
  }
  if (result.mode === 'compare' && Array.isArray(result.rows)) {
    return result as unknown as RankCompareResult;
  }
  return null;
}

/** The steering question text, when that fanout branch actually landed. */
function steeringQuestionOf(analysis: FirstSaveAnalysis): string | null {
  const branch = analysis.steeringQuestion;
  return branch?.status === 'ok' && typeof branch.data?.question === 'string'
    ? branch.data.question
    : null;
}

/**
 * Fall back to the tool's plain-text client block. Non-text blocks (the
 * legacy explore tools' listing_card/map cards have no CRM renderer) degrade
 * to an honest text stub instead of vanishing — "find me apartments" in CRM
 * chat must not execute a search and render nothing (review M2). An EMPTY
 * result block still renders nothing: the model's prose covers no-results.
 */
function textFallback(event: CrmSseEvent, nextId: () => string): readonly ChatMessage[] {
  const block = event.block;
  if (block?.type === 'text' && typeof block.content === 'string' && block.content.trim()) {
    return [{ id: nextId(), kind: 'text', role: 'assistant', text: block.content }];
  }
  if (
    (block?.type === 'listing_card' || block?.type === 'map') &&
    Array.isArray(block.listings) &&
    block.listings.length > 0
  ) {
    const n = block.listings.length;
    return [
      {
        id: nextId(),
        kind: 'text',
        role: 'assistant',
        text: `Found ${n} listing${n === 1 ? '' : 's'} — open the Explore page to view ${n === 1 ? 'it' : 'them'} on the map.`,
      },
    ];
  }
  return [];
}

/**
 * Map one `tool_result` SSE event onto thread messages:
 *   machineData.kind 'add_listing'         → saved-unit card (row → toCrmUnit)
 *   machineData.kind 'first_save_analysis' → analysis card (+ steering bubble
 *                                            when the question branch landed)
 *   machineData.kind 'rank_compare'        → rank card (both unions)
 *   anything else                          → the text block, or nothing
 */
export function messagesFromToolResult(
  event: CrmSseEvent,
  viewerId: string,
  nextId: () => string,
): readonly ChatMessage[] {
  const md = event.machineData;
  if (!isRecord(md) || typeof md.kind !== 'string') return textFallback(event, nextId);

  // Model-controlled card gate (show_card wave): false = the model chose prose;
  // its streamed text carries the answer, so emit nothing for this tool result.
  if (md.show_card === false) return [];

  switch (md.kind) {
    case 'add_listing': {
      const listing = asSavedListing(md);
      // Read-back failures / dry-runs ship listing:null — degrade to text.
      if (!listing) return textFallback(event, nextId);
      return [
        {
          id: nextId(),
          kind: 'saved-unit',
          role: 'assistant',
          unit: toCrmUnit(listing, viewerId),
        },
      ];
    }
    case 'first_save_analysis': {
      const analysis = asAnalysis(md);
      if (!analysis) return textFallback(event, nextId);
      const question = steeringQuestionOf(analysis);
      const analysisMessage: ChatMessage = {
        id: nextId(),
        kind: 'analysis',
        role: 'assistant',
        analysis,
      };
      if (!question) return [analysisMessage];
      return [
        analysisMessage,
        { id: nextId(), kind: 'steering', role: 'assistant', text: question },
      ];
    }
    case 'rank_compare': {
      const result = asRankResult(md);
      if (!result) return textFallback(event, nextId);
      return [{ id: nextId(), kind: 'rank', role: 'assistant', result }];
    }
    default:
      // infer_profile + future kinds have no card yet — degrade to text.
      return textFallback(event, nextId);
  }
}

/** Short text stand-in for a card when projecting the thread to history. */
function projectText(message: ChatMessage): string {
  switch (message.kind) {
    case 'text':
    case 'steering':
      return message.text;
    case 'saved-unit':
      return `[Saved listing card: ${message.unit.title ?? message.unit.address ?? message.unit.id}]`;
    case 'analysis':
      return '[First-save analysis card shown]';
    case 'rank':
      return message.result.mode === 'rank'
        ? '[Ranking card shown]'
        : '[Comparison card shown]';
  }
}

/**
 * Text-project the rendered thread into history turns for the runtime route.
 * Whitespace-only turns are dropped (the route would discard them anyway).
 */
export function projectHistory(messages: readonly ChatMessage[]): readonly HistoryTurn[] {
  return messages
    .map((message) => ({ role: message.role, content: projectText(message) }))
    .filter((turn) => turn.content.trim().length > 0);
}
