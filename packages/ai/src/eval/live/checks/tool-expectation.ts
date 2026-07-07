/**
 * AIN-93 hard check — ordered tool-call expectation vs the observed stream.
 *
 * Reuses `extractToolSequence` from the in-process eval's scorers unmodified
 * (it works on any recorded event stream with `tool_call` frames — CRM tool
 * names aren't part of the in-process `ToolName` union, but the extractor
 * never validates against it, only maps `tool_call` events to their `name`).
 */
import type { LiveSseEvent } from '../http-turn';
import { extractToolSequence } from '../../scorers';
import { toChatEvents, type CheckResult } from './types';

export interface ToolExpectationInput {
  readonly events: readonly LiveSseEvent[];
  /** Ordered exact tool-name sequence expected this turn. Empty = no tool call expected. */
  readonly expectedTools: readonly string[];
}

export function checkToolExpectation(input: ToolExpectationInput): CheckResult {
  const actual = extractToolSequence(toChatEvents(input.events));
  const pass =
    actual.length === input.expectedTools.length &&
    actual.every((name, i) => name === input.expectedTools[i]);

  return {
    name: 'tool_expectation',
    pass,
    detail: pass
      ? `tool sequence matched: [${actual.join(', ')}]`
      : `expected [${input.expectedTools.join(', ')}], got [${actual.join(', ')}]`,
  };
}
