/**
 * GATED live smoke for the CRM AI-SDK migration — red-flag branch
 * (AIN-15, Track C "#3").
 *
 * Symmetric to `infer-profile.live.test.ts`: exercises the REAL
 * `defaultCrmGenerate` path (Vercel AI SDK `generateObject` against the
 * configured provider — OpenAI `gpt-5.4-mini` by default) end-to-end through
 * `firstSaveAnalysis`'s red-flag branch. The unit tests inject a fake `generate`,
 * so they never prove `RedFlagSchema` survives a real provider.
 *
 *   - `RedFlagSchema` uses `.max(200)` / `.max(10)` / `.max(500)` caps, which
 *     compile to `maxLength` / `maxItems` JSON-schema keywords. OpenAI STRICT
 *     structured outputs (the @ai-sdk/openai default) reject unsupported
 *     keywords → every real red-flag scan would throw → the branch silently
 *     degrades to `{status:'error'}` forever.
 *
 *     `defaultCrmGenerate` passes `providerOptions:{ openai:{ strictJsonSchema:
 *     false } }` to relax this. THIS smoke proves the red-flag branch returns
 *     `status:'ok'` against the real provider with the relaxation in place.
 *
 * SKIPPED BY DEFAULT. Run only when explicitly opted in AND a key is present:
 *   E2E_LIVE_OPENAI=1 OPENAI_API_KEY=sk-... \
 *     pnpm --filter @campusnest/ai test -- first-save-analysis.live
 *
 * This test makes a real billable API call. Do NOT run it in CI by default.
 */

import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { firstSaveAnalysis } from '../first-save-analysis';
import type { FirstSaveAnalysisDeps } from '../types';

const LIVE = process.env.E2E_LIVE_OPENAI === '1' && !!process.env.OPENAI_API_KEY;

// A listing row with a description + amenities so the red-flag branch runs.
const LIVE_ROW = {
  rent: 1400,
  amenities: ['In-Unit Laundry', 'Off-Street Parking'],
  description:
    'Cozy 2BR near campus. Landlord requires full year of rent upfront and a non-refundable application fee. Lease length not specified.',
  title: '2BR Near Campus',
  address: '123 Main St, Madison, WI 53706',
  coordinates: null, // null → placesSnapshot skipped; we only care about redFlags
};

// maybeSingle-style db stub returning LIVE_ROW (no real Supabase).
function makeDb(): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: LIVE_ROW, error: null }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

describe.skipIf(!LIVE)('firstSaveAnalysis red-flag branch (LIVE OpenAI smoke)', () => {
  it('redFlags:ok against the real provider (RedFlagSchema .max() caps survive strict-off mode)', async () => {
    const deps: FirstSaveAnalysisDeps = {
      db: makeDb(),
      userId: 'live-smoke-user',
      // No `generate` injected → real defaultCrmGenerate → real generateObject.
      // No placesApiKey → placesSnapshot skips; we assert only redFlags here.
    };

    const result = await firstSaveAnalysis('live-smoke-listing', deps);

    // The whole point: if strict structured outputs reject the `.max()` caps,
    // this would be 'error'. We assert the branch is ALIVE.
    expect(result.redFlags.status).toBe('ok');
    if (result.redFlags.status === 'ok') {
      expect(Array.isArray(result.redFlags.data.flags)).toBe(true);
      expect(typeof result.redFlags.data.summary).toBe('string');
    }
  }, 60_000);
});
