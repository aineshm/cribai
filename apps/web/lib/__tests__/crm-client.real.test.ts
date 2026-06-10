/**
 * Tests for the REAL crm-client (AIN-61) — NEXT_PUBLIC_CRM_MOCK=false.
 *
 * The module reads the flag at import time, so each test imports a fresh copy
 * via resetModules + dynamic import with the env stubbed to 'false'.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CrmClient } from '../crm-client';

const VIEWER = { id: 'u-1', name: 'Emma Chen' };

const ROW = {
  id: 'b7e8f3a0-1111-4222-8333-444455556666',
  user_id: 'u-1',
  source_url: 'https://www.zillow.com/x',
  source_site: 'zillow',
  title: 'Dayton Row · 2BR',
  address: '523 W Dayton St',
  rent: 1650,
  bedrooms: 2,
  bathrooms: 1,
  sqft: 880,
  available_from: '2026-08-15',
  description: 'desc',
  amenities: ['Dishwasher'],
  photo_urls: [],
  extraction_confidence: 0.9,
  status: 'active' as const,
  user_notes: null,
  saved_at: '2026-06-01T00:00:00Z',
};

const ROW_2 = { ...ROW, id: 'c8f9a4b1-2222-4333-9444-555566667777', title: 'Second Apt' };

const mockFetch = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function importRealClient(): Promise<CrmClient> {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_CRM_MOCK', 'false');
  const mod = await import('../crm-client');
  return mod.crmClient;
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('crmClient (real mode)', () => {
  it('listUnits GETs /api/crm/listings and adapts rows to CrmUnit', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ listings: [ROW, ROW_2], viewer: VIEWER }));
    const client = await importRealClient();

    const units = await client.listUnits();
    expect(mockFetch).toHaveBeenCalledWith('/api/crm/listings', undefined);
    expect(units).toHaveLength(2);
    expect(units[0]!.id).toBe(ROW.id);
    expect(units[0]!._proposed.addedBy).toBe(VIEWER.id);
    expect(units[0]!._proposed.application.stage).toBe('saved');
    expect(units[0]!._proposed.amenitySplit.unit).toEqual(['Dishwasher']);
  });

  it('getList synthesizes a single-member list from the session viewer', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ listings: [], viewer: VIEWER }));
    const client = await importRealClient();

    const list = await client.getList();
    expect(list.ownerId).toBe(VIEWER.id);
    expect(list.members).toHaveLength(1);
    expect(list.members[0]).toMatchObject({ id: VIEWER.id, name: VIEWER.name, initials: 'EC' });
  });

  it('deduplicates concurrent listUnits + getList into one fetch', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ listings: [ROW], viewer: VIEWER }));
    const client = await importRealClient();

    await Promise.all([client.listUnits(), client.getList()]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refetches after the in-flight request settles (no stale cache)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ listings: [ROW], viewer: VIEWER }));
    const client = await importRealClient();

    await client.listUnits();
    mockFetch.mockResolvedValue(jsonResponse({ listings: [ROW, ROW_2], viewer: VIEWER }));
    const units = await client.listUnits();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(units).toHaveLength(2);
  });

  it('firstUnitId returns the first row id after listUnits resolves', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ listings: [ROW, ROW_2], viewer: VIEWER }));
    const client = await importRealClient();

    await client.listUnits();
    expect(client.firstUnitId()).toBe(ROW.id);
  });

  it('firstUnitId throws before any listing fetch has resolved', async () => {
    const client = await importRealClient();
    expect(() => client.firstUnitId()).toThrow();
  });

  it('throws the server error message on a non-ok response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Authentication required' }, 401));
    const client = await importRealClient();
    await expect(client.listUnits()).rejects.toThrow('Authentication required');
  });

  it('addListing POSTs the sourceUrl and returns the AddListingResult', async () => {
    const result = { listingId: ROW.id, alreadySaved: false, confidence: 0.9 };
    mockFetch.mockResolvedValue(jsonResponse(result, 201));
    const client = await importRealClient();

    await expect(client.addListing('https://www.zillow.com/x')).resolves.toEqual(result);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/crm/listings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sourceUrl: 'https://www.zillow.com/x' }),
      }),
    );
  });

  it('rank POSTs the mode to /api/crm/rank', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ mode: 'rank', ranked: [] }));
    const client = await importRealClient();

    const result = await client.rank('rank');
    expect(result.mode).toBe('rank');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/crm/rank',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ mode: 'rank' }) }),
    );
  });

  it('deleteUnit resolves on a 204 with an empty body', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const client = await importRealClient();
    await expect(client.deleteUnit(ROW.id)).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/crm/listings/${ROW.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('getAnalysis GETs the analysis endpoint and rejects on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Listing not found' }, 404));
    const client = await importRealClient();
    await expect(client.getAnalysis(ROW.id)).rejects.toThrow('Listing not found');
  });
});
