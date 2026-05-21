/**
 * Per-request latency instrumentation for the CribAI chat runtime.
 *
 * AIN-19 / GH #66 — captures the lifecycle timestamps and tool-call summary
 * for every chat turn and persists one row to `ai_request_metrics` at the
 * end of the request. Mirrors the fire-and-forget pattern from
 * `tools/lib/agent-run-logger.ts`: the metrics write never blocks the
 * response and never throws.
 *
 * Designed to be reusable across both runtimes:
 *   - `runtime: 'deterministic'` — the current /api/ai/cribai/route.ts path
 *   - `runtime: 'llm_first'`     — AIN-8's Days 3-4 turn handler
 *
 * Recorder lifecycle (mirroring the request handler):
 *   const recorder = createRequestMetricsRecorder({ ...identity }, supabase);
 *   // ... at first model chunk:
 *   recorder.markFirstModelToken();
 *   // ... when a tool fires:
 *   recorder.recordToolCall('search_listings');
 *   recorder.markFirstToolResult();
 *   // ... last streamed token:
 *   recorder.markFinalAssistantMessage();
 *   // ... handler exit (success OR error):
 *   recorder.finish();                       // success
 *   recorder.finish({ errorKind: 'quota' });  // error path
 *
 * `markFirstModelToken` and `markFirstToolResult` are idempotent — only the
 * FIRST call stamps the timestamp. Subsequent calls are no-ops. This lets
 * callers invoke them unconditionally inside hot loops without an `if` check.
 *
 * `finish()` is also idempotent: calling it twice (e.g. from both a
 * try/finally and a catch) will only persist once.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type RuntimeKind = 'deterministic' | 'llm_first';

export interface RequestMetricsIdentity {
  readonly requestId: string;
  readonly userId?: string | null;
  readonly conversationId?: string | null;
  readonly runtime: RuntimeKind;
  /**
   * Optional pre-computed received-at timestamp. If omitted, the recorder
   * stamps `new Date()` at construction. Callers should construct the
   * recorder as the very first thing in the route handler so this is
   * accurate without needing to pass it explicitly.
   */
  readonly requestReceivedAt?: Date;
}

export interface FinishOptions {
  readonly errorKind?: string | null;
}

export interface RequestMetricsRecorder {
  readonly markFirstModelToken: () => void;
  readonly markFirstToolResult: () => void;
  readonly recordToolCall: (toolName: string) => void;
  readonly markFinalAssistantMessage: () => void;
  readonly finish: (options?: FinishOptions) => void;
  /** Test-only: snapshot of the current accumulated state. */
  readonly snapshot: () => RequestMetricsSnapshot;
}

export interface RequestMetricsSnapshot {
  readonly requestId: string;
  readonly userId: string | null;
  readonly conversationId: string | null;
  readonly runtime: RuntimeKind;
  readonly requestReceivedAt: Date;
  readonly firstModelTokenAt: Date | null;
  readonly firstToolResultAt: Date | null;
  readonly finalAssistantMessageAt: Date | null;
  readonly requestCompletedAt: Date | null;
  readonly toolStepCount: number;
  readonly toolsCalled: readonly string[];
  readonly errorKind: string | null;
  readonly finished: boolean;
}

interface RecorderState {
  firstModelTokenAt: Date | null;
  firstToolResultAt: Date | null;
  finalAssistantMessageAt: Date | null;
  requestCompletedAt: Date | null;
  toolStepCount: number;
  toolsCalled: string[];
  errorKind: string | null;
  finished: boolean;
}

/**
 * Minimal contract — accepts the real `SupabaseClient` or any object with a
 * compatible `.from(...).insert(...)` method (used for unit tests).
 */
export interface MetricsClient {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
}

export function createRequestMetricsRecorder(
  identity: RequestMetricsIdentity,
  client: MetricsClient | SupabaseClient | null,
): RequestMetricsRecorder {
  const requestReceivedAt = identity.requestReceivedAt ?? new Date();

  const state: RecorderState = {
    firstModelTokenAt: null,
    firstToolResultAt: null,
    finalAssistantMessageAt: null,
    requestCompletedAt: null,
    toolStepCount: 0,
    toolsCalled: [],
    errorKind: null,
    finished: false,
  };

  const markFirstModelToken = (): void => {
    if (state.firstModelTokenAt === null) {
      state.firstModelTokenAt = new Date();
    }
  };

  const markFirstToolResult = (): void => {
    if (state.firstToolResultAt === null) {
      state.firstToolResultAt = new Date();
    }
  };

  const recordToolCall = (toolName: string): void => {
    if (typeof toolName !== 'string' || toolName.length === 0) {
      return;
    }
    state.toolStepCount += 1;
    state.toolsCalled.push(toolName);
  };

  const markFinalAssistantMessage = (): void => {
    state.finalAssistantMessageAt = new Date();
  };

  const finish = (options?: FinishOptions): void => {
    if (state.finished) return;
    state.finished = true;
    state.requestCompletedAt = new Date();
    if (options?.errorKind) {
      state.errorKind = options.errorKind;
    }

    // No client = no-op (e.g. unit tests, misconfigured env). The recorder
    // tracking still works; the persist step is the only thing that
    // requires a live Supabase connection.
    if (!client) return;

    const row = {
      request_id: identity.requestId,
      user_id: identity.userId ?? null,
      conversation_id: identity.conversationId ?? null,
      runtime: identity.runtime,
      request_received_at: requestReceivedAt.toISOString(),
      first_model_token_at: state.firstModelTokenAt?.toISOString() ?? null,
      first_tool_result_at: state.firstToolResultAt?.toISOString() ?? null,
      final_assistant_message_at: state.finalAssistantMessageAt?.toISOString() ?? null,
      request_completed_at: state.requestCompletedAt.toISOString(),
      tool_step_count: state.toolStepCount,
      tools_called: state.toolsCalled,
      error_kind: state.errorKind,
    };

    // Fire-and-forget: intentionally not awaited. Mirrors agent-run-logger.
    void (async () => {
      try {
        const { error } = await (client as MetricsClient).from('ai_request_metrics').insert(row);
        if (error) {
          console.error('[ai-request-metrics] insert failed:', error.message);
        }
      } catch (err: unknown) {
        console.error('[ai-request-metrics] unexpected error:', err);
      }
    })();
  };

  const snapshot = (): RequestMetricsSnapshot => ({
    requestId: identity.requestId,
    userId: identity.userId ?? null,
    conversationId: identity.conversationId ?? null,
    runtime: identity.runtime,
    requestReceivedAt,
    firstModelTokenAt: state.firstModelTokenAt,
    firstToolResultAt: state.firstToolResultAt,
    finalAssistantMessageAt: state.finalAssistantMessageAt,
    requestCompletedAt: state.requestCompletedAt,
    toolStepCount: state.toolStepCount,
    toolsCalled: [...state.toolsCalled],
    errorKind: state.errorKind,
    finished: state.finished,
  });

  return {
    markFirstModelToken,
    markFirstToolResult,
    recordToolCall,
    markFinalAssistantMessage,
    finish,
    snapshot,
  };
}

/**
 * Generate a request correlator. Accepts an optional inbound header value
 * (e.g. `x-request-id`) — if non-empty, it's used verbatim so traces from
 * upstream proxies stitch through. Otherwise generates a fresh UUID.
 */
export function resolveRequestId(inboundHeaderValue: string | null | undefined): string {
  if (typeof inboundHeaderValue === 'string') {
    const trimmed = inboundHeaderValue.trim();
    if (trimmed.length > 0 && trimmed.length <= 200) {
      return trimmed;
    }
  }
  // crypto.randomUUID is available in Node 20+ and the Edge runtime.
  return globalThis.crypto.randomUUID();
}
