/**
 * LIVE smoke for CRM machineData over `runLlmTurn` (AIN-65). Skipped unless
 * E2E_LIVE_OPENAI=1.
 *
 * `crm-chaining-live.smoke.test.ts` proves the REAL model chains
 * add_listing → first_save_analysis from add_listing's modelContext. This
 * smoke proves the piece the CRM FRONT END depends on and mocked tests can't:
 * that a real paste-URL turn through `runLlmTurn` (the exact generator the
 * /api/ai/cribai llm_first path streams) yields `tool_result` ChatEvents
 * carrying BOTH cards' typed `machineData` payloads
 * (kind 'add_listing' AND kind 'first_save_analysis') on the wire.
 *
 * Real model, fake side-effects:
 *   - Model is the REAL `createAiSdkModel()` (gpt-5.4-mini by default).
 *   - `ToolContext.dryRun: true` so `add_listing` SKIPS the extract fetch +
 *     DB insert (synthetic UUID, `machineData.listing` is null by contract —
 *     the front end degrades to the text block in that case, which is fine:
 *     the assertion here is payload PRESENCE + kind, not the row).
 *   - `first_save_analysis` reads a canned row from the stubbed Supabase
 *     client; its Gemini/Places branches fail closed and the handler still
 *     emits the full-fanout machineData.
 *
 * Run (key passed inline, never committed):
 *   OPENAI_API_KEY=... E2E_LIVE_OPENAI=1 \
 *     pnpm --filter @campusnest/ai test crm-machinedata-live
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createEmptyConversationState } from '@campusnest/types';
import type { ToolContext } from '../../tools/types';
import type { ChatEvent } from '../../cribai';
import { EMPTY_PROFILE_SNIPPET } from '../system-prompt';
import { runLlmTurn } from '../llm-turn';

const LIVE = process.env.E2E_LIVE_OPENAI === '1';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Stub Supabase — only first_save_analysis's crm_listings read touches it. */
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

type ToolResultEvent = Extract<ChatEvent, { type: 'tool_result' }>;

describe.skipIf(!LIVE)('CRM machineData via runLlmTurn — LIVE smoke (real model)', () => {
  it('a paste-URL turn yields tool_result events with add_listing AND first_save_analysis machineData', async () => {
    expect(
      process.env.OPENAI_API_KEY,
      'OPENAI_API_KEY must be set for the live smoke',
    ).toBeTruthy();

    const { createAiSdkModel, ACTIVE_MODEL_ID } = await import('../ai-sdk-provider');

    const toolContext: ToolContext = {
      supabase: makeStubSupabase(),
      campusId: 'campus-smoke',
      campusSlug: 'uw-madison',
      userId: 'user-smoke',
      dryRun: true,
    };

    const events: ChatEvent[] = [];
    for await (const event of runLlmTurn({
      model: createAiSdkModel(),
      query: 'Save this listing for me: https://example.com/listing/123',
      state: createEmptyConversationState(),
      profile: EMPTY_PROFILE_SNIPPET,
      toolContext,
      campusName: 'UW-Madison',
      isGuest: false,
      history: [],
      telemetryEnabled: false,
    })) {
      events.push(event);
    }

    const toolResults = events.filter(
      (e): e is ToolResultEvent => e.type === 'tool_result',
    );
    const kinds = toolResults.map((e) => (e.machineData as { kind?: string } | undefined)?.kind);

    const addListing = toolResults.find(
      (e) => (e.machineData as { kind?: string } | undefined)?.kind === 'add_listing',
    );
    const firstSave = toolResults.find(
      (e) =>
        (e.machineData as { kind?: string } | undefined)?.kind === 'first_save_analysis',
    );

    // Surface the real wire shape regardless of pass/fail (key NEVER logged).
    // eslint-disable-next-line no-console
    console.log(
      'LIVE_SMOKE_RESULT ' +
        JSON.stringify({
          model: ACTIVE_MODEL_ID,
          eventTypes: events.map((e) => e.type),
          toolResultKinds: kinds,
          addListingResult: (addListing?.machineData as { result?: unknown } | undefined)?.result,
          firstSaveListingId: (
            (firstSave?.machineData as { analysis?: { listingId?: string } } | undefined)
              ?.analysis
          )?.listingId,
        }),
    );

    // 1. The saved-unit card's payload shipped on the wire.
    expect(addListing, "a tool_result with machineData.kind 'add_listing' must stream").toBeTruthy();
    const addMd = addListing!.machineData as {
      kind: string;
      result: { listingId: string };
      listing: unknown;
    };
    expect(addMd.result.listingId).toMatch(UUID_RE);

    // 2. The model CHAINED the analysis and ITS card payload shipped too,
    //    carrying the SAME listingId.
    expect(
      firstSave,
      "a tool_result with machineData.kind 'first_save_analysis' must stream",
    ).toBeTruthy();
    const fsaMd = firstSave!.machineData as { analysis: { listingId: string } };
    expect(fsaMd.analysis.listingId).toBe(addMd.result.listingId);

    // 3. Wire order — the save streams before its analysis (A10 contract).
    expect(toolResults.indexOf(firstSave!)).toBeGreaterThan(toolResults.indexOf(addListing!));

    // 4. The turn ends with the terminal done marker the route relies on.
    expect(events[events.length - 1]).toEqual({ type: 'done' });
  }, 120_000);
});
