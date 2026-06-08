/**
 * LIVE smoke for CRM tool CHAINING (AIN-15 Phase 2). Skipped unless
 * E2E_LIVE_OPENAI=1.
 *
 * The existing `openai-live.smoke.test.ts` proves the generic OpenAI tool loop.
 * This one proves the load-bearing CRM behavior the mocked unit tests cannot:
 * that `add_listing`'s `modelContext` INSTRUCTION actually drives the REAL
 * model to CHAIN a `first_save_analysis` call with the SAME `listing_id` that
 * `add_listing` returned.
 *
 * Real model, fake side-effects:
 *   - Model is the REAL `createAiSdkModel()` (gpt-5.4-mini by default).
 *   - The registry is built with a fake `ToolContext` carrying `dryRun: true`
 *     (Task A) so `add_listing` SKIPS the extract fetch + DB insert and returns
 *     a synthetic UUID — NO network, NO DB write. The chained
 *     `first_save_analysis` reads a canned row from the stubbed Supabase client
 *     and degrades gracefully (its Gemini/Places branches fail closed); it
 *     never writes and never throws.
 *   - The system prompt is intentionally NEUTRAL about chaining: it only tells
 *     the model to follow tool INSTRUCTIONS. The chaining must come from
 *     `add_listing`'s `modelContext`, which is the thing under test. The tool
 *     descriptions live in the registry so the model sees them regardless.
 *
 * Run (key passed inline, never committed):
 *   OPENAI_API_KEY=... E2E_LIVE_OPENAI=1 \
 *     pnpm --filter @campusnest/ai test crm-chaining-live
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolContext, ToolResult } from '../../tools/types';
import { buildToolRegistry, type RegistryToolName } from '../tool-registry';

const LIVE = process.env.E2E_LIVE_OPENAI === '1';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Stubbed Supabase client. Only `first_save_analysis` touches it (its step-1
 * read of crm_listings); `add_listing` is short-circuited by dryRun. We return
 * a canned row so the read never throws "Listing not found", letting the
 * handler resolve to a tool-result rather than a tool-error.
 */
function makeStubSupabase(): SupabaseClient {
  const cannedRow = {
    rent: 1200,
    amenities: ['WiFi'],
    description: 'A cozy studio near campus.',
    title: 'Studio near campus',
    address: '123 Main St, Madison, WI',
    coordinates: null,
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: cannedRow, error: null }),
    single: () => Promise.resolve({ data: cannedRow, error: null }),
  };
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
}

describe.skipIf(!LIVE)('CRM tool chaining — LIVE smoke (real gpt-5.4-mini)', () => {
  it('add_listing modelContext drives the model to chain first_save_analysis with the same listing_id', async () => {
    expect(
      process.env.OPENAI_API_KEY,
      'OPENAI_API_KEY must be set for the live smoke',
    ).toBeTruthy();

    const { streamText, stepCountIs } = await import('ai');
    const { createAiSdkModel, ACTIVE_MODEL_ID } = await import('../ai-sdk-provider');

    // --- Fake ToolContext: signed-in + dryRun so nothing writes. ---
    const context: ToolContext = {
      supabase: makeStubSupabase(),
      campusId: 'campus-smoke',
      campusSlug: 'uw-madison',
      userId: 'user-smoke',
      dryRun: true,
    };

    // --- Sink captures the full ToolResult per tool call (out-of-band). ---
    const sinkResults: Array<{ name: RegistryToolName; result: ToolResult }> = [];
    const sink = (
      _toolCallId: string,
      name: RegistryToolName,
      result: ToolResult,
    ): void => {
      sinkResults.push({ name, result });
    };

    const registry = buildToolRegistry(context, sink, { limit: 5, count: 0 });

    // --- Neutral system prompt — does NOT mention chaining. The model must
    //     learn to chain from add_listing's returned modelContext. ---
    const system = [
      'You are CribAI, a student-housing assistant with a personal CRM.',
      'You have tools. ALWAYS follow any INSTRUCTIONS that a tool returns to you',
      'in its result, including calling a follow-up tool when instructed.',
      'When the user pastes a listing URL, use the appropriate CRM tool to save it.',
    ].join('\n');

    const result = streamText({
      model: createAiSdkModel(),
      system,
      tools: registry,
      stopWhen: stepCountIs(4),
      prompt: 'Save this listing for me: https://example.com/listing/123',
    });

    // --- Collect ordered tool-call names + their inputs. ---
    const toolCallOrder: string[] = [];
    const toolCallInputs: Array<{ name: string; input: Record<string, unknown> }> = [];

    for await (const part of result.fullStream) {
      if (part.type === 'tool-call') {
        const p = part as { toolName: string; input?: Record<string, unknown> };
        toolCallOrder.push(p.toolName);
        toolCallInputs.push({ name: p.toolName, input: p.input ?? {} });
      }
    }

    const usage = await result.usage;

    // --- The listingId add_listing returned (embedded in its modelContext). ---
    const addListingResult = sinkResults.find((s) => s.name === 'add_listing');
    const returnedId =
      addListingResult?.result.modelContext.match(UUID_RE)?.[0] ?? null;

    const firstSaveCall = toolCallInputs.find((c) => c.name === 'first_save_analysis');

    // Surface the real shape regardless of pass/fail (key is NEVER logged).
    // eslint-disable-next-line no-console
    console.log(
      'LIVE_SMOKE_RESULT ' +
        JSON.stringify({
          model: ACTIVE_MODEL_ID,
          toolCallOrder,
          addListingReturnedId: returnedId,
          firstSaveListingIdArg: firstSaveCall?.input.listing_id ?? null,
          usage,
        }),
    );

    // 1. add_listing was called and returned a UUID listingId.
    expect(toolCallOrder).toContain('add_listing');
    expect(returnedId, 'add_listing modelContext must carry a UUID listingId').toBeTruthy();

    // 2. The model CHAINED first_save_analysis AFTER add_listing.
    expect(toolCallOrder).toContain('first_save_analysis');
    expect(
      toolCallOrder.indexOf('first_save_analysis'),
      'first_save_analysis must be called AFTER add_listing',
    ).toBeGreaterThan(toolCallOrder.indexOf('add_listing'));

    // 3. The chained call used the SAME listing_id add_listing returned.
    expect(firstSaveCall, 'first_save_analysis must have been called').toBeTruthy();
    expect(firstSaveCall?.input.listing_id).toBe(returnedId);
  }, 90_000);
});
