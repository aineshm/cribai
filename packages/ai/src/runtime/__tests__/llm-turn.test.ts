/**
 * PDR-004 Track A Days 3-4 — LLM-first turn handler tests (AIN-8)
 *
 * Exercises `runLlmTurn` against a MOCK AI SDK model (MockLanguageModelV3 +
 * simulateReadableStream) — NO live Gemini/Vertex calls. Pins:
 *   - A10 ordering contract: assistant prose that references tool results is
 *     never emitted before those results are in the stream (no-tool /
 *     single-tool / multi-tool turns).
 *   - statePatch surfaces on the `tool_result` event for the route to merge.
 *   - guest tool rejection → an error `tool_result` block (executor throws,
 *     SDK emits `tool-error`).
 *   - provider error mapping so the route's quota/RESOURCE_EXHAUSTED/429
 *     classifier still fires.
 *   - a terminal `done` event.
 *
 * NOTE: ai@6 ships `MockLanguageModelV3` (not V2 as the original ticket text
 * guessed) and `stepCountIs` (confirmed over the `isStepCount` alternative).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { createEmptyConversationState } from '@campusnest/types';
import type { ConversationState } from '@campusnest/types';
import { EMPTY_PROFILE_SNIPPET } from '../system-prompt';
import type { ToolContext, ToolResult } from '../../tools/types';
import { UserFacingToolError } from '../../tools/errors';
import { runLlmTurn } from '../llm-turn';
import type { ChatEvent } from '../../cribai';
import type { SavedListContext } from '../../crm/saved-list-context';

// Stub the executor so tool execution is deterministic + offline. The real
// allowlist guard is re-imported for the guest-rejection test.
vi.mock('../../tools/executor', () => ({
  executeTool: vi.fn(),
}));
import { executeTool } from '../../tools/executor';

// AIN-15 Phase 2 — the CRM tools route through their `crm/` handlers (NOT
// `executeTool`), so the integration test that drives add_listing →
// first_save_analysis mocks the handlers directly. The barrel's schemas +
// descriptions are preserved so the registry still constructs.
vi.mock('../../crm', async (orig) => {
  const actual = await orig<typeof import('../../crm')>();
  return {
    ...actual,
    addListingHandler: vi.fn(),
    firstSaveAnalysisHandler: vi.fn(),
    inferProfileHandler: vi.fn(),
    rankCompareHandler: vi.fn(),
  };
});
import { addListingHandler, firstSaveAnalysisHandler } from '../../crm';

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0 },
  outputTokens: { total: 5, reasoning: 0 },
  totalTokens: 15,
} as never;

function streamModel(parts: LanguageModelV3StreamPart[]): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [{ type: 'stream-start', warnings: [] }, ...parts],
        initialDelayInMs: null,
        chunkDelayInMs: null,
      }),
    }),
  });
}

function textPart(id: string, delta: string): LanguageModelV3StreamPart[] {
  return [
    { type: 'text-start', id },
    { type: 'text-delta', id, delta },
    { type: 'text-end', id },
  ];
}

function toolCallPart(
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
): LanguageModelV3StreamPart {
  return {
    type: 'tool-call',
    toolCallId,
    toolName,
    input: JSON.stringify(input),
  };
}

function finishPart(
  unified: 'stop' | 'tool-calls' = 'stop',
): LanguageModelV3StreamPart {
  return {
    type: 'finish',
    finishReason: { unified, raw: unified },
    usage: USAGE,
  };
}

const FINISH: LanguageModelV3StreamPart = finishPart('stop');

const fakeContext: ToolContext = {
  supabase: {} as never,
  campusId: 'campus-uw-madison',
  campusSlug: 'uw-madison',
  userId: 'user-1',
};

function baseInput(model: MockLanguageModelV3, overrides: Partial<Parameters<typeof runLlmTurn>[0]> = {}) {
  return {
    model: model as never,
    query: 'find me a 2 bedroom near campus',
    state: createEmptyConversationState(),
    profile: EMPTY_PROFILE_SNIPPET,
    toolContext: fakeContext,
    campusName: 'UW-Madison',
    isGuest: false,
    history: [],
    explicitCache: false,
    ...overrides,
  };
}

async function collect(gen: AsyncGenerator<ChatEvent>): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const SEARCH_RESULT: ToolResult = {
  modelContext: 'Found 3 listings near campus.',
  clientBlock: { type: 'listing_grid', listings: [] } as never,
  machineData: { count: 3 },
  statePatch: { selectedListingId: 'listing-1' } as Partial<ConversationState>,
};

beforeEach(() => {
  vi.mocked(executeTool).mockReset();
  vi.mocked(addListingHandler).mockReset();
  vi.mocked(firstSaveAnalysisHandler).mockReset();
});

describe('runLlmTurn — no-tool turn', () => {
  it('buffers text and flushes it, then emits done', async () => {
    const model = streamModel([
      ...textPart('t1', 'Lease basics: a security deposit is refundable.'),
      FINISH,
    ]);

    const events = await collect(runLlmTurn(baseInput(model)));

    const types = events.map((e) => e.type);
    expect(types).toEqual(['text', 'done']);
    expect((events[0] as Extract<ChatEvent, { type: 'text' }>).content).toContain(
      'security deposit',
    );
  });

  it('does NOT emit text mid-step (text only flushes at the step boundary)', async () => {
    // Two deltas in one step must coalesce into a single flushed text event.
    const model = streamModel([
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Hello ' },
      { type: 'text-delta', id: 't1', delta: 'there.' },
      { type: 'text-end', id: 't1' },
      FINISH,
    ]);

    const events = await collect(runLlmTurn(baseInput(model)));
    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents).toHaveLength(1);
    expect((textEvents[0] as Extract<ChatEvent, { type: 'text' }>).content).toBe(
      'Hello there.',
    );
  });
});

describe('runLlmTurn — single-tool turn (A10 ordering)', () => {
  it('emits tool_call then tool_result BEFORE any prose that references the result', async () => {
    vi.mocked(executeTool).mockResolvedValue(SEARCH_RESULT as never);

    // NOTE: MockLanguageModelV3 pushes to `doStreamCalls` BEFORE invoking
    // `doStream`, so length is already 1 on the first call. Use an external
    // step counter instead.
    let step = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => {
        const current = step++;
        if (current === 0) {
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                toolCallPart('call-1', 'search_listings', { semantic_query: '2 bed' }),
                finishPart('tool-calls'),
              ] as LanguageModelV3StreamPart[],
              initialDelayInMs: null,
              chunkDelayInMs: null,
            }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              ...textPart('t1', 'Here are 3 great options near campus.'),
              FINISH,
            ] as LanguageModelV3StreamPart[],
            initialDelayInMs: null,
            chunkDelayInMs: null,
          }),
        };
      },
    });

    const events = await collect(runLlmTurn(baseInput(model)));
    const types = events.map((e) => e.type);

    const toolCallIdx = types.indexOf('tool_call');
    const toolResultIdx = types.indexOf('tool_result');
    const textIdx = types.indexOf('text');

    expect(toolCallIdx).toBeGreaterThanOrEqual(0);
    expect(toolResultIdx).toBeGreaterThan(toolCallIdx);
    // A10: prose that references results comes AFTER the tool_result.
    expect(textIdx).toBeGreaterThan(toolResultIdx);
    expect(types[types.length - 1]).toBe('done');
  });

  it('surfaces the full ToolResult statePatch + block on the tool_result event', async () => {
    vi.mocked(executeTool).mockResolvedValue(SEARCH_RESULT as never);

    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            toolCallPart('call-1', 'search_listings', { semantic_query: '2 bed' }),
            finishPart('stop'),
          ] as LanguageModelV3StreamPart[],
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      }),
    });

    const events = await collect(runLlmTurn(baseInput(model)));
    const toolResult = events.find((e) => e.type === 'tool_result') as Extract<
      ChatEvent,
      { type: 'tool_result' }
    >;
    expect(toolResult).toBeDefined();
    expect(toolResult.name).toBe('search_listings');
    expect(toolResult.statePatch).toEqual({ selectedListingId: 'listing-1' });
    expect(toolResult.machineData).toEqual({ count: 3 });
    expect(toolResult.block).toEqual(SEARCH_RESULT.clientBlock);
  });

  it('emits a mission_request event when the tool result carries one', async () => {
    vi.mocked(executeTool).mockResolvedValue({
      modelContext: 'Proposed a housing search mission.',
      clientBlock: { type: 'text', content: 'mission' } as never,
      missionRequest: { type: 'housing_search', input: { bedrooms: 2 } },
    } as never);

    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            toolCallPart('call-1', 'propose_mission', { intent: 'housing_search' }),
            finishPart('stop'),
          ] as LanguageModelV3StreamPart[],
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      }),
    });

    const events = await collect(runLlmTurn(baseInput(model)));
    const missionReq = events.find((e) => e.type === 'mission_request') as Extract<
      ChatEvent,
      { type: 'mission_request' }
    >;
    expect(missionReq).toBeDefined();
    expect(missionReq.missionType).toBe('housing_search');
    expect(missionReq.input).toEqual({ bedrooms: 2 });
  });
});

describe('runLlmTurn — multi-tool turn (A10 ordering)', () => {
  it('keeps every tool_result before the prose that summarizes them', async () => {
    vi.mocked(executeTool).mockResolvedValue(SEARCH_RESULT as never);

    let step = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => {
        const current = step++;
        if (current === 0) {
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                toolCallPart('c1', 'search_listings', { semantic_query: 'a' }),
                toolCallPart('c2', 'search_listings', { semantic_query: 'b' }),
                finishPart('tool-calls'),
              ] as LanguageModelV3StreamPart[],
              initialDelayInMs: null,
              chunkDelayInMs: null,
            }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              ...textPart('t1', 'Comparing both searches: option X wins.'),
              FINISH,
            ] as LanguageModelV3StreamPart[],
            initialDelayInMs: null,
            chunkDelayInMs: null,
          }),
        };
      },
    });

    const events = await collect(runLlmTurn(baseInput(model)));
    const types = events.map((e) => e.type);

    const lastToolResultIdx = types.lastIndexOf('tool_result');
    const textIdx = types.indexOf('text');
    expect(types.filter((t) => t === 'tool_result')).toHaveLength(2);
    expect(textIdx).toBeGreaterThan(lastToolResultIdx);
    expect(types[types.length - 1]).toBe('done');
  });
});

describe('runLlmTurn — CRM model-driven chaining (AIN-15 Phase 2)', () => {
  it('streams add_listing then first_save_analysis as tool_result events in A10-safe order', async () => {
    const mockAdd = vi.mocked(addListingHandler);
    const mockFsa = vi.mocked(firstSaveAnalysisHandler);

    const listingId = '11111111-2222-4333-8444-555555555555';
    mockAdd.mockResolvedValue({
      modelContext: `Saved listing ${listingId}. INSTRUCTIONS: call first_save_analysis now with listing_id="${listingId}".`,
      clientBlock: { type: 'text', content: 'Listing saved to your CRM!' },
    } as never);
    mockFsa.mockResolvedValue({
      modelContext: `Analysis for listing ${listingId}: true cost ~$1280/mo. INSTRUCTIONS: share it.`,
      clientBlock: { type: 'text', content: '**Listing Analysis**\nTrue cost: ~$1280/mo' },
    } as never);

    // Step 0: model calls add_listing. Step 1: model (having read the
    // instruction) calls first_save_analysis. Step 2: model writes prose.
    let step = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => {
        const current = step++;
        if (current === 0) {
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                toolCallPart('c-add', 'add_listing', { url: 'https://zillow.com/x' }),
                finishPart('tool-calls'),
              ] as LanguageModelV3StreamPart[],
              initialDelayInMs: null,
              chunkDelayInMs: null,
            }),
          };
        }
        if (current === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                toolCallPart('c-fsa', 'first_save_analysis', {
                  listing_id: '11111111-2222-4333-8444-555555555555',
                }),
                finishPart('tool-calls'),
              ] as LanguageModelV3StreamPart[],
              initialDelayInMs: null,
              chunkDelayInMs: null,
            }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              ...textPart('t1', "Here's the analysis for the listing you saved."),
              FINISH,
            ] as LanguageModelV3StreamPart[],
            initialDelayInMs: null,
            chunkDelayInMs: null,
          }),
        };
      },
    });

    const events = await collect(runLlmTurn(baseInput(model)));

    // CRM tools never flow through the legacy executor.
    expect(vi.mocked(executeTool)).not.toHaveBeenCalled();

    // We assert on the STREAMED tool_result events (names + unique clientBlock
    // content), NOT on handler spy call-counts. Both this file and
    // tool-registry.test.ts `vi.mock('../../crm')`, so the registry can capture
    // a different barrel instance than the spy this test holds — making spy
    // identity unreliable across files. The streamed events prove the feature
    // (add_listing -> first_save_analysis A10-ordered chaining) end-to-end
    // regardless of spy identity. Production never mocks `../crm`.
    // Both CRM tools stream as tool_result events, in order, carrying the
    // clientBlock their handlers produced (proves both handlers ran and the
    // sink wired the full ToolResult through the generic tool_result path).
    const toolResults = events.filter(
      (e) => e.type === 'tool_result',
    ) as Extract<ChatEvent, { type: 'tool_result' }>[];
    expect(toolResults.map((e) => e.name)).toEqual(['add_listing', 'first_save_analysis']);
    expect((toolResults[0]!.block as { content: string }).content).toContain('Listing saved to your CRM!');
    expect((toolResults[1]!.block as { content: string }).content).toContain('Listing Analysis');

    // A10 ordering: every tool_result precedes the trailing prose, and the
    // tool_call for each fires before its tool_result.
    const types = events.map((e) => e.type);
    const lastToolResultIdx = types.lastIndexOf('tool_result');
    const textIdx = types.indexOf('text');
    expect(textIdx).toBeGreaterThan(lastToolResultIdx);
    expect(types.indexOf('tool_call')).toBeLessThan(types.indexOf('tool_result'));
    expect(types[types.length - 1]).toBe('done');
  });
});

describe('runLlmTurn — guest tool rejection', () => {
  it('emits an error tool_result block when the executor throws (disallowed tool)', async () => {
    // Use the REAL executor so the allowlist guard runs.
    const real = await vi.importActual<typeof import('../../tools/executor')>(
      '../../tools/executor',
    );
    vi.mocked(executeTool).mockImplementation(real.executeTool);

    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            toolCallPart('call-1', 'schedule_tour', {
              listing_id: '11111111-2222-4333-8444-555555555555',
              student_name: 'A',
              student_email: 'a@wisc.edu',
              preferred_dates: ['2026-06-15'],
            }),
            finishPart('stop'),
          ] as LanguageModelV3StreamPart[],
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      }),
    });

    const events = await collect(
      runLlmTurn(
        baseInput(model, {
          isGuest: true,
          toolContext: {
            ...fakeContext,
            userId: undefined,
            allowedToolNames: ['search_listings'],
          },
        }),
      ),
    );

    const toolResult = events.find((e) => e.type === 'tool_result') as Extract<
      ChatEvent,
      { type: 'tool_result' }
    >;
    expect(toolResult).toBeDefined();
    expect(toolResult.name).toBe('schedule_tour');
    expect(toolResult.block.type).toBe('text');
    // AIN-90 follow-up (founder-confirmed regression): the guest sign-in
    // gate is a DELIBERATELY user-facing error — it throws
    // UserFacingToolError, so its friendly message streams through verbatim.
    // Only unmarked (internal) errors get the sanitized generic message.
    expect((toolResult.block as { content: string }).content).toBe(
      'Error: This action requires signing in.',
    );
    // Still terminates cleanly.
    expect(events[events.length - 1]!.type).toBe('done');
  });
});

// AIN-90 Fix 4 — a prod incident streamed a raw handler crash message
// ("Cannot read properties of undefined (reading 'text')") straight into the
// chat bubble, with zero server-side logging. `tool-error` stream parts must
// now: (1) log server-side via console.error, and (2) yield only the
// sanitized `toolErrorBlock` message — never the raw error text.
describe('runLlmTurn — tool-error sanitization (AIN-90 Fix 4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the raw error server-side and yields only a sanitized message, never the raw error text', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rawMessage = "Cannot read properties of undefined (reading 'text')";
    vi.mocked(executeTool).mockRejectedValue(new Error(rawMessage));

    const model = streamModel([
      toolCallPart('call-1', 'get_reviews', { address: '123 Trinity Place' }),
      finishPart('stop'),
    ]);

    const events = await collect(runLlmTurn(baseInput(model)));

    const toolResult = events.find((e) => e.type === 'tool_result') as Extract<
      ChatEvent,
      { type: 'tool_result' }
    >;
    expect(toolResult).toBeDefined();
    expect(toolResult.name).toBe('get_reviews');
    expect(toolResult.block.type).toBe('text');
    const content = (toolResult.block as { content: string }).content;
    expect(content).toBe('Error: The get_reviews tool hit a problem and was skipped.');
    expect(content).not.toContain(rawMessage);

    // The raw error text must not leak anywhere in the yielded event stream
    // (client stream AND, per the same block being reused, next-turn model
    // context history).
    expect(JSON.stringify(events)).not.toContain(rawMessage);

    // Server-side visibility: the raw error is now logged, not silently lost.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[llm-turn] tool error:',
      'get_reviews',
      expect.any(Error),
    );

    expect(events[events.length - 1]!.type).toBe('done');
  });

  it('passes a UserFacingToolError message through verbatim without logging it as an error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const friendlyMessage = 'Please verify your .edu email before posting a sublease.';
    vi.mocked(executeTool).mockRejectedValue(new UserFacingToolError(friendlyMessage));

    // Valid input for the tool's registry schema — the rejection must come
    // from the mocked executor, not from SDK-side input validation (which
    // would be an ordinary internal error and correctly get sanitized).
    const model = streamModel([
      toolCallPart('call-1', 'search_listings', { semantic_query: '2 bed' }),
      finishPart('stop'),
    ]);

    const events = await collect(runLlmTurn(baseInput(model)));

    const toolResult = events.find((e) => e.type === 'tool_result') as Extract<
      ChatEvent,
      { type: 'tool_result' }
    >;
    expect(toolResult).toBeDefined();
    expect(toolResult.name).toBe('search_listings');
    expect(toolResult.block.type).toBe('text');
    expect((toolResult.block as { content: string }).content).toBe(
      `Error: ${friendlyMessage}`,
    );

    // A deliberately user-facing error is expected behavior, not a fault —
    // it must NOT hit the error log.
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    expect(events[events.length - 1]!.type).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// Task 4: surface scoping — tools + system prompt thread through runLlmTurn
// ---------------------------------------------------------------------------

/**
 * Creates a MockLanguageModelV3 that captures the tool names and raw system
 * prompt from the `doStream` params (what streamText actually passes to the
 * model). Returns mutable `captured` arrays so assertions run after `collect`.
 */
function makeCaptureModel(extraParts: LanguageModelV3StreamPart[] = []): {
  model: MockLanguageModelV3;
  captured: { tools: string[]; system: string };
} {
  const captured = { tools: [] as string[], system: '' };
  const model = new MockLanguageModelV3({
    doStream: async (params: Record<string, unknown>) => {
      const toolList = params['tools'] as Array<{ name: string }> | undefined;
      if (toolList) {
        captured.tools.push(...toolList.map((t) => t.name));
      }
      // system is the first `system`-role message in prompt
      const prompt = params['prompt'] as Array<{ role: string; content: unknown }> | undefined;
      const sysMsg = prompt?.find((m) => m.role === 'system');
      if (sysMsg) {
        captured.system =
          typeof sysMsg.content === 'string'
            ? sysMsg.content
            : (sysMsg.content as Array<{ text?: string }>)?.[0]?.text ?? '';
      }
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] } as LanguageModelV3StreamPart,
            ...extraParts,
            FINISH,
          ],
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      };
    },
  });
  return { model, captured };
}

describe('runLlmTurn — surface scoping (Task 4)', () => {
  it('surface: crm scopes tools — excludes explore-discovery tools, keeps CRM tools', async () => {
    const { model, captured } = makeCaptureModel();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await collect(runLlmTurn(baseInput(model, { surface: 'crm' } as any)));

    expect(captured.tools).not.toContain('search_listings');
    expect(captured.tools).not.toContain('get_saved_listings');
    expect(captured.tools).not.toContain('get_listing_detail');
    expect(captured.tools).not.toContain('compare_listings');
    expect(captured.tools).toContain('rank_compare');
    expect(captured.tools).toContain('add_listing');
    expect(captured.tools).toHaveLength(13);
  });

  it('surface: crm injects CRM guidance into the system prompt', async () => {
    const { model, captured } = makeCaptureModel();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await collect(runLlmTurn(baseInput(model, { surface: 'crm' } as any)));

    expect(captured.system).toContain("THIS IS THE USER'S SAVED LIST");
    expect(captured.system).not.toContain('SEARCH FIRST, ASK LATER');
  });

  it('no surface leaves all 17 tools — explore/default unchanged', async () => {
    const { model, captured } = makeCaptureModel();

    await collect(runLlmTurn(baseInput(model)));

    expect(captured.tools).toHaveLength(17);
    expect(captured.tools).toContain('search_listings');
  });
});

// ---------------------------------------------------------------------------
// AIN-91 — savedListContext threading (Task 6)
// ---------------------------------------------------------------------------

const SAVED_LISTING_ID = 'dddddddd-2222-4333-8444-555555555555';

const SAMPLE_SAVED_LIST_CONTEXT: SavedListContext = {
  listings: [
    {
      id: SAVED_LISTING_ID,
      nickname: 'The Gorham Loft',
      title: 'Spacious 2BR near campus',
      address: '456 W Gorham St, Madison WI',
      rent: 1100,
      status: 'active',
      floorPlans: [],
      priceIsFrom: false,
    },
  ],
  truncatedCount: 0,
};

describe('runLlmTurn — savedListContext threading (AIN-91)', () => {
  it('crm turn with a savedListContext surfaces the listing id + nickname in captured.system', async () => {
    const { model, captured } = makeCaptureModel();

    await collect(
      runLlmTurn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        baseInput(model, { surface: 'crm', savedListContext: SAMPLE_SAVED_LIST_CONTEXT } as any),
      ),
    );

    expect(captured.system).toContain(SAVED_LISTING_ID);
    expect(captured.system).toContain('The Gorham Loft');
  });

  it('explore turn with the same savedListContext does NOT surface it (crm-gated)', async () => {
    const { model, captured } = makeCaptureModel();

    await collect(
      runLlmTurn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        baseInput(model, { savedListContext: SAMPLE_SAVED_LIST_CONTEXT } as any),
      ),
    );

    expect(captured.system).not.toContain(SAVED_LISTING_ID);
    expect(captured.system).not.toContain('The Gorham Loft');
  });
});

describe('runLlmTurn — onFirstModelToken (FIX 3: TTFT at first token)', () => {
  it('fires onFirstModelToken on the FIRST text-delta, before the step boundary flush', async () => {
    const onFirstModelToken = vi.fn();
    // Two deltas in one step. The callback must fire on the first delta, NOT
    // wait for finish-step (where the buffered `text` event is flushed).
    const model = streamModel([
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Hello ' },
      { type: 'text-delta', id: 't1', delta: 'there.' },
      { type: 'text-end', id: 't1' },
      FINISH,
    ]);

    await collect(runLlmTurn(baseInput(model, { onFirstModelToken })));

    expect(onFirstModelToken).toHaveBeenCalledTimes(1);
  });

  it('fires onFirstModelToken on the FIRST tool-call', async () => {
    vi.mocked(executeTool).mockResolvedValue(SEARCH_RESULT as never);
    const onFirstModelToken = vi.fn();

    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            toolCallPart('call-1', 'search_listings', { semantic_query: '2 bed' }),
            finishPart('stop'),
          ] as LanguageModelV3StreamPart[],
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      }),
    });

    await collect(runLlmTurn(baseInput(model, { onFirstModelToken })));

    expect(onFirstModelToken).toHaveBeenCalledTimes(1);
  });

  it('fires onFirstModelToken on a reasoning part, and reasoning never leaks as prose', async () => {
    // gpt-5.4-mini (OpenAI Responses API) emits reasoning parts BEFORE any text.
    // TTFT must mark on the reasoning part (so the AIN-19 baseline isn't inflated
    // by the reasoning phase), and reasoning content must NOT surface as a
    // client-visible text event.
    const onFirstModelToken = vi.fn();
    const model = streamModel([
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', delta: 'Let me think about this...' },
      { type: 'reasoning-end', id: 'r1' },
      ...textPart('t1', 'Here is the answer.'),
      FINISH,
    ]);

    const events = await collect(runLlmTurn(baseInput(model, { onFirstModelToken })));

    expect(onFirstModelToken).toHaveBeenCalledTimes(1);
    const textEvents = events.filter(
      (e) => e.type === 'text',
    ) as Extract<ChatEvent, { type: 'text' }>[];
    expect(textEvents.every((e) => !e.content.includes('Let me think'))).toBe(true);
  });

  it('fires exactly once even across multiple text deltas and tool calls', async () => {
    vi.mocked(executeTool).mockResolvedValue(SEARCH_RESULT as never);
    const onFirstModelToken = vi.fn();

    let step = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => {
        const current = step++;
        if (current === 0) {
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                toolCallPart('c1', 'search_listings', { semantic_query: 'a' }),
                finishPart('tool-calls'),
              ] as LanguageModelV3StreamPart[],
              initialDelayInMs: null,
              chunkDelayInMs: null,
            }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              ...textPart('t1', 'Here are some options.'),
              FINISH,
            ] as LanguageModelV3StreamPart[],
            initialDelayInMs: null,
            chunkDelayInMs: null,
          }),
        };
      },
    });

    await collect(runLlmTurn(baseInput(model, { onFirstModelToken })));

    expect(onFirstModelToken).toHaveBeenCalledTimes(1);
  });

  it('does not break A10 prose buffering — text still flushes at the step boundary', async () => {
    const onFirstModelToken = vi.fn();
    const model = streamModel([
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Hello ' },
      { type: 'text-delta', id: 't1', delta: 'there.' },
      { type: 'text-end', id: 't1' },
      FINISH,
    ]);

    const events = await collect(runLlmTurn(baseInput(model, { onFirstModelToken })));
    const textEvents = events.filter((e) => e.type === 'text');
    // Still one coalesced text event (buffering preserved), even though the
    // metric marker fired on the first delta.
    expect(textEvents).toHaveLength(1);
    expect((textEvents[0] as Extract<ChatEvent, { type: 'text' }>).content).toBe(
      'Hello there.',
    );
  });
});

describe('runLlmTurn — per-turn tool-call budget (codex P2)', () => {
  it('caps tool executions at AUTH_MAX_STEPS (5) when many calls arrive in ONE step', async () => {
    vi.mocked(executeTool).mockResolvedValue(SEARCH_RESULT as never);

    // ONE step emits 7 parallel tool-calls (2 over the auth cap of 5). A
    // stepCountIs-only stop condition would let ALL 7 run; the budget must
    // stop at 5.
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            ...Array.from({ length: 7 }, (_v, i) =>
              toolCallPart(`c${i}`, 'search_listings', { semantic_query: `q${i}` }),
            ),
            finishPart('stop'),
          ] as LanguageModelV3StreamPart[],
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      }),
    });

    const events = await collect(runLlmTurn(baseInput(model, { isGuest: false })));

    // executeTool ran at most 5 times — beyond-cap calls were rejected.
    expect(vi.mocked(executeTool)).toHaveBeenCalledTimes(5);
    // Rich tool_result events (from the sink) only for the 5 that executed.
    const rich = events.filter(
      (e) => e.type === 'tool_result' && (e as { name: string }).name === 'search_listings',
    );
    expect(rich.length).toBe(5);
    expect(events[events.length - 1]!.type).toBe('done');
  });

  it('caps tool executions at GUEST_MAX_STEPS (2) for guests', async () => {
    vi.mocked(executeTool).mockResolvedValue(SEARCH_RESULT as never);

    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            ...Array.from({ length: 4 }, (_v, i) =>
              toolCallPart(`c${i}`, 'search_listings', { semantic_query: `q${i}` }),
            ),
            finishPart('stop'),
          ] as LanguageModelV3StreamPart[],
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      }),
    });

    const events = await collect(
      runLlmTurn(
        baseInput(model, {
          isGuest: true,
          toolContext: {
            ...fakeContext,
            userId: undefined,
            allowedToolNames: ['search_listings'], // budget, not allowlist, must reject
          },
        }),
      ),
    );

    expect(vi.mocked(executeTool)).toHaveBeenCalledTimes(2);
    expect(events[events.length - 1]!.type).toBe('done');
  });

  it('caps across multiple steps too (cumulative per-turn budget)', async () => {
    vi.mocked(executeTool).mockResolvedValue(SEARCH_RESULT as never);

    // Three steps, 2 tool-calls each = 6 attempts. Auth cap is 5, so the 6th
    // must be rejected even though it lands in a fresh step.
    let step = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => {
        const current = step++;
        if (current < 3) {
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                toolCallPart(`s${current}a`, 'search_listings', { semantic_query: 'a' }),
                toolCallPart(`s${current}b`, 'search_listings', { semantic_query: 'b' }),
                finishPart('tool-calls'),
              ] as LanguageModelV3StreamPart[],
              initialDelayInMs: null,
              chunkDelayInMs: null,
            }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              ...textPart('t1', 'done'),
              FINISH,
            ] as LanguageModelV3StreamPart[],
            initialDelayInMs: null,
            chunkDelayInMs: null,
          }),
        };
      },
    });

    await collect(runLlmTurn(baseInput(model, { isGuest: false })));

    // Cumulative cap of 5 across steps — never 6.
    expect(vi.mocked(executeTool)).toHaveBeenCalledTimes(5);
  });
});

describe('runLlmTurn — provider error mapping', () => {
  it('rethrows a quota error so the route classifier still recognizes it', async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => {
        throw new Error('RESOURCE_EXHAUSTED: 429 quota exceeded');
      },
    });

    await expect(async () => {
      await collect(runLlmTurn(baseInput(model)));
    }).rejects.toThrow(/RESOURCE_EXHAUSTED|429|quota/);
  });

  it('rethrows a mid-stream error part as a throw', async () => {
    const model = streamModel([
      ...textPart('t1', 'partial'),
      { type: 'error', error: new Error('upstream 429 quota') },
    ]);

    await expect(async () => {
      await collect(runLlmTurn(baseInput(model)));
    }).rejects.toThrow(/429|quota/);
  });
});

describe('runLlmTurn — onTurnCost (AIN-9 cost projection + cap)', () => {
  it('fires onTurnCost with a projected cost from resolved usage', async () => {
    const onTurnCost = vi.fn();
    // Known usage on the finish part: 1000 input, 500 output, no cache.
    const usage = {
      inputTokens: { total: 1000, noCache: 1000, cacheRead: 0 },
      outputTokens: { total: 500, reasoning: 0 },
      totalTokens: 1500,
    } as never;
    const model = streamModel([
      ...textPart('t1', 'Here you go.'),
      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
    ]);

    await collect(runLlmTurn(baseInput(model, { onTurnCost })));

    expect(onTurnCost).toHaveBeenCalledTimes(1);
    const cost = onTurnCost.mock.calls[0]![0] as { costUsd: number; inputTokens: number; outputTokens: number };
    expect(cost.inputTokens).toBe(1000);
    expect(cost.outputTokens).toBe(500);
    // PR 2: active model is gpt-5.4-mini → 1000 * 0.75/M + 500 * 4.50/M.
    expect(cost.costUsd).toBeCloseTo(1000 * (0.75 / 1_000_000) + 500 * (4.5 / 1_000_000), 12);
  });

  it('logs cost_cap_exceeded (but does NOT throw) when the projected cost is over the cap', async () => {
    const onTurnCost = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Huge usage that breaches a tiny injected cap.
    const usage = {
      inputTokens: { total: 100_000, noCache: 100_000, cacheRead: 0 },
      outputTokens: { total: 60_000, reasoning: 0 },
      totalTokens: 160_000,
    } as never;
    const model = streamModel([
      ...textPart('t1', 'A very long answer.'),
      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
    ]);

    const events = await collect(
      runLlmTurn(baseInput(model, { onTurnCost, turnCostCapUsd: 0.001 })),
    );

    expect(onTurnCost).toHaveBeenCalledTimes(1);
    // Turn still completes cleanly — cap is observe-only, never throws.
    expect(events[events.length - 1]!.type).toBe('done');
    const loggedCapWarning = warnSpy.mock.calls.some((c) =>
      c.some((arg) => typeof arg === 'string' && arg.includes('cost_cap_exceeded')),
    );
    expect(loggedCapWarning).toBe(true);
    warnSpy.mockRestore();
  });

  it('does not fire onTurnCost when no callback is provided (no-op)', async () => {
    // Just asserts no throw when onTurnCost is absent.
    const model = streamModel([
      ...textPart('t1', 'ok'),
      finishPart('stop'),
    ]);
    const events = await collect(runLlmTurn(baseInput(model)));
    expect(events[events.length - 1]!.type).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// AIN-9 review FIX 1 — the cost-cap Langfuse tag must land on a real span.
//
// The old implementation called `updateActiveObservation` from AFTER the AI
// SDK's GenAI span had already ended (post `await result.totalUsage`), so the
// tag silently no-op'd — losing the A6 alerting signal. The fix is for
// `runLlmTurn` to start an OWNED span via `startObservation('cribai.llm_turn')`
// that encompasses the streamText call + drain + cost projection, and to pass
// that span handle into `tagCostCapExceeded(metadata, span?)`. This test pipes
// Langfuse's tracer through an in-memory OTel exporter and asserts a span
// actually carries the `cost_cap_exceeded` status-message attribute (not just
// "no throw").
// ---------------------------------------------------------------------------

describe('runLlmTurn — FIX 1: cost_cap_exceeded actually lands on a span', () => {
  it('exports a span with the cost_cap_exceeded status-message attribute when over cap', async () => {
    // Lazy-import the OTel test wiring so unrelated tests don't pay for it.
    const sdkBase = await import('@opentelemetry/sdk-trace-base');
    const sdkNode = await import('@opentelemetry/sdk-trace-node');
    const langfuseTracing = await import('@langfuse/tracing');

    const exporter = new sdkBase.InMemorySpanExporter();
    const provider = new sdkNode.NodeTracerProvider({
      spanProcessors: [new sdkBase.SimpleSpanProcessor(exporter)],
    });
    // Point the Langfuse-owned tracer at our in-memory provider, NOT the
    // global one — so we don't leak into other tests.
    langfuseTracing.setLangfuseTracerProvider(provider);

    // Force the LLM-first runtime to take the "Langfuse is on" branch even
    // without env keys (otherwise the cap tag is gated off in unit tests).
    const onTurnCost = vi.fn();
    const usage = {
      inputTokens: { total: 100_000, noCache: 100_000, cacheRead: 0 },
      outputTokens: { total: 60_000, reasoning: 0 },
      totalTokens: 160_000,
    } as never;
    const model = streamModel([
      ...textPart('t1', 'A very long answer.'),
      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
    ]);

    try {
      const events = await collect(
        runLlmTurn(
          baseInput(model, {
            onTurnCost,
            turnCostCapUsd: 0.001,
            // Pretend Langfuse is wired so the cap-tag branch executes.
            telemetryEnabled: true,
          }),
        ),
      );
      // Sanity: turn still streamed cleanly to done.
      expect(events[events.length - 1]!.type).toBe('done');
      expect(onTurnCost).toHaveBeenCalledTimes(1);

      // Forward exporter buffer through the provider's processor cycle.
      await provider.forceFlush();

      const spans = exporter.getFinishedSpans();
      const turnSpan = spans.find(
        (s) =>
          // Langfuse encodes statusMessage at
          // `langfuse.observation.status_message`. Any owned span carrying
          // `cost_cap_exceeded` proves the tag landed.
          s.attributes['langfuse.observation.status_message'] ===
          'cost_cap_exceeded',
      );
      expect(turnSpan).toBeDefined();
      // Defensive: the span must also carry the WARNING level so Langfuse
      // alerting can filter on it.
      expect(turnSpan!.attributes['langfuse.observation.level']).toBe('WARNING');
    } finally {
      // Tear down so other tests start clean.
      langfuseTracing.setLangfuseTracerProvider(null);
      await provider.shutdown();
    }
  });

  it('does NOT export a cost-cap span when the projected cost is under the cap', async () => {
    const sdkBase = await import('@opentelemetry/sdk-trace-base');
    const sdkNode = await import('@opentelemetry/sdk-trace-node');
    const langfuseTracing = await import('@langfuse/tracing');

    const exporter = new sdkBase.InMemorySpanExporter();
    const provider = new sdkNode.NodeTracerProvider({
      spanProcessors: [new sdkBase.SimpleSpanProcessor(exporter)],
    });
    langfuseTracing.setLangfuseTracerProvider(provider);

    const usage = {
      inputTokens: { total: 1000, noCache: 1000, cacheRead: 0 },
      outputTokens: { total: 500, reasoning: 0 },
      totalTokens: 1500,
    } as never;
    const model = streamModel([
      ...textPart('t1', 'Short answer.'),
      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
    ]);

    try {
      await collect(
        runLlmTurn(
          baseInput(model, {
            onTurnCost: vi.fn(),
            turnCostCapUsd: 1.0, // far above projection
            telemetryEnabled: true,
          }),
        ),
      );
      await provider.forceFlush();

      const spans = exporter.getFinishedSpans();
      const capSpan = spans.find(
        (s) =>
          s.attributes['langfuse.observation.status_message'] ===
          'cost_cap_exceeded',
      );
      expect(capSpan).toBeUndefined();
    } finally {
      langfuseTracing.setLangfuseTracerProvider(null);
      await provider.shutdown();
    }
  });
});

describe('runLlmTurn — PR 2: explicit cache gated to Google provider', () => {
  it('does NOT create an explicit cache under aiProvider=openai even when enabled', async () => {
    const cacheCreator = vi.fn(async () => ({ key: 'k', name: 'cachedContent/abc' }));
    const model = streamModel([...textPart('t1', 'Hello.'), FINISH]);

    const events = await collect(
      runLlmTurn(
        baseInput(model, {
          aiProvider: 'openai',
          explicitCache: true,
          cacheCreator,
        }),
      ),
    );

    // OpenAI has no explicit context cache → creator never invoked; the turn
    // still streams cleanly to a terminal `done` (graceful prefix-inline path).
    expect(cacheCreator).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('DOES create an explicit cache under aiProvider=google when enabled', async () => {
    const cacheCreator = vi.fn(async () => ({ key: 'k', name: 'cachedContent/abc' }));
    const model = streamModel([...textPart('t1', 'Hello.'), FINISH]);

    await collect(
      runLlmTurn(
        baseInput(model, {
          aiProvider: 'google',
          explicitCache: true,
          cacheCreator,
        }),
      ),
    );

    expect(cacheCreator).toHaveBeenCalledTimes(1);
  });
});
