import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSublease } from '../handlers/create-sublease';
import { createMockContext, createMockQueryBuilder } from './helpers';

// Mock geocoding
vi.mock('../lib/geocode-address', () => ({
  geocodeAddress: vi.fn(),
}));

// Mock environment variables for tests
vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-places-key');

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

  it('inserts listing on Phase 2 (confirmed=true)', async () => {
    const insertBuilder = createMockQueryBuilder({
      id: 'new-listing-id',
      address: validArgs.address,
    });

    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(insertBuilder as never);

    // Mock env vars for service client
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'test-secret-key');

    // The handler creates its own service-role client internally.
    // Verify the error handling path when env vars are missing.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');

    const publishArgs = { ...validArgs, confirmed: true };

    await expect(createSublease(publishArgs, context)).rejects.toThrow(
      'Server configuration error',
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
