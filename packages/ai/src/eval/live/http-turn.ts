/**
 * AIN-93 live-eval harness — HTTP turn client for `POST /api/ai/cribai`.
 *
 * Drives one real conversational turn against a running deployment (prod or
 * local) with a real Supabase Bearer token, reads the SSE response, and
 * returns the parsed events + a redacted transcript. This is the ONLY module
 * that touches the network in the harness — everything downstream (checks,
 * judge, runner) consumes its typed output.
 *
 * The SSE wire format (recon fact 1 / 8): `data: {json}\n\n` frames of type
 * `text | tool_call | tool_result | mission_* | done | error`. There is no
 * `[DONE]` sentinel — the stream simply ends. Malformed lines are skipped
 * rather than throwing, so one bad frame doesn't kill the whole turn.
 */

import { randomUUID } from 'node:crypto';
import type { ChatEvent } from '../../cribai';

/** The route's error frame shape — not part of `ChatEvent` (that's the in-process type). */
export interface LiveErrorEvent {
  readonly type: 'error';
  readonly message: string;
}

/** Every SSE frame the live route can emit. */
export type LiveSseEvent = ChatEvent | LiveErrorEvent;

const SSE_CONTENT_TYPE = 'text/event-stream';

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

function parseFrame(data: string): LiveSseEvent | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
      return parsed as LiveSseEvent;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Read an SSE response body and yield parsed `data:` frames. Skips any line
 * that isn't a `data:` line and any frame whose JSON fails to parse or lacks
 * a `type` field — malformed input degrades to "skip", never a thrown error.
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<LiveSseEvent> {
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
        const event = parseFrame(line.slice(6));
        if (event) yield event;
      }
    }

    // Flush a final line the server sent without a trailing newline.
    const tail = buffer + decoder.decode();
    if (tail.startsWith('data: ')) {
      const event = parseFrame(tail.slice(6));
      if (event) yield event;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// postTurn
// ---------------------------------------------------------------------------

export interface HistoryTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface PostTurnOptions {
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly query: string;
  readonly campusSlug: string;
  readonly conversationId?: string;
  readonly history?: readonly HistoryTurn[];
  /** Self-generated per-turn correlator; generated when omitted. */
  readonly requestId?: string;
  /** DI seam for tests — defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

export interface TurnResult {
  readonly requestId: string;
  readonly httpStatus: number;
  readonly events: readonly LiveSseEvent[];
  /**
   * Redacted transcript for failure reports — the JSON-stringified event
   * stream only. NEVER includes request headers, so an access token can't
   * leak into a report even if a caller forwards this field verbatim.
   */
  readonly transcript: string;
}

const CRM_SURFACE = 'crm' as const;

/** Cap on a synthesized error transcript excerpt (non-SSE error bodies). */
const ERROR_BODY_EXCERPT_MAX = 2000;

/**
 * POST one turn to `/api/ai/cribai` with `surface: 'crm'` and read the SSE
 * response to completion. Non-streaming responses (e.g. a 400/503 JSON error
 * body) are read as text and synthesized into a single `error` event so
 * every caller has one uniform `events` surface to check.
 */
export async function postTurn(options: PostTurnOptions): Promise<TurnResult> {
  const requestId = options.requestId ?? randomUUID();
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl(`${options.baseUrl}/api/ai/cribai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.accessToken}`,
      'x-request-id': requestId,
    },
    body: JSON.stringify({
      query: options.query,
      campusSlug: options.campusSlug,
      ...(options.conversationId ? { conversationId: options.conversationId } : {}),
      ...(options.history ? { history: options.history } : {}),
      surface: CRM_SURFACE,
    }),
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes(SSE_CONTENT_TYPE) || !response.body) {
    const text = await response.text();
    const events: LiveSseEvent[] = response.ok
      ? []
      : [{ type: 'error', message: text.slice(0, ERROR_BODY_EXCERPT_MAX) }];
    return { requestId, httpStatus: response.status, events, transcript: text };
  }

  const events: LiveSseEvent[] = [];
  const transcriptLines: string[] = [];
  for await (const event of parseSseStream(response.body)) {
    events.push(event);
    transcriptLines.push(JSON.stringify(event));
  }

  return {
    requestId,
    httpStatus: response.status,
    events,
    transcript: transcriptLines.join('\n'),
  };
}
