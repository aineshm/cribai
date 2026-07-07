/**
 * AIN-93 hard check — no error markers (recon fact 8 / plan decision 6).
 *
 * A turn fails this check if ANY of:
 *   1. the HTTP response was non-200,
 *   2. the SSE stream carried a `type: 'error'` frame,
 *   3. the assistant's prose matched the error-bubble regex (the same
 *      pattern the tour-hitl E2E spec pins).
 */
import type { LiveSseEvent } from '../http-turn';
import { extractAssistantText } from '../../scorers';
import { toChatEvents, type CheckResult } from './types';

export const ERROR_TEXT_PATTERN = /temporarily unavailable|something went wrong|please try again/i;

export interface ErrorCheckInput {
  readonly events: readonly LiveSseEvent[];
  readonly httpStatus: number;
}

export function checkNoErrors(input: ErrorCheckInput): CheckResult {
  if (input.httpStatus !== 200) {
    return {
      name: 'no_errors',
      pass: false,
      detail: `non-200 HTTP response: ${input.httpStatus}`,
    };
  }

  const errorEvent = input.events.find((e) => e.type === 'error');
  if (errorEvent) {
    return {
      name: 'no_errors',
      pass: false,
      detail: `SSE error frame: ${(errorEvent as { message: string }).message}`,
    };
  }

  const text = extractAssistantText(toChatEvents(input.events));
  if (ERROR_TEXT_PATTERN.test(text)) {
    return {
      name: 'no_errors',
      pass: false,
      detail: `assistant text matched the error-bubble marker: ${JSON.stringify(text.slice(0, 200))}`,
    };
  }

  return { name: 'no_errors', pass: true, detail: 'no error markers found' };
}
