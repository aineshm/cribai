/**
 * Tests for places-lookup step (AIN-71 step 4.3).
 *
 * AIN-77: placesApiKey is env-only. Tests use vi.stubEnv to provide the key;
 * ctx.input.placesApiKey is intentionally never set.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import type { StepContext } from '../../types';

function makeCtx(stateOverrides: Record<string, unknown> = {}): StepContext {
  return {
    missionId: 'mission-1',
    userId: 'user-1',
    campusId: 'uw-madison',
    campusSlug: 'uw-madison',
    input: { listingId: 'listing-1', sourceUrl: 'https://x01oncampus.com/' },
    state: stateOverrides,
    supabase: {} as unknown as StepContext['supabase'],
  };
}

const GEOCODE_RESULT = { latitude: 43.071, longitude: -89.402 };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('places_lookup step', () => {
  it('geocodes using best address from pages output', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key');
    vi.resetModules();
    const stubGeocode = vi.fn().mockResolvedValue(GEOCODE_RESULT);
    const { placesLookupStep } = await import('../steps/02-places-lookup');

    const ctx = makeCtx({
      pages: [
        { url: 'https://x01oncampus.com/', fields: { address: '640 W Dayton St, Madison, WI' }, textExcerpt: '' },
      ],
      discarded: [],
    });
    (ctx.input as Record<string, unknown>).geocode = stubGeocode;

    const result = await placesLookupStep.run(ctx);

    expect(stubGeocode).toHaveBeenCalledWith('640 W Dayton St, Madison, WI', 'test-key');
    expect(result.output.latitude).toBe(43.071);
    expect(result.output.longitude).toBe(-89.402);
  });

  it('falls back to row.address when pages have no address', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key');
    vi.resetModules();
    const stubGeocode = vi.fn().mockResolvedValue(GEOCODE_RESULT);
    const { placesLookupStep } = await import('../steps/02-places-lookup');

    const ctx = makeCtx({
      pages: [{ url: 'https://x01oncampus.com/', fields: {}, textExcerpt: '' }],
      discarded: [],
    });
    (ctx.input as Record<string, unknown>).geocode = stubGeocode;
    (ctx.input as Record<string, unknown>).rowAddress = '640 W Dayton St, Madison, WI';

    const result = await placesLookupStep.run(ctx);

    expect(stubGeocode).toHaveBeenCalledWith('640 W Dayton St, Madison, WI', 'test-key');
    expect(result.output.latitude).toBeDefined();
  });

  it('returns empty output (never throws) when geocode fails', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key');
    vi.resetModules();
    const stubGeocode = vi.fn().mockResolvedValue(null);
    const { placesLookupStep } = await import('../steps/02-places-lookup');

    const ctx = makeCtx({
      pages: [{ url: 'https://x01oncampus.com/', fields: { address: '640 W Dayton St' }, textExcerpt: '' }],
      discarded: [],
    });
    (ctx.input as Record<string, unknown>).geocode = stubGeocode;

    const result = await placesLookupStep.run(ctx);

    expect(result.output).toBeDefined();
    expect(result.output.latitude).toBeUndefined();
  });

  it('skips geocoding when no address candidate is available', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key');
    vi.resetModules();
    const stubGeocode = vi.fn().mockResolvedValue(GEOCODE_RESULT);
    const { placesLookupStep } = await import('../steps/02-places-lookup');

    const ctx = makeCtx({
      pages: [{ url: 'https://x01oncampus.com/', fields: {}, textExcerpt: '' }],
      discarded: [],
    });
    (ctx.input as Record<string, unknown>).geocode = stubGeocode;

    const result = await placesLookupStep.run(ctx);

    expect(stubGeocode).not.toHaveBeenCalled();
    expect(result.output.latitude).toBeUndefined();
  });

  it('geocodes using GOOGLE_PLACES_API_KEY env var when input key is absent', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'env-places-key');
    vi.resetModules();
    const stubGeocode = vi.fn().mockResolvedValue(GEOCODE_RESULT);
    const { placesLookupStep } = await import('../steps/02-places-lookup');

    const ctx = makeCtx({
      pages: [
        { url: 'https://x01oncampus.com/', fields: { address: '640 W Dayton St, Madison, WI' }, textExcerpt: '' },
      ],
      discarded: [],
    });
    (ctx.input as Record<string, unknown>).geocode = stubGeocode;
    // Deliberately omit placesApiKey from input

    const result = await placesLookupStep.run(ctx);

    expect(stubGeocode).toHaveBeenCalledWith('640 W Dayton St, Madison, WI', 'env-places-key');
    expect(result.output.latitude).toBe(43.071);
  });

  it('ignores placesApiKey set in ctx.input — env var is the sole authority (AIN-77)', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'correct-env-key');
    vi.resetModules();
    const stubGeocode = vi.fn().mockResolvedValue(GEOCODE_RESULT);
    const { placesLookupStep } = await import('../steps/02-places-lookup');

    const ctx = makeCtx({
      pages: [
        { url: 'https://x01oncampus.com/', fields: { address: '640 W Dayton St, Madison, WI' }, textExcerpt: '' },
      ],
      discarded: [],
    });
    (ctx.input as Record<string, unknown>).geocode = stubGeocode;
    // Deliberately set a different key in input — it must NOT be used
    (ctx.input as Record<string, unknown>).placesApiKey = 'wrong-input-key';

    const result = await placesLookupStep.run(ctx);

    // The env key should be used, not the input key
    expect(stubGeocode).toHaveBeenCalledWith('640 W Dayton St, Madison, WI', 'correct-env-key');
    expect(result.output.latitude).toBe(43.071);
  });
});
