import { mergeConversationState, type ConversationState } from '@campusnest/types';

/**
 * Heuristic regex for detecting that the user has explicitly cancelled or
 * abandoned a pending action mid-flow. Matches the *start* of the trimmed
 * user message so legitimate phrases that happen to contain the words later
 * ("I'll cancel after I tour the place") don't accidentally clear state.
 *
 * Keep this conservative — false negatives (action stays pending one extra
 * turn) are recoverable; false positives (action wiped while user still
 * wants it) are not.
 */
const CANCELLATION_INTENT_REGEX =
  /^\s*(never\s*mind|nvm|nevermind|cancel(\s+(that|it))?|forget\s+(it|that)|stop|drop\s+(it|that)|skip\s+(it|that)|let'?s\s+(do|try)\s+something\s+else|actually,?\s+let'?s\s+(do|try)\s+something\s+else)\b/i;

/**
 * Returns true if the given user message looks like a clear cancellation /
 * topic-switch intent that should clear any in-flight pendingAction.
 */
export function looksLikeCancellationIntent(userMessage: string | null | undefined): boolean {
  if (!userMessage) return false;
  return CANCELLATION_INTENT_REGEX.test(userMessage);
}

/**
 * Decide the pendingAction value to keep when an LLM follow-up turn finishes.
 *
 * Multi-turn actions — 'tour', 'contact_pm', 'sublease_publish', 'mission' —
 * are preserved so a follow-up turn (e.g. asking the user for an email) does
 * not clobber the in-flight action. The action is cleared when:
 *   - its kind is already null (nothing pending), or
 *   - a downstream tool explicitly replaces it (handled upstream), or
 *   - the user's most recent message expresses cancellation/topic-switch
 *     intent (e.g. "never mind", "cancel that", "let's do something else").
 *
 * The cancellation heuristic prevents abandoned previews from persisting
 * across turns and accidentally being confirmed by a later bare "yes".
 */
export function preservePendingActionAfterLLMTurn(
  state: ConversationState,
  userMessage?: string | null,
): ConversationState {
  const shouldClear =
    state.pendingAction.kind === null ||
    looksLikeCancellationIntent(userMessage);

  return mergeConversationState(state, {
    pendingAction: shouldClear
      ? { kind: null, payload: null }
      : state.pendingAction,
  });
}
