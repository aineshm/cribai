import { describe, expect, it } from 'vitest';
import {
  createEmptyConversationState,
  mergeConversationState,
  type ConversationState,
} from '@campusnest/types';
import { preservePendingActionAfterLLMTurn } from '../conversation-state-helpers';

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
});
