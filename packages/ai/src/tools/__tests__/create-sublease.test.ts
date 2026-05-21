import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMockContext } from './helpers';

// Mock geocoding
vi.mock('../lib/geocode-address', () => ({
  geocodeAddress: vi.fn(),
}));

// Mock @supabase/supabase-js to intercept the service-role client
const mockFrom = vi.fn();
const mockGetUserById = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: {
      admin: {
        getUserById: mockGetUserById,
      },
    },
  })),
}));

// Mock environment variables
vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-places-key');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('SUPABASE_SECRET_KEY', 'test-secret-key');

import { createSublease } from '../handlers/create-sublease';
import { geocodeAddress } from '../lib/geocode-address';

const mockGeocode = vi.mocked(geocodeAddress);

// --- .edu verification gate helpers (PDR-003 Track B Day 2) ---
//
// The handler now reads `profiles.is_edu_verified` from `context.supabase`
// before any preview/publish work. Tests build a context whose `supabase`
// stub returns the desired profile row from `from('profiles').select(...)
// .eq('id', ...).single()`.

interface ProfileFetchResult {
  data: { is_edu_verified: boolean } | null;
  error: { code?: string; message?: string } | null;
}

function buildContextWithProfile(profile: ProfileFetchResult) {
  const profileBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(profile),
  };
  const supabase = {
    from: vi.fn(() => profileBuilder),
  } as unknown as SupabaseClient;
  return createMockContext({ supabase });
}

function verifiedContext() {
  return buildContextWithProfile({
    data: { is_edu_verified: true },
    error: null,
  });
}

describe('createSublease', () => {
  const validArgs = {
    address: 'Randall Station, 1-2 W Dayton St, Madison WI',
    bedrooms_total: 3,
    bedrooms_available: 1,
    rent_monthly: 900,
    bathrooms: 1,
    available_from: '2026-01-15',
    available_to: '2026-05-15',
    description: 'Furnished room near campus. Heat included.',
    amenities: ['furnished', 'heat included', 'laundry'],
    confirmed: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGeocode.mockResolvedValue({ latitude: 43.0731, longitude: -89.4012 });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Auth ---

  it('throws when userId is not present', async () => {
    const context = createMockContext({ userId: undefined });

    await expect(createSublease(validArgs, context)).rejects.toThrow(
      'This action requires signing in.',
    );
  });

  // --- .edu verification gate (PDR-003 Track B Day 2) ---

  it('returns error block when user has no profile row (no_profile)', async () => {
    const context = buildContextWithProfile({
      data: null,
      error: { code: 'PGRST116', message: 'no rows found' },
    });

    const result = await createSublease(validArgs, context);

    expect(result.clientBlock.type).toBe('text');
    expect((result.clientBlock as { content: string }).content).toMatch(
      /verify-edu/,
    );
    expect(result.modelContext).toMatch(/SUBLEASE PUBLISH BLOCKED/);
    // Crucially, no preview/publish work happened — no insert was attempted.
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns error block when profile has is_edu_verified=false', async () => {
    const context = buildContextWithProfile({
      data: { is_edu_verified: false },
      error: null,
    });

    const result = await createSublease(validArgs, context);

    expect(result.clientBlock.type).toBe('text');
    expect((result.clientBlock as { content: string }).content).toMatch(
      /\.edu/,
    );
    expect((result.clientBlock as { content: string }).content).toMatch(
      /\/verify-edu/,
    );
    expect(result.modelContext).toMatch(/SUBLEASE PUBLISH BLOCKED/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does NOT render a preview for a non-verified user', async () => {
    // The codex P1 case: signed-in user with no .edu verification asks
    // CribAI to post a sublease — the tool must refuse BEFORE preview.
    const context = buildContextWithProfile({
      data: { is_edu_verified: false },
      error: null,
    });

    const result = await createSublease(validArgs, context);

    expect(result.modelContext).not.toContain('PREVIEW');
    expect(result.modelContext).not.toContain('Randall Station');
  });

  // --- Phase 1: Preview ---

  it('returns preview summary on Phase 1 (confirmed=false)', async () => {
    const context = verifiedContext();

    const result = await createSublease(validArgs, context);

    expect(result.clientBlock.type).toBe('text');
    expect(result.modelContext).toContain('PREVIEW');
    expect(result.modelContext).toContain('Randall Station');
    expect(result.modelContext).toContain('$900');
    expect(result.modelContext).toContain('3 bed (1 available)');
  });

  it('shows "Negotiable" for missing rent in Phase 1', async () => {
    const context = verifiedContext();
    const argsNoRent = { ...validArgs, rent_monthly: undefined };

    const result = await createSublease(argsNoRent, context);

    expect(result.modelContext).toContain('Negotiable');
  });

  it('includes geocode warning when geocoding fails in Phase 1', async () => {
    mockGeocode.mockResolvedValue(null);
    const context = verifiedContext();

    const result = await createSublease(validArgs, context);

    expect(result.modelContext).toContain('could not verify the exact location');
  });

  it('preserves same-day availability dates in Phase 1', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'));
    const context = verifiedContext();

    const result = await createSublease(
      {
        ...validArgs,
        available_from: '2026-05-15',
        available_to: '2026-05-15',
      },
      context,
    );

    expect(result.modelContext).toContain('Dates: 2026-05-15 to 2026-05-15');
  });

  it('normalizes leap-day dates when correcting past years', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'));
    const context = verifiedContext();

    const result = await createSublease(
      {
        ...validArgs,
        available_from: '2024-02-29',
        available_to: '2024-02-29',
      },
      context,
    );

    expect(result.modelContext).toContain('Dates: 2027-03-01 to 2027-03-01');
  });

  // --- Phase 2: Publish ---

  it('inserts listing and returns success on Phase 2 (confirmed=true)', async () => {
    // Mock user email resolution
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'jane@wisc.edu' } },
      error: null,
    });

    // Mock the insert chain: from().insert().select().single()
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'new-listing-id', address: validArgs.address },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert });

    const context = verifiedContext();
    const publishArgs = { ...validArgs, confirmed: true };

    const result = await createSublease(publishArgs, context);

    // Verify the result
    expect(result.modelContext).toContain('published');
    expect(result.modelContext).toContain('new-listing-id');
    expect(result.clientBlock.type).toBe('text');

    // Verify insert was called — first call is the listing insert,
    // subsequent calls may be analytics events (fire-and-forget)
    expect(mockInsert).toHaveBeenCalled();
    const insertPayload = mockInsert.mock.calls[0]![0] as Record<string, unknown>;

    expect(insertPayload.source).toBe('sublease');
    expect(insertPayload.campus_id).toBe('test-campus-id');
    expect(insertPayload.address).toBe(validArgs.address);
    expect(insertPayload.rent_monthly).toBe(900);
    expect(insertPayload.bedrooms).toBe(3);
    expect(insertPayload.bathrooms).toBe(1);
    expect(insertPayload.contact_email).toBe('jane@wisc.edu');
    expect(insertPayload.creator_id).toBe('test-user-id');
    expect(insertPayload.is_active).toBe(true);
    expect((insertPayload.external_id as string).startsWith('sublease-test-user-id-')).toBe(true);

    // Verify raw_data structure
    const rawData = insertPayload.raw_data as Record<string, unknown>;
    expect(rawData.submitted_by).toBe('test-user-id');
    expect(rawData.is_sublease).toBe(true);
    expect(rawData.bedrooms_available).toBe(1);
    expect(rawData.lease_end).toBe('2026-05-15');
    expect(rawData.furnished).toBeNull();
    expect(rawData.parking).toBeNull();

    // Verify location was set (geocoding succeeded)
    expect(insertPayload.location).toBe('SRID=4326;POINT(-89.4012 43.0731)');
  });

  it('uses provided contact_email instead of auth email', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'listing-2', address: 'Test St' },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert });

    const context = verifiedContext();
    const argsWithEmail = {
      ...validArgs,
      confirmed: true,
      contact_email: 'custom@wisc.edu',
    };

    await createSublease(argsWithEmail, context);

    const insertPayload = mockInsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertPayload.contact_email).toBe('custom@wisc.edu');
    // Should NOT have called getUserById since email was provided
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('throws on duplicate external_id (Phase 2)', async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'jane@wisc.edu' } },
      error: null,
    });

    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert });

    const context = verifiedContext();
    const publishArgs = { ...validArgs, confirmed: true };

    await expect(createSublease(publishArgs, context)).rejects.toThrow(
      'A listing with this information already exists',
    );
  });

  // --- Validation ---

  it('throws on missing required fields', async () => {
    const context = verifiedContext();
    const badArgs = { address: 'Some Place' };

    await expect(createSublease(badArgs, context)).rejects.toThrow();
  });

  it('throws on address too short', async () => {
    const context = verifiedContext();
    const badArgs = { ...validArgs, address: 'Hi' };

    await expect(createSublease(badArgs, context)).rejects.toThrow();
  });
});
