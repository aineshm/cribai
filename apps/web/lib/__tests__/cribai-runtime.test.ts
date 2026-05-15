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
});
