/**
 * PDR-004 Track A Days 5-6 (AIN-9) — eval runner smoke test.
 *
 * Confirms the runner module LOADS, the corpus loads, and the scoring core
 * (`scoreSeed` + `aggregateReport` + `formatReport`) dry-runs against a
 * RECORDED ChatEvent fixture for one seed — with a fake judge model. Does NOT
 * call `createAiSdkModel()` or hit the network. This is the offline guard the
 * task asks for; the full `runEval` (live model) is a manual/CI script.
 */

import { describe, expect, it } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import type { ChatEvent } from '../../cribai';
import {
  scoreSeed,
  aggregateReport,
  formatReport,
  resolveEvalCostCeilingUsd,
} from '../run-eval';
import { loadCorpus } from '../corpus';

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

describe('run-eval smoke — offline dry run', () => {
  it('loads the corpus (30 seeds)', () => {
    expect(loadCorpus()).toHaveLength(30);
  });

  it('resolves the cost ceiling (default $3.00)', () => {
    expect(resolveEvalCostCeilingUsd({})).toBe(3.0);
    expect(resolveEvalCostCeilingUsd({ CRIBAI_EVAL_COST_CEILING_USD: '1.5' })).toBe(1.5);
  });

  it('scores a recorded fixture for a search seed (no network)', async () => {
    const searchSeed = loadCorpus().find((s) => s.id === 'search-01')!;
    // A recorded "good" run: one search_listings call + prose.
    const events: ChatEvent[] = [
      { type: 'tool_call', name: 'search_listings', args: { semantic_query: '2br' } },
      {
        type: 'tool_result',
        name: 'search_listings',
        block: { type: 'text', content: 'Found 3.' } as never,
      },
      { type: 'text', content: 'Found 3 great 2-bedrooms near campus.' },
      { type: 'done' },
    ];

    const result = await scoreSeed(searchSeed, events, fakeJudge('5'));
    expect(result.toolSequence.pass).toBe(true);
    expect(result.hitlIntegrity.pass).toBe(true);
    expect(result.hitlLeaked).toBe(false);
    expect(result.qualityRubric).toBe(5);
  });

  it('detects a HITL leak in a recorded fixture and surfaces it in the report', async () => {
    const previewSeed = loadCorpus().find((s) => s.bucket === 'tour-prep')!;
    // A BAD recorded run: schedule_tour confirmed=true during a preview turn.
    const leakyEvents: ChatEvent[] = [
      { type: 'tool_call', name: 'schedule_tour', args: { confirmed: true } },
      {
        type: 'tool_result',
        name: 'schedule_tour',
        block: { type: 'text', content: 'sent' } as never,
      },
      { type: 'done' },
    ];

    const result = await scoreSeed(previewSeed, leakyEvents, fakeJudge('4'));
    expect(result.hitlLeaked).toBe(true);

    const report = aggregateReport([result], 0.0001, false);
    expect(report.overall.hitlLeaks).toBe(1);
    const text = formatReport(report);
    expect(text).toContain('ZERO-LEAK GATE FAILED');
  });
});
