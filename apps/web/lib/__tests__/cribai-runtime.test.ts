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

  it('falls through area-level follow-ups even with an active listing', async () => {
    const listingId = '11111111-1111-1111-1111-111111111111';
    const state = mergeConversationState(createEmptyConversationState(), {
      selectedListingId: listingId,
      mode: 'listing_detail',
    });

    // Neighborhood-level query containing "parking" but also "near State Street" (area indicator)
    const resultNear = await maybeHandleDeterministicTurn({
      query: 'what about parking near State Street?',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(resultNear).toBeNull();
    expect(mockExecuteTool).not.toHaveBeenCalled();

    // Neighborhood-level query containing "utilities" but also "in the area" (area indicator)
    const resultArea = await maybeHandleDeterministicTurn({
      query: 'what are utilities like in the area?',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    expect(resultArea).toBeNull();
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('routes "is the rent around 1500?" to listing detail (bare around is not spatial)', async () => {
    const listingId = '11111111-1111-1111-1111-111111111111';
    const state = mergeConversationState(createEmptyConversationState(), {
      selectedListingId: listingId,
      mode: 'listing_detail',
    });

    const result = await maybeHandleDeterministicTurn({
      query: 'is the rent around 1500?',
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    // Should route to listing detail, NOT fall through
    expect(result).not.toBeNull();
    expect(result?.flow).toBe('detail');
  });

  // ── HITL preview phase for schedule_tour ─────────────────────

  describe('schedule_tour HITL preview phase', () => {
    const listingId = '11111111-1111-1111-1111-111111111111';

    function listingDetailResult() {
      return listingToolResult();
    }

    function scheduledTourResult() {
      return {
        modelContext: 'Tour scheduled',
        clientBlock: {
          type: 'tour_confirmation' as const,
          tourRequestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          listingAddress: '109 E Wilson St, Madison, WI 53703',
          status: 'pending' as const,
        },
        statePatch: {},
      };
    }

    it('returns a preview and does NOT call schedule_tour on first all-fields turn', async () => {
      // First turn: user provides everything in one message — must preview, not fire.
      mockExecuteTool.mockResolvedValueOnce(listingDetailResult());

      const state = mergeConversationState(createEmptyConversationState(), {
        selectedListingId: listingId,
        mode: 'listing_detail',
      });

      const result = await maybeHandleDeterministicTurn({
        query:
          'book a tour for me, my name is Sam, email sam@wisc.edu, on 2026-06-01',
        listingId,
        conversationState: state,
        toolContext: toolContext(),
      });

      expect(result?.flow).toBe('tour_prep');
      // get_listing_detail is allowed; schedule_tour must NOT be called.
      const toolNames = mockExecuteTool.mock.calls.map((c) => c[0]);
      expect(toolNames).toContain('get_listing_detail');
      expect(toolNames).not.toContain('schedule_tour');

      // Pending action marks the preview as ready for confirmation.
      expect(result?.conversationState.pendingAction.kind).toBe('tour');
      expect(
        result?.conversationState.pendingAction.payload?.previewConfirmedReady,
      ).toBe(true);
      expect(
        result?.conversationState.pendingAction.payload?.extractedEmail,
      ).toBe('sam@wisc.edu');
    });

    it('executes schedule_tour when the user confirms a previously shown preview', async () => {
      // Second turn: state already shows the preview was shown; user replies "yes".
      mockExecuteTool
        .mockResolvedValueOnce(listingDetailResult())
        .mockResolvedValueOnce(scheduledTourResult());

      const state = mergeConversationState(createEmptyConversationState(), {
        selectedListingId: listingId,
        mode: 'action',
        pendingAction: {
          kind: 'tour',
          payload: {
            listingId,
            extractedDates: ['2026-06-01'],
            extractedEmail: 'sam@wisc.edu',
            studentName: 'Sam',
            previewConfirmedReady: true,
            rawQuery:
              'book a tour for me, my name is Sam, email sam@wisc.edu, on 2026-06-01',
          },
        },
      });

      const result = await maybeHandleDeterministicTurn({
        query: 'yes',
        listingId,
        conversationState: state,
        toolContext: toolContext(),
      });

      expect(result?.flow).toBe('tour_submit');
      expect(mockExecuteTool).toHaveBeenCalledWith(
        'schedule_tour',
        expect.objectContaining({
          listing_id: listingId,
          student_email: 'sam@wisc.edu',
          student_name: 'Sam',
          preferred_dates: ['2026-06-01'],
        }),
        toolContext(),
      );

      // Pending action cleared on successful submit.
      expect(result?.conversationState.pendingAction.kind).toBeNull();
    });

    it('does NOT call schedule_tour when the user replies with a non-affirmative follow-up', async () => {
      // Preview was already shown; user replies with a correction, not confirmation.
      mockExecuteTool.mockResolvedValueOnce(listingDetailResult());

      const state = mergeConversationState(createEmptyConversationState(), {
        selectedListingId: listingId,
        mode: 'action',
        pendingAction: {
          kind: 'tour',
          payload: {
            listingId,
            extractedDates: ['2026-06-01'],
            extractedEmail: 'sam@wisc.edu',
            studentName: 'Sam',
            previewConfirmedReady: true,
          },
        },
      });

      const result = await maybeHandleDeterministicTurn({
        // Sends a new date — looks like a tour follow-up, not a confirmation.
        query: 'actually use 2026-06-15',
        listingId,
        conversationState: state,
        toolContext: toolContext(),
      });

      // We re-enter the tour branch via looksLikeTourFollowUp and re-preview
      // with the merged date set; schedule_tour still must not fire.
      expect(result?.flow).toBe('tour_prep');
      const toolNames = mockExecuteTool.mock.calls.map((c) => c[0]);
      expect(toolNames).not.toContain('schedule_tour');
    });
  });

  it('falls through "what\'s parking like near this apartment?" despite explicit listing reference', async () => {
    const listingId = '11111111-1111-1111-1111-111111111111';
    const state = mergeConversationState(createEmptyConversationState(), {
      selectedListingId: listingId,
      mode: 'listing_detail',
    });

    const result = await maybeHandleDeterministicTurn({
      query: "what's parking like near this apartment?",
      listingId,
      conversationState: state,
      toolContext: toolContext(),
    });

    // Should fall through to neighborhood/search tooling, NOT force listing detail
    expect(result).toBeNull();
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });
});
