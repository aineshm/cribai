/**
 * LIVE smoke for the OpenAI provider (PR 2). Skipped unless E2E_LIVE_OPENAI=1.
 *
 * Validates the load-bearing unknowns the mocked unit tests cannot cover — i.e.
 * that REAL gpt-5.4-mini stream parts match what the mocks assumed:
 *   1. A real tool call emits a `tool-call` fullStream part whose `.input` is
 *      POPULATED (not empty) — the #1 OpenAI Responses-API risk flagged in review.
 *   2. Ordering: `tool-call` precedes `tool-result`.
 *   3. usage.outputTokens populates so the cost projection is non-zero.
 *   4. Whether reasoning parts appear as their own stream-part type (so the
 *      llm-turn switch routes them away from visible prose).
 *
 * Run (key passed inline, never committed):
 *   OPENAI_API_KEY=... E2E_LIVE_OPENAI=1 pnpm --filter @campusnest/ai test openai-live
 */
import { describe, it, expect } from 'vitest';

const LIVE = process.env.E2E_LIVE_OPENAI === '1';

describe.skipIf(!LIVE)('OpenAI provider — LIVE smoke (real gpt-5.4-mini)', () => {
  it('emits a tool-call with populated input, correct ordering, and real usage', async () => {
    expect(
      process.env.OPENAI_API_KEY,
      'OPENAI_API_KEY must be set for the live smoke',
    ).toBeTruthy();

    const { streamText, stepCountIs, tool } = await import('ai');
    const { z } = await import('zod');
    const { createAiSdkModel, ACTIVE_MODEL_ID } = await import('../ai-sdk-provider');

    const model = createAiSdkModel();

    const result = streamText({
      model,
      stopWhen: stepCountIs(3),
      tools: {
        search_listings: tool({
          description:
            'Search apartment listings by criteria. Use this for any housing search.',
          inputSchema: z.object({
            semantic_query: z.string().describe('what the user is looking for'),
            max_rent: z.number().optional(),
          }),
          execute: async () => ({
            count: 2,
            listings: [
              { id: 'a', rent: 1400 },
              { id: 'b', rent: 1300 },
            ],
          }),
        }),
      },
      system:
        'You are a housing assistant. For any apartment search you MUST call the search_listings tool before answering.',
      prompt: 'Find me 2-bedroom apartments under $1500 near campus.',
    });

    const order: string[] = [];
    let toolCallInput: Record<string, unknown> | null = null;
    let toolCallIdx = -1;
    let toolResultIdx = -1;
    let sawText = false;

    for await (const part of result.fullStream) {
      order.push(part.type);
      if (part.type === 'tool-call') {
        toolCallInput = (part as { input?: Record<string, unknown> }).input ?? null;
        toolCallIdx = order.length - 1;
      }
      if (part.type === 'tool-result') toolResultIdx = order.length - 1;
      if (part.type === 'text-delta') sawText = true;
    }

    const usage = await result.usage;

    // Surface the real shape regardless of pass/fail (key is NOT logged).
    // eslint-disable-next-line no-console
    console.log(
      'LIVE_SMOKE_RESULT ' +
        JSON.stringify({
          model: ACTIVE_MODEL_ID,
          partTypes: order,
          toolCallInput,
          usage,
          sawText,
          hadReasoningPart:
            order.includes('reasoning-delta') || order.includes('reasoning-start'),
        }),
    );

    // 1. tool-call input populated
    expect(toolCallInput, 'tool-call must carry populated .input').toBeTruthy();
    expect(toolCallInput?.semantic_query, 'semantic_query must be present').toBeTruthy();
    // 2. ordering
    expect(toolCallIdx).toBeGreaterThanOrEqual(0);
    expect(toolResultIdx).toBeGreaterThan(toolCallIdx);
    // 3. real usage → non-zero cost projection
    expect(usage.outputTokens ?? 0).toBeGreaterThan(0);
  }, 90_000);
});
