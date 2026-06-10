/**
 * GATED live smoke for the CRM AI-SDK migration (AIN-15, Track C "#3").
 *
 * Exercises the REAL `defaultCrmGenerate` path (Vercel AI SDK `generateObject`
 * against the configured provider — OpenAI `gpt-5.4-mini` by default) end-to-end
 * through `inferProfile`. The unit tests inject a fake `generate`, so they pass
 * regardless of whether `generateObject` can actually produce these schemas on a
 * real provider. This smoke closes that blind spot:
 *
 *   - `GeminiProfileSchema.weights` is `z.record(z.string(), z.number())` — an
 *     open-ended map. OpenAI STRICT structured outputs reject open records
 *     (they require `additionalProperties: false`). @ai-sdk/openai defaults
 *     `strictJsonSchema` to TRUE, so without mitigation every real `inferProfile`
 *     call would throw → silently degrade to `needs_more_data` forever (a dead
 *     feature that still passes tsc, build, and all mocked tests).
 *
 *     `defaultCrmGenerate` therefore passes
 *     `providerOptions: { openai: { strictJsonSchema: false } }`. THIS is what
 *     makes the assertion below pass against a real OpenAI provider — this smoke
 *     is the regression gate that proves the relaxation works end-to-end.
 *
 * SKIPPED BY DEFAULT. Run only when explicitly opted in AND a key is present:
 *   E2E_LIVE_OPENAI=1 OPENAI_API_KEY=sk-... \
 *     pnpm --filter @campusnest/ai test -- infer-profile.live
 *
 * This test makes a real billable API call. Do NOT run it in CI by default.
 */

import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { inferProfile } from '../infer-profile';
import type { InferProfileDeps } from '../types';
import { fiveSavedRows } from '../__fixtures__/crm-rows';

const LIVE = process.env.E2E_LIVE_OPENAI === '1' && !!process.env.OPENAI_API_KEY;

// Thenable readDb stub returning the five saved rows (no real Supabase).
function makeReadDb(rows: unknown[]): SupabaseClient {
  const payload = { data: rows, error: null };
  const builder = {
    select: () => builder,
    eq: () => builder,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(payload).then(resolve),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

describe.skipIf(!LIVE)('inferProfile (LIVE OpenAI smoke)', () => {
  it('returns status:inferred against the real provider (z.record weights survive strict mode)', async () => {
    const readDb = makeReadDb(fiveSavedRows);
    // writeDb is never written: we run with dryRun:true so the smoke has no DB
    // side effect — we only care that the LLM call + schema validation succeed.
    const writeDb = { from: () => ({ upsert: async () => ({ error: null }) }) } as unknown as SupabaseClient;

    const deps: InferProfileDeps = {
      readDb,
      writeDb,
      userId: 'live-smoke-user',
      dryRun: true,
      // No `generate` injected → real defaultCrmGenerate → real generateObject.
    };

    const result = await inferProfile('live-smoke-user', deps);

    // The whole point: if strict structured outputs reject the open `weights`
    // record, this would be 'needs_more_data'. We assert the feature is ALIVE.
    expect(result.status).toBe('inferred');
    if (result.status === 'inferred') {
      expect(Object.keys(result.profile.weights).length).toBeGreaterThan(0);
    }
  }, 60_000);
});
