/**
 * places_lookup step for crm_deep_extract mission (AIN-71).
 *
 * Takes the best address candidate from crawl_source pages output,
 * calls geocodeAddress, and outputs lat/lng. Never throws — Places is
 * enrichment, not a gate.
 */

import type { MissionStep, StepContext, StepResult } from '../../types';
import { geocodeAddress, type GeocodeResult } from '../../../tools/lib/geocode-address';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageRecord {
  readonly url: string;
  readonly fields: { address?: string };
  readonly textExcerpt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick the best address from the crawled pages + fallback inputs. */
function pickAddressCandidate(
  pages: readonly PageRecord[],
  rowAddress: string | undefined,
  rowTitle: string | undefined,
): string | null {
  for (const page of pages) {
    if (typeof page.fields?.address === 'string' && page.fields.address.trim()) {
      return page.fields.address.trim();
    }
  }
  if (rowAddress?.trim()) return rowAddress.trim();
  if (rowTitle?.trim()) return rowTitle.trim();
  return null;
}

type GeocodeFn = typeof geocodeAddress;

function resolveGeocodeFn(ctx: StepContext): GeocodeFn {
  const injected = (ctx.input as Record<string, unknown>).geocode;
  if (typeof injected === 'function') return injected as GeocodeFn;
  return geocodeAddress;
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

export const placesLookupStep: MissionStep = {
  id: 'places_lookup',
  label: 'Looking up location via Places',

  async run(ctx: StepContext): Promise<StepResult> {
    const pages = ((ctx.state as Record<string, unknown>).pages ?? []) as readonly PageRecord[];
    const rowAddress = (ctx.input as Record<string, unknown>).rowAddress as string | undefined;
    const rowTitle = (ctx.input as Record<string, unknown>).rowTitle as string | undefined;
    // AIN-77: key must come ONLY from the env var — never from mission input.
    // mission.input is persisted as JSONB and echoed back to the owner via
    // GET /api/missions/[id], so reading a key from input would store and
    // expose it. process.env is the sole authority.
    const placesApiKey = process.env['GOOGLE_PLACES_API_KEY'];

    const candidate = pickAddressCandidate(pages, rowAddress, rowTitle);

    if (!candidate || !placesApiKey) {
      return { output: {} };
    }

    const geoFn = resolveGeocodeFn(ctx);

    let result: GeocodeResult | null = null;
    try {
      result = await geoFn(candidate, placesApiKey);
    } catch {
      // geocoding failure → empty output, never throws
    }

    if (!result) {
      return { output: {} };
    }

    return {
      output: {
        latitude: result.latitude,
        longitude: result.longitude,
        resolvedAddress: candidate,
      },
    };
  },
};
