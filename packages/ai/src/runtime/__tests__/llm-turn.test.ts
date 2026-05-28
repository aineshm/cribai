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

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { createEmptyConversationState } from '@campusnest/types';
import type { ConversationState } from '@campusnest/types';
import { EMPTY_PROFILE_SNIPPET } from '../system-prompt';
import type { ToolContext, ToolResult } from '../../tools/types';
import { runLlmTurn } from '../llm-turn';
import type { ChatEvent } from '../../cribai';

// Stub the executor so tool execution is deterministic + offline. The real
// allowlist guard is re-imported for the guest-rejection test.
vi.mock('../../tools/executor', () => ({
  executeTool: vi.fn(),
}));
import { executeTool } from '../../tools/executor';

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
    expect((toolResult.block as { content: string }).content.toLowerCase()).toContain(
      'signing in',
    );
    // Still terminates cleanly.
    expect(events[events.length - 1]!.type).toBe('done');
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
