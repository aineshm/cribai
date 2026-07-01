/**
 * Handler adapter tests for CRM Phase 1 (AIN-15, Track C).
 *
 * These tests verify ONLY the adapter behavior — input validation, sign-in
 * gate, arg mapping, and ToolResult shaping. Core logic is fully mocked.
 *
 * vi.mock calls are hoisted to the top of the module by Vitest.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolContext, ToolResult } from '../../tools/types';
import type { AddListingResult, FirstSaveAnalysis, InferProfileResult, RankCompareResult } from '../types';
import type { AddListingMachineData, FirstSaveAnalysisMachineData, RankCompareMachineData } from '../handlers/types';

// ---------------------------------------------------------------------------
// Mock the 4 cores + service-client
// ---------------------------------------------------------------------------

vi.mock('../add-listing', () => ({
  addListing: vi.fn(),
  AddListingError: class AddListingError extends Error {
    code: string;
    userMessage: string;
    constructor(code: string, userMessage: string) {
      super(userMessage);
      this.name = 'AddListingError';
      this.code = code;
      this.userMessage = userMessage;
    }
  },
}));

vi.mock('../first-save-analysis', () => ({
  firstSaveAnalysis: vi.fn(),
}));

vi.mock('../infer-profile', () => ({
  inferProfile: vi.fn(),
}));

vi.mock('../rank-compare', () => ({
  rankCompare: vi.fn(),
}));

vi.mock('../service-client', () => ({
  getCrmServiceClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { addListing, AddListingError } from '../add-listing';
import { firstSaveAnalysis } from '../first-save-analysis';
import { inferProfile } from '../infer-profile';
import { rankCompare } from '../rank-compare';
import { getCrmServiceClient } from '../service-client';

import { addListingHandler } from '../handlers/add-listing-handler';
import { firstSaveAnalysisHandler } from '../handlers/first-save-analysis-handler';
import { inferProfileHandler } from '../handlers/infer-profile-handler';
import { rankCompareHandler } from '../handlers/rank-compare-handler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockDb(): SupabaseClient {
  return {} as unknown as SupabaseClient;
}

/**
 * Chainable mock Supabase client for the post-save crm_listings read-back in
 * addListingHandler: .from().select().eq().eq().maybeSingle().
 */
function makeListingFetchDb(
  row: Record<string, unknown> | null,
  error: { message: string } | null = null,
): { db: SupabaseClient; from: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> } {
  const builder: Record<string, unknown> = {};
  const select = vi.fn().mockReturnValue(builder);
  const eq = vi.fn().mockReturnValue(builder);
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error });
  builder['select'] = select;
  builder['eq'] = eq;
  builder['maybeSingle'] = maybeSingle;
  const from = vi.fn().mockReturnValue(builder);
  return { db: { from } as unknown as SupabaseClient, from, select, eq };
}

/** A full crm_listings row as the read-back select projects it. */
const SAVED_ROW = {
  id: 'listing-uuid-1',
  user_id: 'user-abc-123',
  source_url: 'https://zillow.com/foo',
  source_site: 'zillow',
  title: 'Test Apt',
  address: '123 W Main St',
  rent: 1200,
  bedrooms: 2,
  bathrooms: 1,
  sqft: 800,
  available_from: '2026-08-15',
  description: 'Nice place',
  amenities: ['gym'],
  photo_urls: [],
  extraction_confidence: 0.9,
  status: 'active',
  user_notes: null,
  saved_at: '2026-06-01T00:00:00Z',
};

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    supabase: makeMockDb(),
    campusId: 'campus-uw',
    campusSlug: 'uw-madison',
    userId: 'user-abc-123',
    ...overrides,
  };
}

function assertTextBlock(result: ToolResult): void {
  expect(result.modelContext).toEqual(expect.any(String));
  expect(result.clientBlock.type).toBe('text');
  // Narrow to text block to access .content
  if (result.clientBlock.type === 'text') {
    expect(result.clientBlock.content).toEqual(expect.any(String));
  }
}

// ---------------------------------------------------------------------------
// addListingHandler
// ---------------------------------------------------------------------------

describe('addListingHandler', () => {
  const mockAddListing = vi.mocked(addListing);
  const mockFirstSaveAnalysis = vi.mocked(firstSaveAnalysis);

  beforeEach(() => {
    vi.resetAllMocks();
    // Default: firstSaveAnalysis resolves immediately (fire-and-forget harmless)
    mockFirstSaveAnalysis.mockResolvedValue({} as FirstSaveAnalysis);
  });

  it('returns sign-in ToolResult when userId is missing; core not called', async () => {
    const ctx = makeContext({ userId: undefined });
    const result = await addListingHandler({ url: 'https://zillow.com/foo' }, ctx);

    expect(mockAddListing).not.toHaveBeenCalled();
    expect(result.modelContext).toMatch(/sign.in/i);
    assertTextBlock(result);
  });

  it('returns graceful ToolResult for invalid url; core not called', async () => {
    const ctx = makeContext();
    const result = await addListingHandler({ url: 'not-a-url' }, ctx);

    expect(mockAddListing).not.toHaveBeenCalled();
    assertTextBlock(result);
  });

  it('returns graceful ToolResult for missing url; core not called', async () => {
    const ctx = makeContext();
    const result = await addListingHandler({}, ctx);

    expect(mockAddListing).not.toHaveBeenCalled();
    assertTextBlock(result);
  });

  it('calls addListing with context.supabase as db and context.userId; does NOT pass an onSaved hook (AIN-15 Phase 2)', async () => {
    const ctx = makeContext();
    const addResult: AddListingResult = { listingId: 'listing-uuid-1', alreadySaved: false, confidence: 0.9 };
    mockAddListing.mockResolvedValueOnce(addResult);

    const result = await addListingHandler({ url: 'https://zillow.com/foo' }, ctx);

    expect(mockAddListing).toHaveBeenCalledOnce();
    const callArgs = mockAddListing.mock.calls[0]!;
    expect(callArgs[0]).toBe('https://zillow.com/foo');
    const deps = callArgs[1];
    expect(deps.db).toBe(ctx.supabase);
    expect(deps.userId).toBe(ctx.userId);
    // AIN-15 Phase 2: analysis is model-driven; the handler no longer wires a
    // fire-and-forget onSaved hook.
    expect(deps.onSaved).toBeUndefined();

    expect(result.modelContext).toContain('listing-uuid-1');
    assertTextBlock(result);
  });

  it('new save: modelContext FORCEFULLY instructs the model to call first_save_analysis with the listing id', async () => {
    const ctx = makeContext();
    const addResult: AddListingResult = { listingId: 'listing-uuid-1', alreadySaved: false, confidence: 0.9 };
    mockAddListing.mockResolvedValueOnce(addResult);

    const result = await addListingHandler({ url: 'https://zillow.com/foo' }, ctx);

    // Reports the save WITH the id, and instructs the chained tool call.
    expect(result.modelContext).toMatch(/saved/i);
    expect(result.modelContext).toContain('first_save_analysis');
    expect(result.modelContext).toContain('listing_id="listing-uuid-1"');
    // No false promise of an automatic/background analysis.
    expect(result.modelContext).not.toMatch(/analysis is running/i);
    // Client copy must not over-promise an automatic analysis either.
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).not.toMatch(/will be ready in a moment/i);
    }
  });

  it('returns ToolResult with "already in CRM" note when alreadySaved is true; allows on-request analysis, no auto-chain', async () => {
    const ctx = makeContext();
    const addResult: AddListingResult = { listingId: 'listing-uuid-2', alreadySaved: true, confidence: 0.8 };
    mockAddListing.mockResolvedValueOnce(addResult);

    const result = await addListingHandler({ url: 'https://zillow.com/bar' }, ctx);

    expect(result.modelContext).toMatch(/already/i);
    // The dedup path does NOT auto-start an analysis — must not claim one runs.
    expect(result.modelContext).not.toMatch(/analysis is running/i);
    expect(result.modelContext).not.toMatch(/no new analysis was started[\s\S]*call the first_save_analysis tool now/i);
    // But it still tells the model it CAN run first_save_analysis on request.
    expect(result.modelContext).toContain('first_save_analysis');
    assertTextBlock(result);
  });

  it('returns graceful ToolResult when addListing throws AddListingError', async () => {
    const ctx = makeContext();
    // Use the mocked AddListingError class
    const err = new AddListingError('fetch_failed', 'I could not reach that page.');
    mockAddListing.mockRejectedValueOnce(err);

    const result = await addListingHandler({ url: 'https://zillow.com/bad' }, ctx);

    expect(result.modelContext).toBeTruthy();
    assertTextBlock(result);
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('I could not reach that page.');
    }
  });

  it('AIN-15 Phase 2: does NOT auto-invoke firstSaveAnalysis (no fire-and-forget onSaved hook)', async () => {
    const ctx = makeContext();
    const addResult: AddListingResult = { listingId: 'listing-uuid-3', alreadySaved: false, confidence: 0.9 };

    let capturedDeps: Parameters<typeof addListing>[1] | null = null;
    mockAddListing.mockImplementationOnce(async (_url, deps) => {
      capturedDeps = deps;
      return addResult;
    });

    await addListingHandler({ url: 'https://zillow.com/baz' }, ctx);

    // No onSaved hook is wired anymore.
    expect(capturedDeps).not.toBeNull();
    expect(capturedDeps!.onSaved).toBeUndefined();

    // Flush microtasks just in case — firstSaveAnalysis must NEVER be invoked
    // by the handler now; the model drives it via the separate tool.
    await Promise.resolve();
    expect(mockFirstSaveAnalysis).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// firstSaveAnalysisHandler
// ---------------------------------------------------------------------------

describe('firstSaveAnalysisHandler', () => {
  const mockFsa = vi.mocked(firstSaveAnalysis);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns sign-in ToolResult when userId is missing; core not called', async () => {
    const ctx = makeContext({ userId: undefined });
    const result = await firstSaveAnalysisHandler({ listing_id: '00000000-0000-0000-0000-000000000001' }, ctx);

    expect(mockFsa).not.toHaveBeenCalled();
    expect(result.modelContext).toMatch(/sign.in/i);
    assertTextBlock(result);
  });

  it('returns graceful ToolResult for invalid listing_id (not uuid); core not called', async () => {
    const ctx = makeContext();
    const result = await firstSaveAnalysisHandler({ listing_id: 'not-a-uuid' }, ctx);

    expect(mockFsa).not.toHaveBeenCalled();
    assertTextBlock(result);
  });

  it('returns graceful ToolResult for missing listing_id; core not called', async () => {
    const ctx = makeContext();
    const result = await firstSaveAnalysisHandler({}, ctx);

    expect(mockFsa).not.toHaveBeenCalled();
    assertTextBlock(result);
  });

  it('calls firstSaveAnalysis with correct args and returns shaped ToolResult', async () => {
    const ctx = makeContext();
    const listingId = '00000000-0000-0000-0000-000000000002';

    const fsaResult: FirstSaveAnalysis = {
      listingId,
      trueCost: {
        status: 'ok',
        data: {
          rent: 1200,
          utilities: 80,
          parking: 0,
          internet: 0,
          laundry: 0,
          renterInsurance: 0,
          moveInFees: 0,
          total: 1280,
        },
      },
      redFlags: { status: 'ok', data: { flags: ['no photos'], summary: 'One flag found.' } },
      placesSnapshot: { status: 'skipped', reason: 'no coordinates' },
      steeringQuestion: { status: 'ok', data: { question: 'What matters most?' } },
    };
    mockFsa.mockResolvedValueOnce(fsaResult);

    const result = await firstSaveAnalysisHandler({ listing_id: listingId }, ctx);

    expect(mockFsa).toHaveBeenCalledOnce();
    expect(mockFsa).toHaveBeenCalledWith(
      listingId,
      expect.objectContaining({ db: ctx.supabase, userId: ctx.userId }),
    );

    // ok branches should appear in output
    expect(result.modelContext).toContain('1280');     // trueCost total
    expect(result.modelContext).toContain('no photos'); // red flag
    assertTextBlock(result);
    // skipped branch should not appear in clientBlock
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).not.toContain('no coordinates');
    }
  });

  it('returns graceful ToolResult when core throws Listing not found', async () => {
    const ctx = makeContext();
    mockFsa.mockRejectedValueOnce(new Error('Listing not found'));

    const result = await firstSaveAnalysisHandler(
      { listing_id: '00000000-0000-0000-0000-000000000003' },
      ctx,
    );

    expect(result.modelContext).toBeTruthy();
    assertTextBlock(result);
  });

  // FIX 5: formatTrueCost label math must reconcile — components stated must sum to total.
  it('FIX 5 — formatTrueCost string: stated components reconcile to total (rent=1400, total=1740)', async () => {
    const ctx = makeContext();
    const listingId = '00000000-0000-0000-0000-000000000099';

    const fsaResult: FirstSaveAnalysis = {
      listingId,
      trueCost: {
        status: 'ok',
        data: {
          rent: 1400,
          utilities: 200,
          parking: 80,
          internet: 40,
          laundry: 20,
          renterInsurance: 0,
          moveInFees: 0,
          total: 1740,
        },
      },
      redFlags: { status: 'skipped', reason: 'no description' },
      placesSnapshot: { status: 'skipped', reason: 'no coordinates' },
      steeringQuestion: { status: 'ok', data: { question: 'What matters most?' } },
    };
    mockFsa.mockResolvedValueOnce(fsaResult);

    const result = await firstSaveAnalysisHandler({ listing_id: listingId }, ctx);

    // The trueCost string must mention both the rent ($1400) and the addon difference ($340).
    // The numbers in the string must reconcile to the total (1740).
    expect(result.modelContext).toContain('1740');
    expect(result.modelContext).toContain('1400');
    // Addons = total - rent = 1740 - 1400 = 340
    expect(result.modelContext).toContain('340');
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('1740');
      expect(result.clientBlock.content).toContain('1400');
      expect(result.clientBlock.content).toContain('340');
    }
  });
});

// ---------------------------------------------------------------------------
// inferProfileHandler
// ---------------------------------------------------------------------------

describe('inferProfileHandler', () => {
  const mockInferProfile = vi.mocked(inferProfile);
  const mockGetCrmServiceClient = vi.mocked(getCrmServiceClient);

  beforeEach(() => {
    vi.resetAllMocks();
    // Default: getCrmServiceClient returns a mock db
    mockGetCrmServiceClient.mockReturnValue(makeMockDb());
  });

  it('returns sign-in ToolResult when userId is missing; core not called', async () => {
    const ctx = makeContext({ userId: undefined });
    const result = await inferProfileHandler({}, ctx);

    expect(mockInferProfile).not.toHaveBeenCalled();
    expect(result.modelContext).toMatch(/sign.in/i);
    assertTextBlock(result);
  });

  it('calls inferProfile with readDb=context.supabase and uses getCrmServiceClient as writeDb', async () => {
    const ctx = makeContext();
    const mockWriteDb = makeMockDb();
    mockGetCrmServiceClient.mockReturnValueOnce(mockWriteDb);

    const inferResult: InferProfileResult = {
      status: 'inferred',
      profile: {
        rent_min: 900,
        rent_max: 1400,
        bedrooms_target: 2,
        must_have_amenities: ['gym'],
        nice_to_have_amenities: ['parking'],
        home_base_address: null,
        commute_max_minutes: null,
        weights: { rent: 0.5, commute: 0.3, space: 0.2 },
        confidence: 0.7,
      },
    };
    mockInferProfile.mockResolvedValueOnce(inferResult);

    const result = await inferProfileHandler({}, ctx);

    expect(mockInferProfile).toHaveBeenCalledOnce();
    expect(mockInferProfile).toHaveBeenCalledWith(
      ctx.userId,
      expect.objectContaining({
        readDb: ctx.supabase,
        writeDb: mockWriteDb,
        userId: ctx.userId,
      }),
    );

    expect(result.modelContext).toContain('900');
    expect(result.modelContext).toContain('1400');
    assertTextBlock(result);
  });

  it('returns needs_more_data ToolResult surfacing steering question', async () => {
    const ctx = makeContext();
    const inferResult: InferProfileResult = {
      status: 'needs_more_data',
      savedCount: 1,
      steeringQuestion: 'What matters most in your next place?',
    };
    mockInferProfile.mockResolvedValueOnce(inferResult);

    const result = await inferProfileHandler({}, ctx);

    expect(result.modelContext).toContain('What matters most');
    assertTextBlock(result);
    if (result.clientBlock.type === 'text') {
      expect(result.clientBlock.content).toContain('What matters most');
    }
  });

  it('returns graceful ToolResult when getCrmServiceClient throws (missing env)', async () => {
    const ctx = makeContext();
    mockGetCrmServiceClient.mockImplementationOnce(() => {
      throw new Error('Server configuration error. Please try again later.');
    });

    const result = await inferProfileHandler({}, ctx);

    expect(mockInferProfile).not.toHaveBeenCalled();
    expect(result.modelContext).toBeTruthy();
    assertTextBlock(result);
  });
});

// ---------------------------------------------------------------------------
// rankCompareHandler
// ---------------------------------------------------------------------------

describe('rankCompareHandler', () => {
  const mockRankCompare = vi.mocked(rankCompare);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns sign-in ToolResult when userId is missing; core not called', async () => {
    const ctx = makeContext({ userId: undefined });
    const result = await rankCompareHandler({}, ctx);

    expect(mockRankCompare).not.toHaveBeenCalled();
    expect(result.modelContext).toMatch(/sign.in/i);
    assertTextBlock(result);
  });

  it('calls rankCompare with correct mapped args (listing_titles→listingTitles, listing_ids→listingIds)', async () => {
    const ctx = makeContext();
    const rcResult: RankCompareResult = {
      mode: 'compare',
      rows: [
        { listingId: 'id1', title: 'Listing A', rent: 1200, bedrooms: 2, bathrooms: 1, sqft: 800, amenities: ['gym'] },
        { listingId: 'id2', title: 'Listing B', rent: 1400, bedrooms: 3, bathrooms: 2, sqft: 1000, amenities: [] },
      ],
    };
    mockRankCompare.mockResolvedValueOnce(rcResult);

    const args = {
      mode: 'compare',
      listing_titles: ['Listing A', 'Listing B'],
      listing_ids: undefined,
    };
    const result = await rankCompareHandler(args, ctx);

    expect(mockRankCompare).toHaveBeenCalledOnce();
    const callArgs = mockRankCompare.mock.calls[0]!;
    const mappedArgs = callArgs[0];
    // Key mapping verified
    expect(mappedArgs).toMatchObject({
      mode: 'compare',
      listingTitles: ['Listing A', 'Listing B'],
    });
    expect('listing_titles' in mappedArgs).toBe(false);

    assertTextBlock(result);
  });

  it('maps listing_ids → listingIds correctly', async () => {
    const ctx = makeContext();
    const rcResult: RankCompareResult = { mode: 'rank', ranked: [] };
    mockRankCompare.mockResolvedValueOnce(rcResult);

    await rankCompareHandler(
      { mode: 'rank', listing_ids: ['00000000-0000-0000-0000-000000000001'] },
      ctx,
    );

    const callArgs = mockRankCompare.mock.calls[0]!;
    expect(callArgs[0]).toMatchObject({ listingIds: ['00000000-0000-0000-0000-000000000001'] });
    expect('listing_ids' in callArgs[0]).toBe(false);
  });

  it('returns graceful ToolResult for invalid mode; core not called', async () => {
    const ctx = makeContext();
    const result = await rankCompareHandler({ mode: 'invalid-mode' }, ctx);

    expect(mockRankCompare).not.toHaveBeenCalled();
    assertTextBlock(result);
  });

  it('formats rank result as ordered list in modelContext', async () => {
    const ctx = makeContext();
    const rcResult: RankCompareResult = {
      mode: 'rank',
      ranked: [
        { listingId: 'id1', title: 'Best Apt', score: 0.88, breakdown: { rent: 0.9, bedrooms: 0.8 } },
        { listingId: 'id2', title: 'Second Apt', score: 0.72, breakdown: { rent: 0.7, bedrooms: 0.75 } },
      ],
    };
    mockRankCompare.mockResolvedValueOnce(rcResult);

    const result = await rankCompareHandler({ mode: 'rank' }, ctx);

    expect(result.modelContext).toContain('Best Apt');
    expect(result.modelContext).toContain('Second Apt');
    expect(result.modelContext).toContain('0.88');
    assertTextBlock(result);
  });

  it('formats compare result as side-by-side in modelContext', async () => {
    const ctx = makeContext();
    const rcResult: RankCompareResult = {
      mode: 'compare',
      rows: [
        { listingId: 'id1', title: 'Place A', rent: 1100, bedrooms: 2, bathrooms: 1, sqft: 750, amenities: [] },
        { listingId: 'id2', title: 'Place B', rent: 1300, bedrooms: 3, bathrooms: 2, sqft: 950, amenities: ['gym'] },
      ],
    };
    mockRankCompare.mockResolvedValueOnce(rcResult);

    const result = await rankCompareHandler({ mode: 'compare' }, ctx);

    expect(result.modelContext).toContain('Place A');
    expect(result.modelContext).toContain('Place B');
    expect(result.modelContext).toContain('1100');
    expect(result.modelContext).toContain('1300');
    assertTextBlock(result);
  });

  it('returns graceful ToolResult when core throws', async () => {
    const ctx = makeContext();
    mockRankCompare.mockRejectedValueOnce(new Error('rankCompare: failed to fetch listings'));

    const result = await rankCompareHandler({}, ctx);

    expect(result.modelContext).toBeTruthy();
    assertTextBlock(result);
  });
});

// ---------------------------------------------------------------------------
// machineData emission (AIN-65)
// ---------------------------------------------------------------------------
//
// The merged CRM front end renders typed cards (SavedUnitCard,
// FirstSaveAnalysisCard, RankCompareTable) from `ToolResult.machineData`.
// These tests pin the discriminated payload each handler must emit alongside
// the unchanged text clientBlock.

describe('machineData emission (AIN-65)', () => {
  const mockAddListing = vi.mocked(addListing);
  const mockFsa = vi.mocked(firstSaveAnalysis);
  const mockInferProfile = vi.mocked(inferProfile);
  const mockRankCompare = vi.mocked(rankCompare);
  const mockGetCrmServiceClient = vi.mocked(getCrmServiceClient);

  beforeEach(() => {
    vi.resetAllMocks();
    mockGetCrmServiceClient.mockReturnValue(makeMockDb());
  });

  // --- addListingHandler ---

  describe('addListingHandler', () => {
    it('new save: emits { kind: add_listing, result, listing } with the read-back crm_listings row', async () => {
      const { db, from, select, eq } = makeListingFetchDb(SAVED_ROW);
      const ctx = makeContext({ supabase: db });
      const addResult: AddListingResult = { listingId: 'listing-uuid-1', alreadySaved: false, confidence: 0.9 };
      mockAddListing.mockResolvedValueOnce(addResult);

      const result = await addListingHandler({ url: 'https://zillow.com/foo' }, ctx);

      expect(result.machineData).toEqual({
        kind: 'add_listing',
        result: addResult,
        listing: SAVED_ROW,
        show_card: true,
      });
      // Read-back is scoped to the saved row AND the signed-in user.
      expect(from).toHaveBeenCalledWith('crm_listings');
      expect(eq).toHaveBeenCalledWith('id', 'listing-uuid-1');
      expect(eq).toHaveBeenCalledWith('user_id', 'user-abc-123');
      // The projection must stay explicit: never `*`, never the PostGIS WKB
      // `coordinates` blob — this row ships to the browser via SSE machineData.
      const projection = String(select.mock.calls[0]?.[0]);
      expect(projection).not.toBe('*');
      expect(projection).not.toContain('coordinates');
      // Text clientBlock is unchanged (legacy explore chat fallback).
      assertTextBlock(result);
    });

    it('dedup (alreadySaved): still emits machineData with the existing row', async () => {
      const { db } = makeListingFetchDb({ ...SAVED_ROW, id: 'listing-uuid-2' });
      const ctx = makeContext({ supabase: db });
      const addResult: AddListingResult = { listingId: 'listing-uuid-2', alreadySaved: true, confidence: 0.8 };
      mockAddListing.mockResolvedValueOnce(addResult);

      const result = await addListingHandler({ url: 'https://zillow.com/foo' }, ctx);

      expect(result.machineData).toEqual({
        kind: 'add_listing',
        result: addResult,
        listing: { ...SAVED_ROW, id: 'listing-uuid-2' },
        show_card: true,
      });
    });

    it('degraded: read-back select errors → machineData still emitted with listing: null', async () => {
      const { db } = makeListingFetchDb(null, { message: 'permission denied' });
      const ctx = makeContext({ supabase: db });
      const addResult: AddListingResult = { listingId: 'listing-uuid-3', alreadySaved: false, confidence: 0.9 };
      mockAddListing.mockResolvedValueOnce(addResult);

      const result = await addListingHandler({ url: 'https://zillow.com/foo' }, ctx);

      expect(result.machineData).toEqual({ kind: 'add_listing', result: addResult, listing: null, show_card: true });
      assertTextBlock(result);
    });

    it('degraded: read-back throws synchronously (no .from on db) → listing: null, save still reported', async () => {
      const ctx = makeContext(); // makeMockDb() has no .from
      const addResult: AddListingResult = { listingId: 'listing-uuid-4', alreadySaved: false, confidence: 0.9 };
      mockAddListing.mockResolvedValueOnce(addResult);

      const result = await addListingHandler({ url: 'https://zillow.com/foo' }, ctx);

      expect(result.machineData).toEqual({ kind: 'add_listing', result: addResult, listing: null, show_card: true });
      expect(result.modelContext).toContain('listing-uuid-4');
    });

    it('dryRun: skips the read-back query entirely; listing: null', async () => {
      const { db, from } = makeListingFetchDb(SAVED_ROW);
      const ctx = makeContext({ supabase: db, dryRun: true });
      const addResult: AddListingResult = { listingId: 'listing-uuid-5', alreadySaved: false, confidence: 0.5 };
      mockAddListing.mockResolvedValueOnce(addResult);

      const result = await addListingHandler({ url: 'https://zillow.com/foo' }, ctx);

      expect(from).not.toHaveBeenCalled();
      expect(result.machineData).toEqual({ kind: 'add_listing', result: addResult, listing: null, show_card: true });
    });

    it('error path (AddListingError): no machineData', async () => {
      const ctx = makeContext();
      mockAddListing.mockRejectedValueOnce(new AddListingError('fetch_failed', 'I could not reach that page.'));

      const result = await addListingHandler({ url: 'https://zillow.com/bad' }, ctx);

      expect(result.machineData).toBeUndefined();
    });

    it('sign-in gate and invalid input: no machineData', async () => {
      const signedOut = await addListingHandler({ url: 'https://zillow.com/foo' }, makeContext({ userId: undefined }));
      expect(signedOut.machineData).toBeUndefined();

      const invalid = await addListingHandler({ url: 'not-a-url' }, makeContext());
      expect(invalid.machineData).toBeUndefined();
    });
  });

  // --- firstSaveAnalysisHandler ---

  describe('firstSaveAnalysisHandler', () => {
    it('emits the FULL fanout with error branches SANITIZED to a stable code (security M1)', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ctx = makeContext();
      const listingId = '00000000-0000-0000-0000-000000000002';
      const rawProviderError =
        'AI_APICallError: 403 from https://api.openai.com/v1 (request id req-123)';
      const fsaResult: FirstSaveAnalysis = {
        listingId,
        trueCost: {
          status: 'ok',
          data: { rent: 1200, utilities: 80, parking: 0, internet: 0, laundry: 0, renterInsurance: 0, moveInFees: 0, total: 1280 },
        },
        redFlags: { status: 'error', error: rawProviderError },
        placesSnapshot: { status: 'skipped', reason: 'no coordinates' },
        steeringQuestion: { status: 'ok', data: { question: 'What matters most?' } },
      };
      mockFsa.mockResolvedValueOnce(fsaResult);

      const result = await firstSaveAnalysisHandler({ listing_id: listingId }, ctx);

      // ok/skipped branches pass through untouched; error branches are mapped
      // to the generic code — raw provider/DB strings never reach the browser
      // (machineData) or the model (modelContext).
      expect(result.machineData).toEqual({
        kind: 'first_save_analysis',
        analysis: { ...fsaResult, redFlags: { status: 'error', error: 'analysis_failed' } },
        show_card: true,
      });
      expect(result.modelContext).not.toContain(rawProviderError);
      expect(JSON.stringify(result.machineData)).not.toContain('req-123');
      // The raw string IS logged server-side for debugging.
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining(rawProviderError));
      assertTextBlock(result);
      consoleError.mockRestore();
    });

    it('core throw: no machineData', async () => {
      const ctx = makeContext();
      mockFsa.mockRejectedValueOnce(new Error('Listing not found'));

      const result = await firstSaveAnalysisHandler({ listing_id: '00000000-0000-0000-0000-000000000003' }, ctx);

      expect(result.machineData).toBeUndefined();
    });

    it('sign-in gate and invalid input: no machineData', async () => {
      const signedOut = await firstSaveAnalysisHandler(
        { listing_id: '00000000-0000-0000-0000-000000000001' },
        makeContext({ userId: undefined }),
      );
      expect(signedOut.machineData).toBeUndefined();

      const invalid = await firstSaveAnalysisHandler({ listing_id: 'nope' }, makeContext());
      expect(invalid.machineData).toBeUndefined();
    });
  });

  // --- rankCompareHandler ---

  describe('rankCompareHandler', () => {
    it('rank mode: emits { kind: rank_compare, result }', async () => {
      const ctx = makeContext();
      const rcResult: RankCompareResult = {
        mode: 'rank',
        ranked: [{ listingId: 'id1', title: 'Best Apt', score: 0.88, breakdown: { rent: 0.9 } }],
      };
      mockRankCompare.mockResolvedValueOnce(rcResult);

      const result = await rankCompareHandler({ mode: 'rank' }, ctx);

      expect(result.machineData).toEqual({ kind: 'rank_compare', result: rcResult, show_card: true });
      assertTextBlock(result);
    });

    it('compare mode: emits { kind: rank_compare, result }', async () => {
      const ctx = makeContext();
      const rcResult: RankCompareResult = {
        mode: 'compare',
        rows: [{ listingId: 'id1', title: 'Place A', rent: 1100, bedrooms: 2, bathrooms: 1, sqft: 750, amenities: [] }],
      };
      mockRankCompare.mockResolvedValueOnce(rcResult);

      const result = await rankCompareHandler({ mode: 'compare' }, ctx);

      expect(result.machineData).toEqual({ kind: 'rank_compare', result: rcResult, show_card: true });
    });

    it('empty result set: machineData still emitted (UI renders the empty state)', async () => {
      const ctx = makeContext();
      const rcResult: RankCompareResult = { mode: 'rank', ranked: [] };
      mockRankCompare.mockResolvedValueOnce(rcResult);

      const result = await rankCompareHandler({ mode: 'rank' }, ctx);

      expect(result.machineData).toEqual({ kind: 'rank_compare', result: rcResult, show_card: true });
    });

    it('core throw / sign-in gate / invalid input: no machineData', async () => {
      mockRankCompare.mockRejectedValueOnce(new Error('boom'));
      const threw = await rankCompareHandler({}, makeContext());
      expect(threw.machineData).toBeUndefined();

      const signedOut = await rankCompareHandler({}, makeContext({ userId: undefined }));
      expect(signedOut.machineData).toBeUndefined();

      const invalid = await rankCompareHandler({ mode: 'invalid-mode' }, makeContext());
      expect(invalid.machineData).toBeUndefined();
    });
  });

  // --- inferProfileHandler ---

  describe('inferProfileHandler', () => {
    it('inferred: emits { kind: infer_profile, result } carrying the profile', async () => {
      const ctx = makeContext();
      const inferResult: InferProfileResult = {
        status: 'inferred',
        profile: {
          rent_min: 900,
          rent_max: 1400,
          bedrooms_target: 2,
          must_have_amenities: ['gym'],
          nice_to_have_amenities: [],
          home_base_address: null,
          commute_max_minutes: null,
          weights: { rent: 0.5 },
          confidence: 0.7,
        },
      };
      mockInferProfile.mockResolvedValueOnce(inferResult);

      const result = await inferProfileHandler({}, ctx);

      expect(result.machineData).toEqual({ kind: 'infer_profile', result: inferResult });
      assertTextBlock(result);
    });

    it('needs_more_data: emits machineData with the discriminated result too', async () => {
      const ctx = makeContext();
      const inferResult: InferProfileResult = {
        status: 'needs_more_data',
        savedCount: 1,
        steeringQuestion: 'What matters most in your next place?',
      };
      mockInferProfile.mockResolvedValueOnce(inferResult);

      const result = await inferProfileHandler({}, ctx);

      expect(result.machineData).toEqual({ kind: 'infer_profile', result: inferResult });
    });

    it('core throw / service-client throw / sign-in gate: no machineData', async () => {
      mockInferProfile.mockRejectedValueOnce(new Error('boom'));
      const threw = await inferProfileHandler({}, makeContext());
      expect(threw.machineData).toBeUndefined();

      mockGetCrmServiceClient.mockImplementationOnce(() => {
        throw new Error('missing env');
      });
      const noClient = await inferProfileHandler({}, makeContext());
      expect(noClient.machineData).toBeUndefined();

      const signedOut = await inferProfileHandler({}, makeContext({ userId: undefined }));
      expect(signedOut.machineData).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// show_card passthrough (CRM show_card wave)
// ---------------------------------------------------------------------------

describe('show_card passthrough', () => {
  const mockAddListing = vi.mocked(addListing);
  const mockFsa = vi.mocked(firstSaveAnalysis);
  const mockRankCompare = vi.mocked(rankCompare);
  const mockGetCrmServiceClient = vi.mocked(getCrmServiceClient);

  beforeEach(() => {
    vi.resetAllMocks();
    mockGetCrmServiceClient.mockReturnValue(makeMockDb());
  });

  describe('add_listing machineData carries show_card flag', () => {
    it('add_listing machineData carries show_card: false when the model sets it', async () => {
      const { db } = makeListingFetchDb(SAVED_ROW);
      const ctx = makeContext({ supabase: db });
      const addResult: AddListingResult = { listingId: 'listing-uuid-1', alreadySaved: false, confidence: 0.9 };
      mockAddListing.mockResolvedValueOnce(addResult);

      const result = await addListingHandler({ url: 'https://zillow.com/foo', show_card: false }, ctx);
      expect((result.machineData as AddListingMachineData).show_card).toBe(false);
    });

    it('add_listing defaults show_card to true when omitted', async () => {
      const { db } = makeListingFetchDb(SAVED_ROW);
      const ctx = makeContext({ supabase: db });
      const addResult: AddListingResult = { listingId: 'listing-uuid-1', alreadySaved: false, confidence: 0.9 };
      mockAddListing.mockResolvedValueOnce(addResult);

      const result = await addListingHandler({ url: 'https://zillow.com/foo' }, ctx);
      expect((result.machineData as AddListingMachineData).show_card).toBe(true);
    });
  });

  describe('first_save_analysis machineData carries show_card flag', () => {
    const listingId = '00000000-0000-0000-0000-000000000002';
    const fsaResult: FirstSaveAnalysis = {
      listingId,
      trueCost: { status: 'skipped', reason: 'no rent' },
      redFlags: { status: 'ok', data: { flags: [], summary: 'None.' } },
      placesSnapshot: { status: 'skipped', reason: 'no coordinates' },
      steeringQuestion: { status: 'skipped', reason: 'not first save' },
    };

    it('first_save_analysis machineData carries show_card: false when the model sets it', async () => {
      const ctx = makeContext();
      mockFsa.mockResolvedValueOnce(fsaResult);

      const result = await firstSaveAnalysisHandler({ listing_id: listingId, show_card: false }, ctx);
      expect((result.machineData as FirstSaveAnalysisMachineData).show_card).toBe(false);
    });

    it('first_save_analysis defaults show_card to true when omitted', async () => {
      const ctx = makeContext();
      mockFsa.mockResolvedValueOnce(fsaResult);

      const result = await firstSaveAnalysisHandler({ listing_id: listingId }, ctx);
      expect((result.machineData as FirstSaveAnalysisMachineData).show_card).toBe(true);
    });
  });

  describe('rank_compare machineData carries show_card flag', () => {
    const rcResult: RankCompareResult = { mode: 'rank', ranked: [] };

    it('rank_compare machineData carries show_card: false when the model sets it', async () => {
      const ctx = makeContext();
      mockRankCompare.mockResolvedValueOnce(rcResult);

      const result = await rankCompareHandler({ mode: 'rank', show_card: false }, ctx);
      expect((result.machineData as RankCompareMachineData).show_card).toBe(false);
    });

    it('rank_compare defaults show_card to true when omitted', async () => {
      const ctx = makeContext();
      mockRankCompare.mockResolvedValueOnce(rcResult);

      const result = await rankCompareHandler({ mode: 'rank' }, ctx);
      expect((result.machineData as RankCompareMachineData).show_card).toBe(true);
    });
  });
});
