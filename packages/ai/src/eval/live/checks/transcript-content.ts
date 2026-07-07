/**
 * AIN-93 hard check — transcript-content substring pins (AIN-99/AIN-101).
 *
 * Two known real product gaps currently only surface through the
 * (non-deterministic) LLM judge, which lets a launch gate stay green on them:
 *
 *   - AIN-99: floor-plan questions get answered from the flat/cheapest row
 *     ("one floor plan, $1,050-$1,050") because no chat tool exposes the
 *     seeded multi-plan breakdown to the model.
 *   - AIN-101: ambiguous attribute references ("the listing with the
 *     dishwasher", 3 matches) get silently guessed instead of clarified.
 *
 * This check operates on the concatenated assistant TEXT of a turn (never
 * tool_call/tool_result frames) and does a case-insensitive substring diff
 * against the scenario's declared `expectTranscript` expectation
 * (`corpus/schema.ts`). Both `mustMentionAll` and `mustMentionAtLeast` are
 * independently evaluated — either one failing fails the whole check. No
 * expectation declared (or an expectation with both constraints omitted) is
 * a vacuous pass, and that must be visible in the report, not silent, hence
 * the explicit "no transcript expectation" detail string (mirrors the
 * "no tool constraint" pattern in `tool-expectation.ts`).
 */
import type { LiveSseEvent } from '../http-turn';
import { extractAssistantText } from '../../scorers';
import type { TranscriptContentExpectation } from '../corpus/schema';
import { toChatEvents, type CheckResult } from './types';

export interface TranscriptContentInput {
  readonly events: readonly LiveSseEvent[];
  readonly expectation: TranscriptContentExpectation | undefined;
}

function containsCaseInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function hasAnyConstraint(expectation: TranscriptContentExpectation | undefined): boolean {
  if (!expectation) return false;
  const hasMustMentionAll = (expectation.mustMentionAll?.length ?? 0) > 0;
  const hasMustMentionAtLeast = expectation.mustMentionAtLeast !== undefined;
  return hasMustMentionAll || hasMustMentionAtLeast;
}

export function checkTranscriptContent(input: TranscriptContentInput): CheckResult {
  const { expectation } = input;

  if (!hasAnyConstraint(expectation)) {
    return { name: 'transcript_content', pass: true, detail: 'no transcript expectation' };
  }

  const text = extractAssistantText(toChatEvents(input.events));
  const failures: string[] = [];

  if (expectation!.mustMentionAll && expectation!.mustMentionAll.length > 0) {
    const missing = expectation!.mustMentionAll.filter((s) => !containsCaseInsensitive(text, s));
    if (missing.length > 0) {
      failures.push(`missing required mentions: [${missing.join(', ')}]`);
    }
  }

  if (expectation!.mustMentionAtLeast) {
    const { count, of } = expectation!.mustMentionAtLeast;
    const matched = of.filter((s) => containsCaseInsensitive(text, s));
    if (matched.length < count) {
      failures.push(
        `expected at least ${count} of [${of.join(', ')}], found ${matched.length}: [${matched.join(', ')}]`,
      );
    }
  }

  const pass = failures.length === 0;
  return {
    name: 'transcript_content',
    pass,
    detail: pass ? 'all transcript-content expectations satisfied' : failures.join('; '),
  };
}
