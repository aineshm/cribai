import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRequestMetricsRecorder,
  resolveRequestId,
  type MetricsClient,
} from '../metrics';

interface MockClient extends MetricsClient {
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
}

function buildMockClient(opts: { failWith?: string | null; throwError?: boolean } = {}): MockClient {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  return {
    inserts,
    from(table: string) {
      return {
        insert: async (row: Record<string, unknown>) => {
          if (opts.throwError) {
            throw new Error('connection refused');
          }
          inserts.push({ table, row });
          return {
            error: opts.failWith ? { message: opts.failWith } : null,
          };
        },
      };
    },
  };
}

// Drain microtasks so the recorder's fire-and-forget insert promise resolves
// before the test asserts. The recorder intentionally does not await; tests do.
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createRequestMetricsRecorder', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists a row with the bookend timestamps and identity fields', async () => {
    const client = buildMockClient();
    const recorder = createRequestMetricsRecorder(
      {
        requestId: 'req-abc',
        userId: 'user-1',
        conversationId: 'conv-1',
        runtime: 'deterministic',
      },
      client,
    );

    recorder.finish();
    await flushAsync();

    expect(client.inserts).toHaveLength(1);
    const insert = client.inserts[0]!;
    expect(insert.table).toBe('ai_request_metrics');
    expect(insert.row.request_id).toBe('req-abc');
    expect(insert.row.user_id).toBe('user-1');
    expect(insert.row.conversation_id).toBe('conv-1');
    expect(insert.row.runtime).toBe('deterministic');
    expect(typeof insert.row.request_received_at).toBe('string');
    expect(typeof insert.row.request_completed_at).toBe('string');
  });

  it('stamps first_model_token_at only on the first call (idempotent)', () => {
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      null,
    );

    recorder.markFirstModelToken();
    const firstStamp = recorder.snapshot().firstModelTokenAt;
    expect(firstStamp).not.toBeNull();

    // Subsequent calls must NOT overwrite. Test by checking same instance.
    recorder.markFirstModelToken();
    recorder.markFirstModelToken();
    const secondStamp = recorder.snapshot().firstModelTokenAt;
    expect(secondStamp).toBe(firstStamp);
  });

  it('stamps first_tool_result_at only on the first call (idempotent)', () => {
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      null,
    );

    recorder.markFirstToolResult();
    const firstStamp = recorder.snapshot().firstToolResultAt;
    expect(firstStamp).not.toBeNull();

    recorder.markFirstToolResult();
    expect(recorder.snapshot().firstToolResultAt).toBe(firstStamp);
  });

  it('overwrites finalAssistantMessageAt on every call (last-token semantics)', async () => {
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      null,
    );

    recorder.markFinalAssistantMessage();
    const first = recorder.snapshot().finalAssistantMessageAt;
    await new Promise((r) => setTimeout(r, 2));
    recorder.markFinalAssistantMessage();
    const second = recorder.snapshot().finalAssistantMessageAt;

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect((second as Date).getTime()).toBeGreaterThanOrEqual((first as Date).getTime());
  });

  it('accumulates tools_called in invocation order and increments tool_step_count', async () => {
    const client = buildMockClient();
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      client,
    );

    recorder.recordToolCall('search_listings');
    recorder.recordToolCall('compare_listings');
    recorder.recordToolCall('schedule_tour');

    recorder.finish();
    await flushAsync();

    expect(client.inserts[0]!.row.tool_step_count).toBe(3);
    expect(client.inserts[0]!.row.tools_called).toEqual([
      'search_listings',
      'compare_listings',
      'schedule_tour',
    ]);
  });

  it('ignores empty / non-string tool names defensively', async () => {
    const client = buildMockClient();
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      client,
    );

    recorder.recordToolCall('');
    recorder.recordToolCall(undefined as unknown as string);
    recorder.recordToolCall('search_listings');

    recorder.finish();
    await flushAsync();

    expect(client.inserts[0]!.row.tool_step_count).toBe(1);
    expect(client.inserts[0]!.row.tools_called).toEqual(['search_listings']);
  });

  it('records error_kind when supplied to finish()', async () => {
    const client = buildMockClient();
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      client,
    );

    recorder.finish({ errorKind: 'gemini_quota' });
    await flushAsync();

    expect(client.inserts[0]!.row.error_kind).toBe('gemini_quota');
  });

  it('persists null for unset markers (e.g. no tools fired, no model tokens)', async () => {
    const client = buildMockClient();
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      client,
    );

    recorder.finish();
    await flushAsync();

    const row = client.inserts[0]!.row;
    expect(row.first_model_token_at).toBeNull();
    expect(row.first_tool_result_at).toBeNull();
    expect(row.final_assistant_message_at).toBeNull();
    expect(row.error_kind).toBeNull();
    expect(row.tools_called).toEqual([]);
    expect(row.tool_step_count).toBe(0);
  });

  it('finish() is idempotent — a second call does not double-insert', async () => {
    const client = buildMockClient();
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      client,
    );

    recorder.finish();
    recorder.finish({ errorKind: 'ignored' });
    await flushAsync();

    expect(client.inserts).toHaveLength(1);
    expect(client.inserts[0]!.row.error_kind).toBeNull();
  });

  it('no-ops gracefully when client is null (e.g. env misconfigured)', () => {
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      null,
    );

    expect(() => {
      recorder.markFirstModelToken();
      recorder.recordToolCall('search_listings');
      recorder.markFinalAssistantMessage();
      recorder.finish();
    }).not.toThrow();

    expect(recorder.snapshot().finished).toBe(true);
  });

  it('does not throw when the insert call throws synchronously inside the promise', async () => {
    const client = buildMockClient({ throwError: true });
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      client,
    );

    expect(() => recorder.finish()).not.toThrow();
    await flushAsync();

    expect(console.error).toHaveBeenCalledWith(
      '[ai-request-metrics] unexpected error:',
      expect.any(Error),
    );
  });

  it('logs to console.error when supabase returns an error', async () => {
    const client = buildMockClient({ failWith: 'permission denied' });
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      client,
    );

    recorder.finish();
    await flushAsync();

    expect(console.error).toHaveBeenCalledWith(
      '[ai-request-metrics] insert failed:',
      'permission denied',
    );
  });

  it('uses the provided requestReceivedAt when given', async () => {
    const client = buildMockClient();
    const fixed = new Date('2026-05-21T00:00:00.000Z');

    const recorder = createRequestMetricsRecorder(
      {
        requestId: 'r',
        runtime: 'deterministic',
        requestReceivedAt: fixed,
      },
      client,
    );

    recorder.finish();
    await flushAsync();

    expect(client.inserts[0]!.row.request_received_at).toBe(fixed.toISOString());
  });

  it('preserves ordering: requestReceivedAt <= firstModelTokenAt <= finalAssistantMessageAt <= requestCompletedAt', async () => {
    const client = buildMockClient();
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      client,
    );

    await new Promise((r) => setTimeout(r, 2));
    recorder.markFirstModelToken();
    await new Promise((r) => setTimeout(r, 2));
    recorder.markFirstToolResult();
    await new Promise((r) => setTimeout(r, 2));
    recorder.markFinalAssistantMessage();
    await new Promise((r) => setTimeout(r, 2));
    recorder.finish();
    await flushAsync();

    const row = client.inserts[0]!.row;
    const received = new Date(row.request_received_at as string).getTime();
    const firstTok = new Date(row.first_model_token_at as string).getTime();
    const firstTool = new Date(row.first_tool_result_at as string).getTime();
    const finalMsg = new Date(row.final_assistant_message_at as string).getTime();
    const completed = new Date(row.request_completed_at as string).getTime();

    expect(firstTok).toBeGreaterThanOrEqual(received);
    expect(firstTool).toBeGreaterThanOrEqual(firstTok);
    expect(finalMsg).toBeGreaterThanOrEqual(firstTool);
    expect(completed).toBeGreaterThanOrEqual(finalMsg);
  });

  it('markCompleted() stamps request_completed_at without persisting', async () => {
    const client = buildMockClient();
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      client,
    );

    recorder.markCompleted();
    expect(client.inserts).toHaveLength(0);
    expect(recorder.snapshot().requestCompletedAt).not.toBeNull();
    expect(recorder.snapshot().finished).toBe(false);
  });

  it('finish() after markCompleted() preserves the earlier completion timestamp', async () => {
    const client = buildMockClient();
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      client,
    );

    recorder.markCompleted();
    const stamped = recorder.snapshot().requestCompletedAt;
    await new Promise((r) => setTimeout(r, 3));
    recorder.finish();
    await flushAsync();

    expect(client.inserts).toHaveLength(1);
    expect(client.inserts[0]!.row.request_completed_at).toBe(stamped?.toISOString());
  });

  it('finish() with errorKind on the markCompleted-then-fail path still records error_kind', async () => {
    const client = buildMockClient();
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      client,
    );

    recorder.markCompleted();
    recorder.finish({ errorKind: 'deterministic_stream_error' });
    await flushAsync();

    expect(client.inserts).toHaveLength(1);
    expect(client.inserts[0]!.row.error_kind).toBe('deterministic_stream_error');
  });

  it('markCompleted() is idempotent — subsequent calls do not overwrite the timestamp', async () => {
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic' },
      null,
    );

    recorder.markCompleted();
    const first = recorder.snapshot().requestCompletedAt;
    await new Promise((r) => setTimeout(r, 2));
    recorder.markCompleted();
    expect(recorder.snapshot().requestCompletedAt).toBe(first);
  });

  it('setConversationId() late-binds the conversation id before finish()', async () => {
    const client = buildMockClient();
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic', conversationId: null },
      client,
    );

    recorder.setConversationId('conv-late-bound');
    recorder.finish();
    await flushAsync();

    expect(client.inserts[0]!.row.conversation_id).toBe('conv-late-bound');
    expect(recorder.snapshot().conversationId).toBe('conv-late-bound');
  });

  it('setConversationId() is a no-op after finish()', async () => {
    const client = buildMockClient();
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic', conversationId: 'original' },
      client,
    );

    recorder.finish();
    await flushAsync();
    recorder.setConversationId('attempted-late-write');

    expect(client.inserts[0]!.row.conversation_id).toBe('original');
    expect(recorder.snapshot().conversationId).toBe('original');
  });

  it('setConversationId(null) clears the id; trims and length-checks strings', () => {
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'deterministic', conversationId: 'original' },
      null,
    );

    recorder.setConversationId('  trimmed-id  ');
    expect(recorder.snapshot().conversationId).toBe('trimmed-id');

    recorder.setConversationId(null);
    expect(recorder.snapshot().conversationId).toBeNull();

    // Reject empty / whitespace.
    recorder.setConversationId('original-restored');
    recorder.setConversationId('   ');
    expect(recorder.snapshot().conversationId).toBe('original-restored');

    // Reject pathologically long values.
    recorder.setConversationId('x'.repeat(500));
    expect(recorder.snapshot().conversationId).toBe('original-restored');
  });

  it('supports llm_first runtime value (forward-compat with AIN-8)', async () => {
    const client = buildMockClient();
    const recorder = createRequestMetricsRecorder(
      { requestId: 'r', runtime: 'llm_first' },
      client,
    );

    recorder.finish();
    await flushAsync();

    expect(client.inserts[0]!.row.runtime).toBe('llm_first');
  });
});

describe('resolveRequestId', () => {
  it('returns the inbound header value when present and non-empty', () => {
    expect(resolveRequestId('inbound-trace-123')).toBe('inbound-trace-123');
  });

  it('trims surrounding whitespace from the inbound header', () => {
    expect(resolveRequestId('  trace-1  ')).toBe('trace-1');
  });

  it('generates a UUID when the header is null', () => {
    const id = resolveRequestId(null);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('generates a UUID when the header is undefined', () => {
    const id = resolveRequestId(undefined);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('generates a UUID when the header is empty / whitespace-only', () => {
    expect(resolveRequestId('')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(resolveRequestId('   ')).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('rejects suspiciously long header values and falls back to UUID', () => {
    const tooLong = 'x'.repeat(500);
    const id = resolveRequestId(tooLong);
    expect(id).not.toBe(tooLong);
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
