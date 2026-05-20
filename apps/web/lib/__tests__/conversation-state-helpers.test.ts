import { describe, expect, it } from 'vitest';
import {
  createEmptyConversationState,
  mergeConversationState,
  type ConversationState,
} from '@campusnest/types';
import {
  looksLikeCancellationIntent,
  preservePendingActionAfterLLMTurn,
} from '../conversation-state-helpers';

function stateWithPending(
  kind: ConversationState['pendingAction']['kind'],
  payload: Record<string, unknown> | null = null,
): ConversationState {
  return mergeConversationState(createEmptyConversationState(), {
    pendingAction: { kind, payload },
  });
}

describe('preservePendingActionAfterLLMTurn', () => {
  it('keeps a pending tour action across an LLM follow-up turn', () => {
    const state = stateWithPending('tour', {
      listingId: '11111111-1111-1111-1111-111111111111',
      extractedEmail: 'student@wisc.edu',
    });

    const next = preservePendingActionAfterLLMTurn(state);

    expect(next.pendingAction.kind).toBe('tour');
    expect(next.pendingAction.payload).toEqual({
      listingId: '11111111-1111-1111-1111-111111111111',
      extractedEmail: 'student@wisc.edu',
    });
  });

  it('keeps a pending contact_pm action across an LLM follow-up turn', () => {
    const state = stateWithPending('contact_pm', { listingId: 'abc' });
    const next = preservePendingActionAfterLLMTurn(state);
    expect(next.pendingAction.kind).toBe('contact_pm');
    expect(next.pendingAction.payload).toEqual({ listingId: 'abc' });
  });

  it('keeps a pending sublease_publish action across an LLM follow-up turn', () => {
    const state = stateWithPending('sublease_publish', { draftId: 'x' });
    const next = preservePendingActionAfterLLMTurn(state);
    expect(next.pendingAction.kind).toBe('sublease_publish');
    expect(next.pendingAction.payload).toEqual({ draftId: 'x' });
  });

  it('keeps a pending mission action across an LLM follow-up turn', () => {
    const state = stateWithPending('mission', {
      missionId: 'm1',
      missionType: 'housing_search',
    });
    const next = preservePendingActionAfterLLMTurn(state);
    expect(next.pendingAction.kind).toBe('mission');
    expect(next.pendingAction.payload).toEqual({
      missionId: 'm1',
      missionType: 'housing_search',
    });
  });

  it('leaves no pending action set when nothing is pending', () => {
    const state = createEmptyConversationState();
    const next = preservePendingActionAfterLLMTurn(state);
    expect(next.pendingAction).toEqual({ kind: null, payload: null });
  });

  it('does not mutate the input state', () => {
    const state = stateWithPending('tour', { listingId: 'x' });
    const snapshot = JSON.parse(JSON.stringify(state));
    preservePendingActionAfterLLMTurn(state);
    expect(state).toEqual(snapshot);
  });

  it('clears a pending tour action when the user says "never mind"', () => {
    const state = stateWithPending('tour', {
      listingId: '11111111-1111-1111-1111-111111111111',
    });

    const next = preservePendingActionAfterLLMTurn(state, 'never mind');

    expect(next.pendingAction).toEqual({ kind: null, payload: null });
  });

  it('clears a pending contact_pm action when the user cancels', () => {
    const state = stateWithPending('contact_pm', { listingId: 'abc' });
    const next = preservePendingActionAfterLLMTurn(state, 'cancel that');
    expect(next.pendingAction).toEqual({ kind: null, payload: null });
  });

  it('clears a pending action on topic-switch phrases', () => {
    const state = stateWithPending('tour', { listingId: 'x' });
    const next = preservePendingActionAfterLLMTurn(
      state,
      "actually, let's do something else",
    );
    expect(next.pendingAction).toEqual({ kind: null, payload: null });
  });

  it('does NOT clear when the user is mid-flow without cancelling', () => {
    const state = stateWithPending('tour', { listingId: 'x' });
    const next = preservePendingActionAfterLLMTurn(state, 'sure, Tuesday at 3pm works');
    expect(next.pendingAction.kind).toBe('tour');
  });

  it('does NOT clear when the word "cancel" appears later in the message', () => {
    const state = stateWithPending('tour', { listingId: 'x' });
    const next = preservePendingActionAfterLLMTurn(
      state,
      "I'll cancel my other plans so I can tour Thursday",
    );
    expect(next.pendingAction.kind).toBe('tour');
  });
});

describe('looksLikeCancellationIntent', () => {
  it.each([
    'never mind',
    'nevermind',
    'nvm',
    'Cancel',
    'cancel that',
    'cancel it',
    'forget it',
    'forget that',
    'stop',
    'drop it',
    'skip it',
    "let's do something else",
    "lets do something else",
    "actually, let's do something else",
  ])('detects %j as cancellation', (msg) => {
    expect(looksLikeCancellationIntent(msg)).toBe(true);
  });

  it.each([
    'yes',
    'use alex@wisc.edu',
    "I'll cancel my plans so I can tour",
    'sure thing',
    '',
    null,
    undefined,
  ])('does NOT flag %j as cancellation', (msg) => {
    expect(looksLikeCancellationIntent(msg as string | null | undefined)).toBe(false);
  });
});
