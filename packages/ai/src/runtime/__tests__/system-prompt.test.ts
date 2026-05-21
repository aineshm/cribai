/**
 * PDR-004 Track A Day 2 — system-prompt tests
 *
 * Verifies:
 *   1. The invariant prefix is byte-identical across two different
 *      `(state, profile)` inputs — the prompt-cache contract.
 *   2. The prefix token count stays under the 6k target (codex A3).
 *   3. Snapshot-style assertions for 5 representative dynamic suffixes:
 *      no selection, listing selected, comparing two, pending tour,
 *      pending sublease.
 *   4. HITL reminders for `tour` and `sublease_publish` pending actions
 *      include the explicit `confirmed=true` instruction (codex A1/A4).
 *   5. Guest sessions add a guardrail to the DYNAMIC suffix, not the
 *      cached prefix.
 *
 * No external services are touched. Profile snippets are passed directly;
 * `getUserProfileSnippet` has its own (lighter) test below.
 */

import { describe, expect, it } from 'vitest';
import {
  createEmptyConversationState,
  mergeConversationState,
  type ConversationState,
} from '@campusnest/types';
import {
  buildSystemPrompt,
  composeSystemPrompt,
  estimateTokens,
  EMPTY_PROFILE_SNIPPET,
  type UserProfileSnippet,
} from '../system-prompt';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const LISTING_A = '11111111-2222-4333-8444-555555555555';
const LISTING_B = '66666666-7777-4888-8999-aaaaaaaaaaaa';

const ALICE: UserProfileSnippet = {
  displayName: 'Alice Chen',
  campus: 'UW-Madison',
};
const BOB: UserProfileSnippet = {
  displayName: 'Bob Park',
  campus: 'UW-Madison',
};

function baseState(): ConversationState {
  return createEmptyConversationState();
}

function withSelection(listingId: string): ConversationState {
  return mergeConversationState(baseState(), {
    mode: 'listing_detail',
    selectedListingId: listingId,
  });
}

function withCompare(ids: readonly string[]): ConversationState {
  return mergeConversationState(baseState(), {
    mode: 'compare',
    comparedListingIds: [...ids],
  });
}

function withPendingTour(): ConversationState {
  return mergeConversationState(baseState(), {
    mode: 'action',
    selectedListingId: LISTING_A,
    pendingAction: {
      kind: 'tour',
      payload: {
        listing_id: LISTING_A,
        student_name: 'Alice Chen',
        student_email: 'alice@wisc.edu',
        preferred_dates: ['2026-06-15'],
      },
    },
  });
}

function withPendingSublease(): ConversationState {
  return mergeConversationState(baseState(), {
    mode: 'action',
    pendingAction: {
      kind: 'sublease_publish',
      payload: {
        address: '456 W Gorham St, Madison WI',
        bedrooms_total: 2,
        bedrooms_available: 1,
        rent_monthly: 1100,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Invariant prefix
// ---------------------------------------------------------------------------

describe('buildSystemPrompt — invariant prefix', () => {
  it('returns a byte-identical cachedPrefix across two materially different states', () => {
    const a = buildSystemPrompt(baseState(), EMPTY_PROFILE_SNIPPET);
    const b = buildSystemPrompt(withPendingTour(), ALICE);
    expect(a.cachedPrefix).toBe(b.cachedPrefix);
  });

  it('returns a byte-identical cachedPrefix for guest and signed-in sessions', () => {
    const signedIn = buildSystemPrompt(baseState(), ALICE, { isGuest: false });
    const guest = buildSystemPrompt(baseState(), EMPTY_PROFILE_SNIPPET, {
      isGuest: true,
    });
    // Guest guardrail must live in the DYNAMIC suffix so cache stays warm.
    expect(signedIn.cachedPrefix).toBe(guest.cachedPrefix);
    expect(guest.dynamicSuffix).toContain('Guest session');
    expect(signedIn.dynamicSuffix).not.toContain('Guest session');
  });

  it('cachedPrefix stays under the 6k-token budget (codex A3)', () => {
    const { cachedPrefix } = buildSystemPrompt(baseState(), EMPTY_PROFILE_SNIPPET);
    const tokens = estimateTokens(cachedPrefix);
    // Log so the snapshot diff makes the number obvious when it moves.
    // eslint-disable-next-line no-console
    console.log(
      `[system-prompt] cachedPrefix length=${cachedPrefix.length} chars ~= ${tokens} tokens`,
    );
    expect(tokens).toBeLessThanOrEqual(6000);
  });

  it('cachedPrefix includes persona, tool list, and policy in that order', () => {
    const { cachedPrefix } = buildSystemPrompt(baseState(), EMPTY_PROFILE_SNIPPET);
    const personaIdx = cachedPrefix.indexOf('You are CribAI');
    const toolListIdx = cachedPrefix.indexOf('Available tools');
    const policyIdx = cachedPrefix.indexOf('Operating policy');

    expect(personaIdx).toBeGreaterThanOrEqual(0);
    expect(toolListIdx).toBeGreaterThan(personaIdx);
    expect(policyIdx).toBeGreaterThan(toolListIdx);
  });

  it('cachedPrefix interpolates the campus name from options', () => {
    const { cachedPrefix } = buildSystemPrompt(baseState(), EMPTY_PROFILE_SNIPPET, {
      campusName: 'UC Berkeley',
    });
    expect(cachedPrefix).toContain('UC Berkeley');
  });

  it('cachedPrefix enumerates all 13 tools by name', () => {
    const { cachedPrefix } = buildSystemPrompt(baseState(), EMPTY_PROFILE_SNIPPET);
    const expectedTools = [
      'search_listings',
      'get_listing_detail',
      'compare_listings',
      'schedule_tour',
      'explain_lease_term',
      'get_landlord_info',
      'get_saved_listings',
      'web_search',
      'get_reviews',
      'contact_pm',
      'get_neighborhood_info',
      'create_sublease',
      'propose_mission',
    ];
    for (const name of expectedTools) {
      expect(cachedPrefix).toContain(`### ${name}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Dynamic suffix snapshots
// ---------------------------------------------------------------------------

describe('buildSystemPrompt — dynamic suffix', () => {
  it('renders no-selection state cleanly', () => {
    const { dynamicSuffix } = buildSystemPrompt(baseState(), ALICE);
    expect(dynamicSuffix).toMatchSnapshot();
  });

  it('renders selected-listing state', () => {
    const { dynamicSuffix } = buildSystemPrompt(withSelection(LISTING_A), ALICE);
    expect(dynamicSuffix).toContain(`selectedListingId: ${LISTING_A}`);
    expect(dynamicSuffix).toContain('mode: listing_detail');
    expect(dynamicSuffix).toMatchSnapshot();
  });

  it('renders comparison state with two listings', () => {
    const { dynamicSuffix } = buildSystemPrompt(
      withCompare([LISTING_A, LISTING_B]),
      BOB,
    );
    expect(dynamicSuffix).toContain('mode: compare');
    expect(dynamicSuffix).toContain(LISTING_A);
    expect(dynamicSuffix).toContain(LISTING_B);
    expect(dynamicSuffix).toMatchSnapshot();
  });

  it('renders pending tour with HITL reminder', () => {
    const { dynamicSuffix } = buildSystemPrompt(withPendingTour(), ALICE);
    expect(dynamicSuffix).toContain('HITL REMINDER — pending tour request');
    expect(dynamicSuffix).toContain('schedule_tour');
    expect(dynamicSuffix).toContain('confirmed=true');
    expect(dynamicSuffix).toContain('pendingAction.kind: tour');
    expect(dynamicSuffix).toMatchSnapshot();
  });

  it('renders pending sublease with HITL reminder', () => {
    const { dynamicSuffix } = buildSystemPrompt(withPendingSublease(), ALICE);
    expect(dynamicSuffix).toContain('HITL REMINDER — pending sublease publish');
    expect(dynamicSuffix).toContain('create_sublease');
    expect(dynamicSuffix).toContain('confirmed=true');
    expect(dynamicSuffix).toContain('pendingAction.kind: sublease_publish');
    expect(dynamicSuffix).toMatchSnapshot();
  });

  it('omits HITL reminder when pendingAction is null', () => {
    const { dynamicSuffix } = buildSystemPrompt(baseState(), ALICE);
    expect(dynamicSuffix).not.toContain('HITL REMINDER');
  });

  it('includes guest guardrail block when isGuest=true', () => {
    const { dynamicSuffix } = buildSystemPrompt(
      baseState(),
      EMPTY_PROFILE_SNIPPET,
      { isGuest: true },
    );
    expect(dynamicSuffix).toContain('Guest session');
    expect(dynamicSuffix).toContain('schedule_tour');
    expect(dynamicSuffix).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// composeSystemPrompt
// ---------------------------------------------------------------------------

describe('composeSystemPrompt', () => {
  it('concatenates prefix and suffix in order with a blank line between', () => {
    const parts = buildSystemPrompt(baseState(), ALICE);
    const composed = composeSystemPrompt(parts);
    expect(composed.startsWith(parts.cachedPrefix)).toBe(true);
    expect(composed.endsWith(parts.dynamicSuffix)).toBe(true);
    expect(composed).toBe(`${parts.cachedPrefix}\n\n${parts.dynamicSuffix}`);
  });
});

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('returns ceil(len/4) for known input', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
