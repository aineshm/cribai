import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  });

  // --- Auth ---

  it('throws when userId is not present', async () => {
    const context = createMockContext({ userId: undefined });

    await expect(createSublease(validArgs, context)).rejects.toThrow(
      'This action requires signing in.',
    );
  });

  // --- Phase 1: Preview ---

  it('returns preview summary on Phase 1 (confirmed=false)', async () => {
    const context = createMockContext();

    const result = await createSublease(validArgs, context);

    expect(result.clientBlock.type).toBe('text');
    expect(result.modelContext).toContain('PREVIEW');
    expect(result.modelContext).toContain('Randall Station');
    expect(result.modelContext).toContain('$900');
    expect(result.modelContext).toContain('3 bed (1 available)');
  });

  it('shows "Negotiable" for missing rent in Phase 1', async () => {
    const context = createMockContext();
    const argsNoRent = { ...validArgs, rent_monthly: undefined };

    const result = await createSublease(argsNoRent, context);

    expect(result.modelContext).toContain('Negotiable');
  });

  it('includes geocode warning when geocoding fails in Phase 1', async () => {
    mockGeocode.mockResolvedValue(null);
    const context = createMockContext();

    const result = await createSublease(validArgs, context);

    expect(result.modelContext).toContain('could not verify the exact location');
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

    const context = createMockContext();
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

    const context = createMockContext();
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

    const context = createMockContext();
    const publishArgs = { ...validArgs, confirmed: true };

    await expect(createSublease(publishArgs, context)).rejects.toThrow(
      'A listing with this information already exists',
    );
  });

  // --- Validation ---

  it('throws on missing required fields', async () => {
    const context = createMockContext();
    const badArgs = { address: 'Some Place' };

    await expect(createSublease(badArgs, context)).rejects.toThrow();
  });

  it('throws on address too short', async () => {
    const context = createMockContext();
    const badArgs = { ...validArgs, address: 'Hi' };

    await expect(createSublease(badArgs, context)).rejects.toThrow();
  });
});
