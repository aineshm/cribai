/**
 * AIN-9 review FIX 2 (handler-level) — `create_sublease` with `confirmed=true`
 * + `dryRun=true` in the ToolContext must NOT insert into `listings` (or
 * touch the service-role write paths), but must return a synthetic success
 * result with the same shape so eval scoring sees the tool ran to completion.
 *
 * The eval HITL scorer detects leaks post-hoc; this guard PREVENTS the real
 * insert at the handler boundary so a missing/forgotten scorer doesn't allow
 * a stray sublease row to land during a `pnpm eval`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMockContext } from './helpers';

// Mock geocoding (same shape as create-sublease.test.ts).
vi.mock('../lib/geocode-address', () => ({
  geocodeAddress: vi.fn(),
}));

// Mock @supabase/supabase-js so the service-role client uses our spies.
const mockFrom = vi.fn();
const mockGetUserById = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: { admin: { getUserById: mockGetUserById } },
  })),
}));

vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-places-key');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('SUPABASE_SECRET_KEY', 'test-secret-key');

import { createSublease } from '../handlers/create-sublease';
import { geocodeAddress } from '../lib/geocode-address';
const mockGeocode = vi.mocked(geocodeAddress);

function verifiedContextWithDryRun(dryRun: boolean) {
  const profileBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { is_edu_verified: true },
      error: null,
    }),
  };
  const supabase = {
    from: vi.fn(() => profileBuilder),
  } as unknown as SupabaseClient;
  return createMockContext({ supabase, ...(dryRun ? { dryRun: true } : {}) } as never);
}

const validArgs = {
  address: 'Randall Station, 1-2 W Dayton St, Madison WI',
  bedrooms_total: 3,
  bedrooms_available: 1,
  rent_monthly: 900,
  bathrooms: 1,
  available_from: '2026-06-15',
  available_to: '2026-08-15',
  description: 'Furnished room near campus. Heat included.',
  amenities: ['furnished', 'heat included', 'laundry'],
  confirmed: true,
};

describe('createSublease — FIX 2 dryRun gate (no real insert in eval)', () => {
  beforeEach(() => {
    mockGeocode.mockResolvedValue({ latitude: 43.0731, longitude: -89.4012 });
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'jane@wisc.edu' } },
      error: null,
    });
    mockFrom.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('with dryRun=true + confirmed=true, does NOT call .insert and returns a synthetic success', async () => {
    // Wire a default insert chain — if the handler tried to use it, we
    // would observe the call. The dryRun gate must intercept BEFORE this.
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'should-never-be-used', address: validArgs.address },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert });

    const context = verifiedContextWithDryRun(true);
    const result = await createSublease(validArgs, context);

    // Load-bearing: no insert against the service-role client.
    expect(mockInsert).not.toHaveBeenCalled();

    // Shape parity: scorers still see a success result.
    expect(result.modelContext.toLowerCase()).toMatch(/published|dry[- ]?run/);
    expect(result.clientBlock.type).toBe('text');
  });

  it('with dryRun=false + confirmed=true, performs the real insert (byte-identical behavior)', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'new-listing-id', address: validArgs.address },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert });

    const context = verifiedContextWithDryRun(false);
    const result = await createSublease(validArgs, context);

    expect(mockInsert).toHaveBeenCalled();
    expect(result.modelContext).toContain('published');
  });
});
