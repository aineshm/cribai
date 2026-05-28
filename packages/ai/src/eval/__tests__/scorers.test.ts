/**
 * PDR-004 Track A Days 5-6 (AIN-9) — eval scorer tests.
 *
 * Each scorer runs against pre-recorded `ChatEvent[]` arrays — NO network. The
 * quality scorer takes an injected fake judge model (MockLanguageModelV3) so
 * the LLM-as-judge path is exercised offline.
 */

import { describe, expect, it } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import type { ChatEvent } from '../../cribai';
import {
  scoreToolSequence,
  scoreStatePatch,
  scoreHitlIntegrity,
  scoreQuality,
  deepEqual,
  parseQualityScore,
  extractToolSequence,
} from '../scorers';

// ---------------------------------------------------------------------------
// Event fixtures
// ---------------------------------------------------------------------------

const LISTING_A = '11111111-2222-4333-8444-555555555555';

function toolCall(name: string, args: Record<string, unknown> = {}): ChatEvent {
  return { type: 'tool_call', name, args };
}
function toolResult(
  name: string,
  statePatch?: Record<string, unknown>,
): ChatEvent {
  return {
    type: 'tool_result',
    name,
    block: { type: 'text', content: 'ok' } as never,
    ...(statePatch ? { statePatch: statePatch as never } : {}),
  };
}
const text = (content: string): ChatEvent => ({ type: 'text', content });
const DONE: ChatEvent = { type: 'done' };

/** A fake judge that always returns the given score string. */
function fakeJudge(reply: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () =>
      ({
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        content: [{ type: 'text', text: reply }],
        warnings: [],
      }) as never,
  });
}

const SEED_STUB = { turns: [{ userMessage: 'find me a 2br' }], description: 'search' };

// ---------------------------------------------------------------------------
// deepEqual
// ---------------------------------------------------------------------------

describe('deepEqual — structural, key-order independent', () => {
  it('treats reordered keys as equal', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });
  it('compares nested + arrays', () => {
    expect(deepEqual({ a: [1, { x: 2 }] }, { a: [1, { x: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
  it('distinguishes null vs object and differing lengths', () => {
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tool-sequence
// ---------------------------------------------------------------------------

describe('scoreToolSequence — ordered exact match', () => {
  it('passes on exact order', () => {
    const events = [toolCall('search_listings'), toolResult('search_listings'), text('here'), DONE];
    const s = scoreToolSequence(events, ['search_listings']);
    expect(s.pass).toBe(true);
    expect(s.score).toBe(1);
  });
  it('fails on wrong order', () => {
    const events = [toolCall('compare_listings'), toolCall('search_listings')];
    expect(scoreToolSequence(events, ['search_listings', 'compare_listings']).pass).toBe(false);
  });
  it('fails on extra/missing calls', () => {
    const events = [toolCall('search_listings'), toolCall('search_listings')];
    expect(scoreToolSequence(events, ['search_listings']).pass).toBe(false);
  });
  it('passes on an empty expected sequence with no tool calls', () => {
    expect(scoreToolSequence([text('hi'), DONE], []).pass).toBe(true);
  });
  it('extractToolSequence ignores non-tool_call events', () => {
    expect(extractToolSequence([text('a'), toolCall('search_listings'), toolResult('search_listings')])).toEqual(['search_listings']);
  });
});

// ---------------------------------------------------------------------------
// state-patch
// ---------------------------------------------------------------------------

describe('scoreStatePatch — structural merged-patch match', () => {
  it('passes when the merged patch satisfies the expected subset', () => {
    const events = [toolResult('get_listing_detail', { selectedListingId: LISTING_A, mode: 'listing_detail' })];
    const s = scoreStatePatch(events, { selectedListingId: LISTING_A });
    expect(s.pass).toBe(true);
  });
  it('fails when the expected key is absent or differs', () => {
    const events = [toolResult('get_listing_detail', { selectedListingId: LISTING_A })];
    expect(scoreStatePatch(events, { selectedListingId: 'different' }).pass).toBe(false);
  });
  it('merges multiple patches in order', () => {
    const events = [
      toolResult('search_listings', { mode: 'browse' }),
      toolResult('get_listing_detail', { selectedListingId: LISTING_A, mode: 'listing_detail' }),
    ];
    expect(scoreStatePatch(events, { mode: 'listing_detail', selectedListingId: LISTING_A }).pass).toBe(true);
  });
  it('vacuously passes with no expectation', () => {
    expect(scoreStatePatch([], undefined).pass).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HITL integrity — the zero-leak gate
// ---------------------------------------------------------------------------

describe('scoreHitlIntegrity — zero-leaked-outreach gate', () => {
  it('FLAGS a leak: schedule_tour confirmed=true in a preview turn', () => {
    const events = [toolCall('schedule_tour', { confirmed: true }), toolResult('schedule_tour')];
    const s = scoreHitlIntegrity(events, 'preview');
    expect(s.leaked).toBe(true);
    expect(s.pass).toBe(false);
  });
  it('FLAGS a leak: create_sublease confirmed=true in an ambiguous (none) turn', () => {
    const events = [toolCall('create_sublease', { confirmed: true })];
    expect(scoreHitlIntegrity(events, 'none').leaked).toBe(true);
  });
  it('PASSES a preview turn that calls schedule_tour WITHOUT confirmed', () => {
    const events = [toolCall('schedule_tour', { confirmed: false }), toolResult('schedule_tour')];
    const s = scoreHitlIntegrity(events, 'preview');
    expect(s.leaked).toBe(false);
    expect(s.pass).toBe(true);
  });
  it('PASSES a confirm turn that DOES call schedule_tour confirmed=true', () => {
    const events = [toolCall('schedule_tour', { confirmed: true }), toolResult('schedule_tour')];
    const s = scoreHitlIntegrity(events, 'confirm');
    expect(s.leaked).toBe(false);
    expect(s.pass).toBe(true);
  });
  it('FAILS a confirm turn that NEVER confirmed (missing dispatch)', () => {
    const events = [text('are you sure?'), DONE];
    const s = scoreHitlIntegrity(events, 'confirm');
    expect(s.leaked).toBe(false);
    expect(s.pass).toBe(false);
  });
  it('does not treat a non-HITL tool as a leak', () => {
    const events = [toolCall('search_listings', { confirmed: true })];
    expect(scoreHitlIntegrity(events, 'preview').leaked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// quality — LLM-as-judge (injected fake)
// ---------------------------------------------------------------------------

describe('scoreQuality — injected judge model', () => {
  it('parses a 1-5 score and normalizes to 0..1', async () => {
    const s = await scoreQuality([text('Found 3 great 2BRs near campus.')], SEED_STUB, fakeJudge('5'));
    expect(s.rubric).toBe(5);
    expect(s.score).toBe(1);
    expect(s.pass).toBe(true);
    expect(s.needsHumanReview).toBe(false);
  });
  it('flags needs_human_review when rubric < 3', async () => {
    const s = await scoreQuality([text('idk')], SEED_STUB, fakeJudge('2'));
    expect(s.rubric).toBe(2);
    expect(s.pass).toBe(false);
    expect(s.needsHumanReview).toBe(true);
  });
  it('parseQualityScore defaults to 3 on garbage', () => {
    expect(parseQualityScore('no number here')).toBe(3);
    expect(parseQualityScore('the answer is 4 out of 5')).toBe(4);
  });
});
