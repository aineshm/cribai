/**
 * Integration test for AIN-19 latency instrumentation on /api/ai/cribai.
 *
 * Scope: verify that one row is inserted into `ai_request_metrics` with the
 * expected shape on the deterministic-runtime path. Heavy mocks for Gemini
 * and Supabase keep the test fast and deterministic.
 *
 * Why deterministic path and not the LLM-fallback path:
 *   - The LLM path requires mocking the full Gemini async iterator (the
 *     route iterates `cribai.chat({...})`). The deterministic path is
 *     exercised on every `looksLike*` turn in production today, so it's the
 *     realistic baseline most metrics rows will come from anyway.
 *   - The recorder helper itself has dense unit coverage in
 *     packages/ai/src/runtime/__tests__/metrics.test.ts (21 tests), so the
 *     integration test only needs to prove the wiring is correct: a row is
 *     written, with the right column values, on the success path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({
    get: () => undefined,
  })),
}));

// AIN-19 follow-up (code-review P2): the guest test below asserts
// `row.user_id === null`. Without this mock that assertion silently depends
// on `isDevAuthEnabled()` returning false. If a default ever flips, the
// guest path would resolve `DEFAULT_DEV_USER.id` and the row would not be
// null — but the test could still appear to pass against a non-null id if
// the assertion were ever relaxed. Pin the dev-auth surface to off here so
// the guest contract is unambiguous.
vi.mock('../../../../../lib/dev-auth', () => ({
  isDevAuthEnabled: () => false,
  getDevUserById: () => undefined,
  DEFAULT_DEV_USER: { id: 'never' },
  DEV_USER_COOKIE: 'cookie',
}));

// Mock the deterministic runtime helper. Default mock returns a search-like
// sequence (tool_call + tool_result + text). Tests can override with
// `vi.mocked(maybeHandleDeterministicTurn).mockResolvedValueOnce(...)` to
// exercise card-only turns (e.g. tour_submit) that end on tool_result.
vi.mock('../../../../../lib/cribai-runtime', () => ({
  maybeHandleDeterministicTurn: vi.fn(async () => ({
    blocks: [
      { type: 'text', content: 'Here are some matching listings.' },
    ],
    events: [
      { type: 'tool_call', name: 'search_listings', args: { semantic_query: 'sublease' } },
      {
        type: 'tool_result',
        name: 'search_listings',
        block: { type: 'text', content: 'results' },
      },
      { type: 'text', content: 'Here are some matching listings.' },
    ],
    conversationState: {
      mode: 'browse',
      selectedListingId: null,
      pendingAction: null,
    },
  })),
}));

import { maybeHandleDeterministicTurn } from '../../../../../lib/cribai-runtime';

// Mock conversation-state helpers (avoid pulling in their dependencies).
vi.mock('../../../../../lib/conversation-state-helpers', () => ({
  preservePendingActionAfterLLMTurn: vi.fn((state) => state),
}));

// Controllable LLM-path mock. When set, the route's `cribai.chat({...})` async
// iterator yields these chunks in order. Default is empty (test must opt in
// by overriding to exercise the LLM fallback path). The deterministic-path
// mock above must be set to return `null` in the same test for the route to
// reach this fork.
let llmChatChunks: Array<unknown> = [];

// AIN-8 — controllable LLM-first turn-handler mock. When the dark flag is on
// (CRIBAI_RUNTIME_LLM_FIRST='1'), the route streams `runLlmTurn(...)`. The
// generator yields these chunks. A test can also override per-case with
// `vi.mocked(runLlmTurn).mockImplementationOnce(...)` to throw mid-stream.
let llmTurnChunks: Array<unknown> = [];

vi.mock('@campusnest/ai', async () => {
  const actual = await vi.importActual<typeof import('@campusnest/ai')>('@campusnest/ai');
  return {
    ...actual,
    CribAI: vi.fn().mockImplementation(() => ({
      chat: vi.fn(async function* () {
        for (const chunk of llmChatChunks) {
          yield chunk;
        }
      }),
    })),
    // AIN-8 — never build a real Vertex/AI Studio model in the route under test.
    createAiSdkModel: vi.fn(() => ({ __mockModel: true })),
    runLlmTurn: vi.fn(async function* () {
      for (const chunk of llmTurnChunks) {
        yield chunk;
      }
    }),
  };
});

// Import CribAI after the mock so Fix 4 test 2 can override its behavior
// per-test via vi.mocked(CribAI).mockImplementationOnce(...).
import { CribAI, runLlmTurn } from '@campusnest/ai';

// Capture inserts to ai_request_metrics across the test. Each .from(table)
// call returns a chainable object whose .insert() resolves to {error:null}
// after pushing into the recorded inserts list.
const recordedInserts: Array<{ table: string; row: Record<string, unknown> }> = [];

// Per-table .single() responses for the .from(table).select().eq().single()
// chain used throughout the route (profile lookup, campus lookup,
// conversation lookup, pageindex lookup). Mutable so individual tests can
// inject error states (e.g. campus not found) via beforeEach reset.
let SINGLE_FIXTURES: Record<string, { data: unknown; error: null }> = {};
const DEFAULT_SINGLE_FIXTURES: Record<string, { data: unknown; error: null }> = {
  profiles: { data: { subscription_tier: 'free' }, error: null },
  campus_configs: {
    data: {
      id: '6692cc4a-1592-4b7d-a642-6eaacfd5503c',
      name: 'UW-Madison',
    },
    error: null,
  },
  conversations: { data: null, error: null },
  pageindex_trees: {
    data: { tree: { label: 'root', summary: '', contentRef: null, children: [] } },
    error: null,
  },
};

// Mutable rate-limit fixture so individual tests can simulate exceeded limits
// without rebuilding the full supabase mock.
let aiQueryLogsCount = 0;

function buildFromChain(table: string) {
  // ai_query_logs uses .select(...).eq().gte() with a count return for the
  // rate-limit check — distinct shape from the other tables' .single() chain.
  if (table === 'ai_query_logs') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(async () => ({ count: aiQueryLogsCount })),
        })),
      })),
      insert: vi.fn(async (row: Record<string, unknown>) => {
        recordedInserts.push({ table, row });
        return { error: null };
      }),
    };
  }

  const chain: Record<string, unknown> = {
    insert: vi.fn(async (row: Record<string, unknown>) => {
      recordedInserts.push({ table, row });
      return { error: null };
    }),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => SINGLE_FIXTURES[table] ?? { data: null, error: null }),
    update: vi.fn(() => chain),
    gte: vi.fn(() => chain),
  };
  return chain;
}

const supabaseStub = {
  auth: {
    getUser: vi.fn(async () => ({
      data: {
        user: { id: '00000000-0000-0000-0000-000000000001' },
      },
    })),
  },
  from: vi.fn(buildFromChain),
};

vi.mock('@campusnest/supabase/server', () => ({
  createSecretClient: vi.fn(() => supabaseStub),
}));

// Force the environment variables that the route checks before doing work.
process.env.GEMINI_API_KEY = 'test-key';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SECRET_KEY = 'test-secret';

import { POST } from '../route';

function buildRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/ai/cribai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function buildGuestRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  // Guest turns omit the Authorization header. The cookies() mock returns
  // empty so the dev-auth fallback also misses, leaving userId === null.
  return new NextRequest('http://localhost/api/ai/cribai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function drainStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    body += decoder.decode(value);
  }
  return body;
}

describe('POST /api/ai/cribai — AIN-19 latency instrumentation', () => {
  beforeEach(() => {
    recordedInserts.length = 0;
    aiQueryLogsCount = 0;
    SINGLE_FIXTURES = { ...DEFAULT_SINGLE_FIXTURES };
    llmChatChunks = [];
    llmTurnChunks = [];
    delete process.env.CRIBAI_RUNTIME_LLM_FIRST;
    // AIN-8 — clear call history (NOT implementation) so per-test
    // "was/wasn't called" assertions don't see cumulative counts.
    vi.mocked(maybeHandleDeterministicTurn).mockClear();
    vi.mocked(runLlmTurn).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('inserts one ai_request_metrics row on the deterministic success path', async () => {
    const req = buildRequest(
      {
        query: 'show me subleases near campus',
        campusSlug: 'uw-madison',
        history: [],
      },
      { 'x-request-id': 'trace-deterministic-1' },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);

    // Drain microtasks twice — the recorder's fire-and-forget insert + the
    // ai_query_logs background insert both run on the microtask queue.
    await new Promise((r) => setTimeout(r, 5));

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);

    const row = metricsInserts[0]!.row;
    expect(row.request_id).toBe('trace-deterministic-1');
    expect(row.user_id).toBe('00000000-0000-0000-0000-000000000001');
    expect(row.runtime).toBe('deterministic');
    expect(typeof row.request_received_at).toBe('string');
    expect(typeof row.request_completed_at).toBe('string');
    expect(row.tools_called).toEqual(['search_listings']);
    expect(row.tool_step_count).toBe(1);
    expect(row.error_kind).toBeNull();
    // Deterministic path does not invoke Gemini, so TTFT stays null by design.
    expect(row.first_model_token_at).toBeNull();
    // first_tool_result_at should be stamped (we had a tool_result in events).
    expect(typeof row.first_tool_result_at).toBe('string');
    // final_assistant_message_at should be stamped (we emitted a text event).
    expect(typeof row.final_assistant_message_at).toBe('string');
  });

  it('stamps final_assistant_message_at for card-only deterministic turns (no trailing text event)', async () => {
    // Card-only flow — e.g. the tour_submit deterministic path returns only
    // tool_result events, no trailing text. AIN-19 needs the
    // final-message timestamp regardless, so the codex P2 finding gets
    // exercised by this regression test.
    vi.mocked(maybeHandleDeterministicTurn).mockResolvedValueOnce({
      blocks: [
        { type: 'tour_confirmation', tourRequestId: 'tour-1' },
      ],
      events: [
        { type: 'tool_call', name: 'schedule_tour', args: {} },
        {
          type: 'tool_result',
          name: 'schedule_tour',
          block: { type: 'tour_confirmation', tourRequestId: 'tour-1' },
        },
      ],
      conversationState: {
        mode: 'action',
        selectedListingId: null,
        pendingAction: null,
      },
    } as never);

    const req = buildRequest({
      query: 'yes',
      campusSlug: 'uw-madison',
      history: [],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);
    await new Promise((r) => setTimeout(r, 5));

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);
    const row = metricsInserts[0]!.row;
    expect(typeof row.final_assistant_message_at).toBe('string');
    expect(row.tools_called).toEqual(['schedule_tour']);
  });

  it('generates a UUID request_id when no x-request-id header is supplied', async () => {
    const req = buildRequest({
      query: 'show me subleases',
      campusSlug: 'uw-madison',
      history: [],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);
    await new Promise((r) => setTimeout(r, 5));

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);
    expect(metricsInserts[0]!.row.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  // AIN-19 codex P2 follow-up: error early-returns that occur AFTER recorder
  // construction must still produce an `ai_request_metrics` row tagged with
  // the appropriate `error_kind`. Without these, the baseline silently drops
  // exactly the failure classes the schema is meant to track.
  it('records error_kind=rate_limit when the rate limiter rejects the turn', async () => {
    // 11 requests in the window > the free-tier limit of 10/hr → 429.
    aiQueryLogsCount = 11;

    const req = buildRequest(
      {
        query: 'show me subleases',
        campusSlug: 'uw-madison',
        history: [],
      },
      { 'x-request-id': 'trace-rate-limit-1' },
    );

    const res = await POST(req);
    expect(res.status).toBe(429);
    // NOTE: deliberately NO `setTimeout(5)` drain here. Early-return paths
    // MUST await `finish()` so the persist completes before the response is
    // sent — otherwise serverless runtimes cancel the unawaited insert and
    // these rows get dropped (codex P2 from PR #76 push #2). If this test
    // ever needs a microtask drain to pass, the await is missing.

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);
    const row = metricsInserts[0]!.row;
    expect(row.request_id).toBe('trace-rate-limit-1');
    expect(row.error_kind).toBe('rate_limit');
    expect(row.runtime).toBe('deterministic');
    expect(row.user_id).toBe('00000000-0000-0000-0000-000000000001');
    // Bookend timestamps are required (NOT NULL in the schema).
    expect(typeof row.request_received_at).toBe('string');
    expect(typeof row.request_completed_at).toBe('string');
    // No model/tool work happened on this early-return path.
    expect(row.first_model_token_at).toBeNull();
    expect(row.first_tool_result_at).toBeNull();
    expect(row.tools_called).toEqual([]);
    expect(row.tool_step_count).toBe(0);
  });

  it('records error_kind=campus_not_found when the campus lookup misses', async () => {
    SINGLE_FIXTURES.campus_configs = { data: null, error: null };

    const req = buildRequest(
      {
        query: 'show me subleases',
        campusSlug: 'unknown-campus',
        history: [],
      },
      { 'x-request-id': 'trace-campus-miss-1' },
    );

    const res = await POST(req);
    expect(res.status).toBe(404);
    // No microtask drain — `finish()` must be awaited on the
    // campus_not_found early-return so serverless cancellation can't drop
    // the row.

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);
    expect(metricsInserts[0]!.row.error_kind).toBe('campus_not_found');
    expect(metricsInserts[0]!.row.request_id).toBe('trace-campus-miss-1');
  });

  it('records error_kind=query_too_long when the query exceeds the auth limit', async () => {
    const overlong = 'x'.repeat(501);

    const req = buildRequest({
      query: overlong,
      campusSlug: 'uw-madison',
      history: [],
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    // No microtask drain — same reasoning as the rate_limit / campus_not_found
    // tests above. The await on `finish()` proves the row landed by the
    // time the response was sent.

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);
    expect(metricsInserts[0]!.row.error_kind).toBe('query_too_long');
  });

  // AIN-19 codex P2 follow-up: TTFT (`first_model_token_at`) must stay null
  // when Gemini yields only `{ type: 'done' }` (empty / blocked reply). The
  // previous wiring stamped TTFT inside the loop unconditionally, which
  // produced bogus first-token measurements for no-output turns.
  it('leaves first_model_token_at null when the LLM yields only a done marker', async () => {
    // Force the deterministic short-circuit to MISS so the route falls
    // through to the Gemini path that this test exercises.
    vi.mocked(maybeHandleDeterministicTurn).mockResolvedValueOnce(null as never);
    llmChatChunks = [{ type: 'done' }];

    const req = buildRequest(
      {
        query: 'why is housing so expensive in madison',
        campusSlug: 'uw-madison',
        history: [],
      },
      { 'x-request-id': 'trace-llm-done-only' },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);
    await new Promise((r) => setTimeout(r, 5));

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);
    const row = metricsInserts[0]!.row;
    expect(row.request_id).toBe('trace-llm-done-only');
    // Critical assertion — no model token actually emitted, TTFT stays null.
    expect(row.first_model_token_at).toBeNull();
    // final_assistant_message_at also stays null because no assistant content
    // shipped. Empty replies remain queryable as a distinct class downstream.
    expect(row.final_assistant_message_at).toBeNull();
    expect(row.tools_called).toEqual([]);
    expect(row.tool_step_count).toBe(0);
    expect(row.error_kind).toBeNull();
  });

  // AIN-19 codex P1 follow-up (push #3): on guest turns userId === null, so
  // persistAssistantResponse() early-returns, leaving NO awaited work after
  // the metrics finish() call. The success-path `finish()` must therefore be
  // awaited too — otherwise serverless cancellation drops the row. This test
  // omits the microtask drain so a missing await regresses the assertion.
  it('on guest turns, the success-path metrics row lands without a microtask drain', async () => {
    const req = buildGuestRequest({
      // Use a generic query that the deterministic mock will handle.
      query: 'show me subleases near campus',
      campusSlug: 'uw-madison',
      history: [],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);
    // No setTimeout(5) drain. The await on `finish()` inside POST is the
    // only thing that makes this assertion pass.

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);
    const row = metricsInserts[0]!.row;
    expect(row.user_id).toBeNull();
    expect(row.runtime).toBe('deterministic');
    expect(row.tools_called).toEqual(['search_listings']);
  });

  // Companion test: when the LLM DOES emit a text token, TTFT should be set.
  // This guards against the over-correction of accidentally never stamping
  // TTFT after the refactor.
  it('stamps first_model_token_at when the LLM emits a real text token', async () => {
    vi.mocked(maybeHandleDeterministicTurn).mockResolvedValueOnce(null as never);
    llmChatChunks = [
      { type: 'text', content: 'Let me think about that.' },
      { type: 'done' },
    ];

    const req = buildRequest({
      query: 'tell me about lease basics',
      campusSlug: 'uw-madison',
      history: [],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);
    await new Promise((r) => setTimeout(r, 5));

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);
    const row = metricsInserts[0]!.row;
    expect(typeof row.first_model_token_at).toBe('string');
    expect(typeof row.final_assistant_message_at).toBe('string');
  });

  // AIN-19 follow-up (code-review P2): codex iterated 4 times on the
  // `finish()` ordering inside the SSE stream-catch blocks. These three
  // tests pin the regression guards on each surface — without them, a
  // future refactor that reverts the await-first ordering would only fail
  // when the SSE connection drops in production. Forcing a throw mid-stream
  // is the only way to exercise these branches; unit tests can't.

  it('records error_kind=deterministic_stream_error when the deterministic event replay throws', async () => {
    // Force the for-of replay loop in the deterministic stream to throw
    // mid-iteration via a custom iterable. This exercises the catch block
    // around line 610-627 in route.ts, where finish() MUST be awaited
    // before the controller.close() (codex P2 from push #4).
    vi.mocked(maybeHandleDeterministicTurn).mockResolvedValueOnce({
      blocks: [],
      events: {
        *[Symbol.iterator]() {
          yield { type: 'tool_call', name: 'search_listings', args: {} };
          throw new Error('mid-stream deterministic failure');
        },
      } as never,
      conversationState: {
        mode: 'browse',
        selectedListingId: null,
        pendingAction: null,
      },
    } as never);

    const req = buildRequest(
      {
        query: 'show me subleases near campus',
        campusSlug: 'uw-madison',
        history: [],
      },
      { 'x-request-id': 'trace-det-stream-err' },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);
    // Deliberately NO microtask drain — finish() is awaited inside the
    // catch before controller.close(), so drainStream() returning implies
    // the persist has resolved. A regression that drops the await would
    // make this assertion fail intermittently / not at all.

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);
    const row = metricsInserts[0]!.row;
    expect(row.request_id).toBe('trace-det-stream-err');
    expect(row.error_kind).toBe('deterministic_stream_error');
    expect(row.runtime).toBe('deterministic');
    // The tool_call event fired before the throw, so it should be recorded.
    expect(row.tools_called).toEqual(['search_listings']);
  });

  it('records error_kind=llm_stream_error when the Gemini stream throws mid-stream', async () => {
    // Force the deterministic short-circuit to miss so the LLM fallback
    // path runs, then override CribAI.chat to yield then throw. This
    // exercises the catch block around line 818-840, where finish() MUST
    // be awaited before controller.close().
    vi.mocked(maybeHandleDeterministicTurn).mockResolvedValueOnce(null as never);
    vi.mocked(CribAI).mockImplementationOnce(
      () => ({
        chat: vi.fn(async function* () {
          yield { type: 'text', content: 'partial...' };
          throw new Error('mid-stream Gemini failure');
        }),
      }) as never,
    );

    const req = buildRequest(
      {
        query: 'why is housing so expensive',
        campusSlug: 'uw-madison',
        history: [],
      },
      { 'x-request-id': 'trace-llm-stream-err' },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);
    // No microtask drain — same reasoning as the deterministic_stream_error
    // test above.

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);
    const row = metricsInserts[0]!.row;
    expect(row.request_id).toBe('trace-llm-stream-err');
    // Not a quota-style message — should classify as the generic LLM stream
    // error rather than gemini_quota.
    expect(row.error_kind).toBe('llm_stream_error');
    expect(row.runtime).toBe('deterministic');
    // A real text token shipped before the throw — TTFT should be stamped.
    expect(typeof row.first_model_token_at).toBe('string');
  });

  it('records error_kind=handler_exception when the deterministic helper rejects', async () => {
    // NOTE: literally throwing inside `request.json()` would jump to the
    // outer catch BEFORE the recorder is created (line 435 in route.ts),
    // so no row would land — that's intentional per the comment at lines
    // 431-434 ("pre-supabase failures … intentionally not instrumented").
    // The handler_exception branch only fires for throws that happen
    // AFTER recorder construction. `maybeHandleDeterministicTurn` is the
    // first awaited call inside the outer try after the recorder exists,
    // so rejecting it is the cleanest way to exercise the outer catch
    // with a live recorder.
    vi.mocked(maybeHandleDeterministicTurn).mockRejectedValueOnce(
      new Error('synthesized handler failure'),
    );

    const req = buildRequest(
      {
        query: 'show me subleases',
        campusSlug: 'uw-madison',
        history: [],
      },
      { 'x-request-id': 'trace-handler-exc' },
    );

    const res = await POST(req);
    expect(res.status).toBe(500);
    // No microtask drain — the outer catch awaits finish() before
    // returning the 500 response.

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);
    const row = metricsInserts[0]!.row;
    expect(row.request_id).toBe('trace-handler-exc');
    expect(row.error_kind).toBe('handler_exception');
    expect(row.runtime).toBe('deterministic');
  });

  // ----------------------------------------------------------------------
  // AIN-8 — LLM-first runtime write path. With the dark flag on, a full
  // turn must write an ai_request_metrics row tagged runtime='llm_first'
  // with the lifecycle marks set. The deterministic short-circuit must be
  // skipped entirely (runLlmTurn drives the stream).
  // ----------------------------------------------------------------------

  it("writes an ai_request_metrics row with runtime='llm_first' on a full LLM-first turn", async () => {
    process.env.CRIBAI_RUNTIME_LLM_FIRST = '1';
    llmTurnChunks = [
      { type: 'tool_call', name: 'search_listings', args: { semantic_query: 'sublease' } },
      {
        type: 'tool_result',
        name: 'search_listings',
        block: { type: 'text', content: 'results' },
        statePatch: { selectedListingId: 'listing-1' },
      },
      { type: 'text', content: 'Here are 3 great options near campus.' },
      { type: 'done' },
    ];

    const req = buildRequest(
      {
        query: 'show me subleases near campus',
        campusSlug: 'uw-madison',
        history: [],
      },
      { 'x-request-id': 'trace-llm-first-1' },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);
    await new Promise((r) => setTimeout(r, 5));

    // The deterministic short-circuit must NOT run on the llm_first path.
    expect(maybeHandleDeterministicTurn).not.toHaveBeenCalled();
    // The LLM-first handler drove the turn.
    expect(runLlmTurn).toHaveBeenCalledTimes(1);

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);
    const row = metricsInserts[0]!.row;
    expect(row.request_id).toBe('trace-llm-first-1');
    expect(row.runtime).toBe('llm_first');
    expect(row.user_id).toBe('00000000-0000-0000-0000-000000000001');
    expect(typeof row.request_received_at).toBe('string');
    expect(typeof row.request_completed_at).toBe('string');
    // A tool_call shipped → TTFT stamped; tool_result shipped → first tool
    // result stamped; text shipped → final assistant message stamped.
    expect(typeof row.first_model_token_at).toBe('string');
    expect(typeof row.first_tool_result_at).toBe('string');
    expect(typeof row.final_assistant_message_at).toBe('string');
    expect(row.tools_called).toEqual(['search_listings']);
    expect(row.tool_step_count).toBe(1);
    expect(row.error_kind).toBeNull();
  });

  it("classifies an LLM-first quota error as gemini_quota with runtime='llm_first'", async () => {
    process.env.CRIBAI_RUNTIME_LLM_FIRST = '1';
    vi.mocked(runLlmTurn).mockImplementationOnce(
      // eslint-disable-next-line require-yield
      (async function* () {
        throw new Error('RESOURCE_EXHAUSTED: 429 quota exceeded');
      }) as never,
    );

    const req = buildRequest(
      {
        query: 'why is housing so expensive',
        campusSlug: 'uw-madison',
        history: [],
      },
      { 'x-request-id': 'trace-llm-first-quota' },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);

    const metricsInserts = recordedInserts.filter((i) => i.table === 'ai_request_metrics');
    expect(metricsInserts).toHaveLength(1);
    const row = metricsInserts[0]!.row;
    expect(row.request_id).toBe('trace-llm-first-quota');
    expect(row.error_kind).toBe('gemini_quota');
    expect(row.runtime).toBe('llm_first');
  });
});
