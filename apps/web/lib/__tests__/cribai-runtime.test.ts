import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyConversationState, mergeConversationState } from '@campusnest/types';
import { maybeHandleDeterministicTurn } from '../cribai-runtime';
import { executeTool } from '@campusnest/ai';

vi.mock('@campusnest/ai', () => ({
  executeTool: vi.fn(),
}));

const mockExecuteTool = vi.mocked(executeTool);

function toolContext() {
  return {
    supabase: {} as never,
    campusId: '6692cc4a-1592-4b7d-a642-6eaacfd5503c',
    campusSlug: 'uw-madison',
  };
}

function listingToolResult() {
  return {
    modelContext: 'Listing detail',
    clientBlock: {
      type: 'listing_card' as const,
      listings: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          address: '109 E Wilson St, Madison, WI 53703',
          rentMonthly: 1200,
          bedrooms: 2,
          bathrooms: 1,
          sqft: 800,
          fairnessScore: 7.5,
          trueCostTotal: 1450,
          amenities: [],
          campusSlug: 'uw-madison',
        },
      ],
    },
    statePatch: {
      mode: 'listing_detail' as const,
      selectedListingId: '11111111-1111-1111-1111-111111111111',
    },
  };
}

describe('maybeHandleDeterministicTurn', () => {
  beforeEach(() => {
    mockExecuteTool.mockReset();
    mockExecuteTool.mockResolvedValue(listingToolResult());
  });

  it('uses listing detail for sidecar listing prompts with street numbers', async () => {
    const listingId = '11111111-1111-1111-1111-111111111111';
    const state = mergeConversationState(createEmptyConversationState(), {
      selectedListingId: listingId,
      mode: 'listing_detail',
    });

    const result = await maybeHandleDeterministicTurn({
      query: 'Tell me about this listing at 109 E Wilson St, Madison, WI 53703.',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(result?.flow).toBe('detail');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'get_listing_detail',
      { listing_id: listingId },
      toolContext(),
    );
  });

  it('does not parse rent or street numbers as bedrooms for broad searches', async () => {
    await maybeHandleDeterministicTurn({
      query: 'apartments near 109 E Wilson under 1500',
      conversationState: createEmptyConversationState(),
      toolContext: toolContext(),
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'search_listings',
      expect.not.objectContaining({ bedrooms: expect.any(Number) }),
      toolContext(),
    );
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'search_listings',
      expect.objectContaining({ max_rent: 1500 }),
      toolContext(),
    );
  });

  it('keeps studio searches filtered while a listing is selected', async () => {
    const listingId = '11111111-1111-1111-1111-111111111111';
    const state = mergeConversationState(createEmptyConversationState(), {
      selectedListingId: listingId,
      mode: 'listing_detail',
    });

    const result = await maybeHandleDeterministicTurn({
      query: 'studio under 1500',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(result?.flow).toBe('search');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'search_listings',
      expect.objectContaining({ bedrooms: 0, max_rent: 1500 }),
      toolContext(),
    );
  });

  it('routes broad filter searches to search even with current listing context', async () => {
    const listingId = '11111111-1111-1111-1111-111111111111';
    const state = mergeConversationState(createEmptyConversationState(), {
      selectedListingId: listingId,
      mode: 'listing_detail',
    });

    const result = await maybeHandleDeterministicTurn({
      query: '1 bedroom under 1500',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(result?.flow).toBe('search');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'search_listings',
      expect.objectContaining({ bedrooms: 1, max_rent: 1500 }),
      toolContext(),
    );
  });

  it('routes current-listing attribute questions to listing detail', async () => {
    const listingId = '11111111-1111-1111-1111-111111111111';
    const state = mergeConversationState(createEmptyConversationState(), {
      selectedListingId: listingId,
      mode: 'listing_detail',
    });

    const result = await maybeHandleDeterministicTurn({
      query: "what's the rent?",
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(result?.flow).toBe('detail');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'get_listing_detail',
      { listing_id: listingId },
      toolContext(),
    );
  });

  it('keeps plural listing searches as search while a listing is selected', async () => {
    const listingId = '11111111-1111-1111-1111-111111111111';
    const state = mergeConversationState(createEmptyConversationState(), {
      selectedListingId: listingId,
      mode: 'listing_detail',
    });

    const result = await maybeHandleDeterministicTurn({
      query: 'listings under 1500',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(result?.flow).toBe('search');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'search_listings',
      expect.objectContaining({ max_rent: 1500 }),
      toolContext(),
    );
  });

  it('does not let landmark names containing studio override bedroom filters', async () => {
    await maybeHandleDeterministicTurn({
      query: '2 bedroom near Studio City under 2500',
      conversationState: createEmptyConversationState(),
      toolContext: toolContext(),
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'search_listings',
      expect.objectContaining({ bedrooms: 2, max_rent: 2500 }),
      toolContext(),
    );
  });

  it('keeps broad attribute-shaped searches as search while a listing is selected', async () => {
    const listingId = '11111111-1111-1111-1111-111111111111';
    const state = mergeConversationState(createEmptyConversationState(), {
      selectedListingId: listingId,
      mode: 'listing_detail',
    });

    const result = await maybeHandleDeterministicTurn({
      query: 'what are 2 bedroom apartments with parking under 1500',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(result?.flow).toBe('search');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'search_listings',
      expect.objectContaining({
        bedrooms: 2,
        max_rent: 1500,
        amenities: expect.arrayContaining(['parking']),
      }),
      toolContext(),
    );
  });

  it('keeps explicit current-listing commands on listing detail', async () => {
    const listingId = '11111111-1111-1111-1111-111111111111';
    const state = mergeConversationState(createEmptyConversationState(), {
      selectedListingId: listingId,
      mode: 'listing_detail',
    });

    const result = await maybeHandleDeterministicTurn({
      query: 'show this listing',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(result?.flow).toBe('detail');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'get_listing_detail',
      { listing_id: listingId },
      toolContext(),
    );
  });

  it('keeps explicit current-listing questions on detail even with broad search terms', async () => {
    const listingId = '11111111-1111-1111-1111-111111111111';
    const state = mergeConversationState(createEmptyConversationState(), {
      selectedListingId: listingId,
      mode: 'listing_detail',
    });

    const amenitiesResult = await maybeHandleDeterministicTurn({
      query: 'what amenities does this apartment have?',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(amenitiesResult?.flow).toBe('detail');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'get_listing_detail',
      { listing_id: listingId },
      toolContext(),
    );

    mockExecuteTool.mockClear();

    const budgetResult = await maybeHandleDeterministicTurn({
      query: 'is this listing under 1500?',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(budgetResult?.flow).toBe('detail');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'get_listing_detail',
      { listing_id: listingId },
      toolContext(),
    );
  });

  it('keeps broad searches that mention the current listing as search', async () => {
    const listingId = '11111111-1111-1111-1111-111111111111';
    const state = mergeConversationState(createEmptyConversationState(), {
      selectedListingId: listingId,
      mode: 'listing_detail',
    });

    const likeCurrentResult = await maybeHandleDeterministicTurn({
      query: 'find apartments like this listing under 1500',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(likeCurrentResult?.flow).toBe('search');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'search_listings',
      expect.objectContaining({ max_rent: 1500 }),
      toolContext(),
    );

    mockExecuteTool.mockClear();

    const broadPlaceResult = await maybeHandleDeterministicTurn({
      query: 'show me a place under 1500',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(broadPlaceResult?.flow).toBe('search');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'search_listings',
      expect.objectContaining({ max_rent: 1500 }),
      toolContext(),
    );
  });

  it('keeps broad searches containing ordinal terms as search', async () => {
    const listingId = '11111111-1111-1111-1111-111111111111';
    const state = mergeConversationState(createEmptyConversationState(), {
      selectedListingId: listingId,
      mode: 'listing_detail',
      lastSearch: {
        args: {},
        resultListingIds: [listingId],
        generatedAt: '2026-05-16T00:00:00.000Z',
        source: 'chat_search',
      },
    });

    const floorResult = await maybeHandleDeterministicTurn({
      query: 'first floor apartments under 1500',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(floorResult?.flow).toBe('search');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'search_listings',
      expect.objectContaining({ max_rent: 1500 }),
      toolContext(),
    );

    mockExecuteTool.mockClear();

    const semesterResult = await maybeHandleDeterministicTurn({
      query: 'second semester subleases',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(semesterResult?.flow).toBe('search');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'search_listings',
      expect.objectContaining({}),
      toolContext(),
    );

    mockExecuteTool.mockClear();

    const showFloorResult = await maybeHandleDeterministicTurn({
      query: 'show me first floor apartments under 1500',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(showFloorResult?.flow).toBe('search');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'search_listings',
      expect.objectContaining({ max_rent: 1500 }),
      toolContext(),
    );

    mockExecuteTool.mockClear();

    const infoSemesterResult = await maybeHandleDeterministicTurn({
      query: 'info on second semester subleases',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(infoSemesterResult?.flow).toBe('search');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'search_listings',
      expect.objectContaining({}),
      toolContext(),
    );

    mockExecuteTool.mockClear();

    // Verify selector ordinal STILL resolves to listing detail
    const selectorResult = await maybeHandleDeterministicTurn({
      query: 'show the first listing under 1500',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(selectorResult?.flow).toBe('detail');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'get_listing_detail',
      { listing_id: listingId },
      toolContext(),
    );

    mockExecuteTool.mockClear();

    // Verify selector ordinal with a street name containing an ordinal resolves to listing detail (Codex P2 check)
    const streetSelectorResult = await maybeHandleDeterministicTurn({
      query: 'show the first listing on 4th Ave',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(streetSelectorResult?.flow).toBe('detail');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'get_listing_detail',
      { listing_id: listingId },
      toolContext(),
    );
  });

  it('falls through generic follow-ups after search results without an explicit listing reference', async () => {
    const state = mergeConversationState(createEmptyConversationState(), {
      mode: 'search',
      lastSearch: {
        args: {},
        resultListingIds: [
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
        ],
        generatedAt: '2026-05-16T00:00:00.000Z',
        source: 'chat_search',
      },
    });

    const result = await maybeHandleDeterministicTurn({
      query: 'can you explain the scoring?',
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(result).toBeNull();
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });
});
