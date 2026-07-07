/**
 * AIN-93 hard check — tool containment semantics vs the observed stream
 * (adjudicated live-run fix: the original exact-length ordered-equality check
 * was miscalibrated — the model legitimately calls extra tools around a
 * required one, e.g. a geocode lookup alongside rank_compare).
 *
 * `expectedTools` is now a REQUIRED subsequence: every listed tool name must
 * appear in the actual tool_call sequence, in the SAME relative order as
 * listed — but other tools may appear anywhere before, after, or between them
 * without failing the check. `forbiddenTools` (optional) lists tool names
 * that must NEVER appear at all; a forbidden hit fails regardless of the
 * required list. An empty/absent required list with no forbidden list is a
 * vacuous pass — and that must be visible in the report, not silent, hence
 * the explicit "no tool constraint" detail string.
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
  /**
   * Required tool names that must appear, in this relative order, within the
   * actual tool_call sequence (subsequence match — extra tools anywhere are
   * always allowed). Empty = no requirement.
   */
  readonly expectedTools: readonly string[];
  /** Tool names that must never appear in the actual tool_call sequence, regardless of `expectedTools`. */
  readonly forbiddenTools?: readonly string[];
}

/** True iff `required` appears as a subsequence of `actual`, preserving relative order. */
function isSubsequence(required: readonly string[], actual: readonly string[]): boolean {
  let i = 0;
  for (const name of actual) {
    if (i < required.length && name === required[i]) i += 1;
  }
  return i === required.length;
}

export function checkToolExpectation(input: ToolExpectationInput): CheckResult {
  const actual = extractToolSequence(toChatEvents(input.events));
  const required = input.expectedTools;
  const forbidden = input.forbiddenTools ?? [];

  const forbiddenHit = forbidden.find((name) => actual.includes(name));
  if (forbiddenHit) {
    return {
      name: 'tool_expectation',
      pass: false,
      detail: `forbidden tool "${forbiddenHit}" appeared in [${actual.join(', ')}]`,
    };
  }

  if (required.length === 0 && forbidden.length === 0) {
    return { name: 'tool_expectation', pass: true, detail: 'no tool constraint' };
  }

  if (required.length === 0) {
    return {
      name: 'tool_expectation',
      pass: true,
      detail: `no required tools; forbidden tools [${forbidden.join(', ')}] absent from [${actual.join(', ')}]`,
    };
  }

  const pass = isSubsequence(required, actual);
  return {
    name: 'tool_expectation',
    pass,
    detail: pass
      ? `required tools [${required.join(', ')}] found in order within [${actual.join(', ')}]`
      : `expected required tools [${required.join(', ')}] as an in-order subsequence, got [${actual.join(', ')}]`,
  };
}
