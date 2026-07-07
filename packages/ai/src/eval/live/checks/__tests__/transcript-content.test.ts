/**
 * AIN-93 hard check — transcript-content substring pins (AIN-99/AIN-101).
 *
 * These pin two known real product gaps red until the underlying tickets
 * ship: floor-plan questions answered from the flat/cheapest row instead of
 * the seeded breakdown (AIN-99), and ambiguous attribute references silently
 * guessed instead of clarified (AIN-101). The LLM judge alone can't be
 * trusted to catch either deterministically, so this check diffs the raw
 * assistant text against required substrings.
 */
import { describe, expect, it } from 'vitest';
import { checkTranscriptContent } from '../transcript-content';
import type { LiveSseEvent } from '../../http-turn';

function textEvents(text: string): LiveSseEvent[] {
  return [{ type: 'text', content: text }, { type: 'done' }];
}

describe('checkTranscriptContent', () => {
  it('vacuously passes with an explicit "no transcript expectation" detail when the expectation is absent', () => {
    const result = checkTranscriptContent({ events: textEvents('anything at all'), expectation: undefined });
    expect(result.pass).toBe(true);
    expect(result.detail).toBe('no transcript expectation');
  });

  it('vacuously passes when the expectation object is present but both constraints are omitted', () => {
    const result = checkTranscriptContent({ events: textEvents('anything at all'), expectation: {} });
    expect(result.pass).toBe(true);
    expect(result.detail).toBe('no transcript expectation');
  });

  it('mustMentionAll passes when every required substring is present', () => {
    const result = checkTranscriptContent({
      events: textEvents('The rent is $1,800 and the deposit is $500.'),
      expectation: { mustMentionAll: ['$1,800', 'deposit'] },
    });
    expect(result.pass).toBe(true);
  });

  it('mustMentionAll fails when a required substring is missing, naming it in the detail', () => {
    const result = checkTranscriptContent({
      events: textEvents('The rent is $1,800.'),
      expectation: { mustMentionAll: ['$1,800', 'deposit'] },
    });
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/deposit/);
  });

  it('mustMentionAll matches case-insensitively', () => {
    const result = checkTranscriptContent({
      events: textEvents('The DISHWASHER is included in the unit.'),
      expectation: { mustMentionAll: ['dishwasher'] },
    });
    expect(result.pass).toBe(true);
  });

  it('mustMentionAtLeast passes when the threshold count is met', () => {
    const result = checkTranscriptContent({
      events: textEvents('Plans run from 1,300 up to 1,800 and 2,400 for the largest.'),
      expectation: { mustMentionAtLeast: { count: 2, of: ['1,300', '1,800', '2,400'] } },
    });
    expect(result.pass).toBe(true);
  });

  it('mustMentionAtLeast fails when below the threshold count, reporting how many matched', () => {
    const result = checkTranscriptContent({
      events: textEvents('There is one floor plan at $1,050.'),
      expectation: { mustMentionAtLeast: { count: 2, of: ['1,300', '1,800', '2,400'] } },
    });
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/expected at least 2/);
  });

  it('mustMentionAtLeast matches case-insensitively', () => {
    const result = checkTranscriptContent({
      events: textEvents('Both THE REGENT FLATS and the MIFFLIN STREET 4BR have one.'),
      expectation: {
        mustMentionAtLeast: { count: 2, of: ['the regent flats', 'mifflin street 4br', 'cozy one-bedroom'] },
      },
    });
    expect(result.pass).toBe(true);
  });

  it('evaluates both constraints independently — mustMentionAll passing does not mask a mustMentionAtLeast failure', () => {
    const result = checkTranscriptContent({
      events: textEvents('The deposit is $500.'),
      expectation: {
        mustMentionAll: ['deposit'],
        mustMentionAtLeast: { count: 2, of: ['1,300', '1,800', '2,400'] },
      },
    });
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/expected at least 2/);
    expect(result.detail).not.toMatch(/missing required mentions/);
  });

  it('evaluates both constraints independently — mustMentionAtLeast passing does not mask a mustMentionAll failure', () => {
    const result = checkTranscriptContent({
      events: textEvents('Plans run 1,300 and 1,800.'),
      expectation: {
        mustMentionAll: ['deposit'],
        mustMentionAtLeast: { count: 2, of: ['1,300', '1,800', '2,400'] },
      },
    });
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/missing required mentions/);
    expect(result.detail).toMatch(/deposit/);
  });

  it('passes only when both constraints are satisfied together', () => {
    const result = checkTranscriptContent({
      events: textEvents('The deposit is $500. Plans are 1,300 and 1,800.'),
      expectation: {
        mustMentionAll: ['deposit'],
        mustMentionAtLeast: { count: 2, of: ['1,300', '1,800', '2,400'] },
      },
    });
    expect(result.pass).toBe(true);
  });

  it('operates on the concatenated assistant text across multiple text events, ignoring non-text frames', () => {
    const events: LiveSseEvent[] = [
      { type: 'tool_call', name: 'search_listings', args: {} },
      { type: 'text', content: 'One floor plan is ' },
      { type: 'text', content: 'listed at $1,800.' },
      { type: 'done' },
    ];
    const result = checkTranscriptContent({
      events,
      expectation: { mustMentionAll: ['$1,800'] },
    });
    expect(result.pass).toBe(true);
  });
});
