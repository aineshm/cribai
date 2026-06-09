/**
 * Live-gated probe for the LLM-clean rare path (AIN-47, Layer 4).
 *
 * This test hits a REAL Gemini backend and is therefore SKIPPED in normal CI
 * (no credentials). It exists so a human can confirm, on demand, that the
 * prompt + responseSchema actually round-trip against the live model.
 *
 * To run it (Vertex AI via ADC):
 *
 *   E2E_LIVE_EXTRACTION=1 \
 *   GOOGLE_CLOUD_PROJECT=gen-lang-client-0963992961 \
 *   GOOGLE_CLOUD_LOCATION=us-west1 \
 *   GOOGLE_GENAI_USE_VERTEXAI=true \
 *   pnpm --filter @campusnest/ai test llm-parse.live
 *
 * Assertions are intentionally loose — model output is non-deterministic, so
 * we only assert the shape contract (object back; any returned price numeric).
 */

import { describe, it, expect } from 'vitest';

import { createLlmExtractor } from '../llm-parse';

const SAMPLE_HTML = `
  <h1>Cozy 2 Bedroom Apartment near UW-Madison Campus</h1>
  <p>Available August 15, 2026. $1,500/month. 1 bathroom, 850 sqft.</p>
  <p>Located at 123 W Gorham St, Madison, WI 53703.</p>
  <ul><li>In-unit laundry</li><li>Dishwasher</li><li>Heat included</li></ul>
  <p>Bright corner unit with hardwood floors, two blocks from State Street.</p>
`;

describe.skipIf(!process.env.E2E_LIVE_EXTRACTION)('live Gemini-via-Vertex LLM extraction', () => {
  it('returns an object (with a numeric price if any) for a synthetic listing', async () => {
    const extract = createLlmExtractor();
    const result = await extract(SAMPLE_HTML, 'https://example.com/listing/live-probe');

    expect(result).toBeTypeOf('object');
    expect(result).not.toBeNull();
    if (result.price !== undefined) {
      expect(typeof result.price).toBe('number');
    }
  }, 30_000);
});
