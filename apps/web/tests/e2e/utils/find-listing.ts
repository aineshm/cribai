import type { APIRequestContext } from '@playwright/test';

/**
 * Resolve a valid, active listing ID from the live DB so detail-page tests
 * don't depend on a hardcoded UUID that goes stale when scraper data churns.
 *
 * Strategy: hit /api/search/listings with broad filters and return the first
 * result. Cached for the run via a module-level promise.
 */
let cached: Promise<string> | null = null;

const FALLBACK_ID = '47bec7cf-7356-4c32-9980-502ff6462f57';

async function fetchActiveListingId(request: APIRequestContext): Promise<string> {
  const res = await request.post('http://localhost:3000/api/search/listings', {
    data: { campusSlug: 'uw-madison', limit: 5 },
    failOnStatusCode: false,
  });
  if (!res.ok()) return FALLBACK_ID;

  const body = await res.json().catch(() => null);
  const id = body?.listings?.[0]?.id ?? body?.resultListingIds?.[0];
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : FALLBACK_ID;
}

export function findActiveListingId(request: APIRequestContext): Promise<string> {
  if (!cached) cached = fetchActiveListingId(request);
  return cached;
}
