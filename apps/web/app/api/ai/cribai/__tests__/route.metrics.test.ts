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

// Mock the deterministic runtime helper to return a canned event sequence
// containing a tool_call (so tools_called[] populates) and a text block (so
// finalAssistantMessageAt stamps).
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

// Mock conversation-state helpers (avoid pulling in their dependencies).
vi.mock('../../../../../lib/conversation-state-helpers', () => ({
  preservePendingActionAfterLLMTurn: vi.fn((state) => state),
}));

// Capture inserts to ai_request_metrics across the test. Each .from(table)
// call returns a chainable object whose .insert() resolves to {error:null}
// after pushing into the recorded inserts list.
const recordedInserts: Array<{ table: string; row: Record<string, unknown> }> = [];

// Per-table .single() responses for the .from(table).select().eq().single()
// chain used throughout the route (profile lookup, campus lookup,
// conversation lookup, pageindex lookup).
const SINGLE_FIXTURES: Record<string, { data: unknown; error: null }> = {
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

function buildFromChain(table: string) {
  // ai_query_logs uses .select(...).eq().gte() with a count return for the
  // rate-limit check — distinct shape from the other tables' .single() chain.
  if (table === 'ai_query_logs') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(async () => ({ count: 0 })),
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
});
