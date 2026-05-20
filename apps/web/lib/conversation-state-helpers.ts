import { mergeConversationState, type ConversationState } from '@campusnest/types';

/**
 * Decide the pendingAction value to keep when an LLM follow-up turn finishes.
 *
 * Multi-turn actions — 'tour', 'contact_pm', 'sublease_publish', 'mission' —
 * are preserved so a follow-up turn (e.g. asking the user for an email) does
 * not clobber the in-flight action. The action is only cleared when its kind
 * is null (nothing pending) or a downstream tool explicitly replaces it.
 */
export function preservePendingActionAfterLLMTurn(
  state: ConversationState,
): ConversationState {
  return mergeConversationState(state, {
    pendingAction:
      state.pendingAction.kind !== null
        ? state.pendingAction
        : { kind: null, payload: null },
  });
}
