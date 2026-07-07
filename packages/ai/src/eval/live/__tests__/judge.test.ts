/**
 * AIN-93 Task 4 — judge rubric schema + prompt wiring. `generate` is always
 * injected here — this suite makes ZERO real model calls.
 */
import { describe, expect, it, vi } from 'vitest';
import { JudgeRubricSchema, judgeConversation, renderTruthTableForJudge } from '../judge';
import { SEED_LISTINGS } from '../seed-truth';

const VALID_RECOMMENDATION = {
  explicit_recommendation: true,
  tradeoffs_cited: ['cheaper but smaller', 'no in-unit laundry'],
  grounded_in_saved_list: true,
  verdict: 'pass' as const,
  reasoning: 'Picked the studio, cited rent vs size tradeoff.',
};

describe('JudgeRubricSchema', () => {
  it('accepts a valid recommendation with cited tradeoffs', () => {
    expect(JudgeRubricSchema.safeParse(VALID_RECOMMENDATION).success).toBe(true);
  });

  it('rejects explicit_recommendation=true with zero cited tradeoffs', () => {
    const result = JudgeRubricSchema.safeParse({
      ...VALID_RECOMMENDATION,
      tradeoffs_cited: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a "summary without a pick" fixture: no recommendation, verdict fail', () => {
    const summaryOnly = {
      explicit_recommendation: false,
      tradeoffs_cited: [],
      grounded_in_saved_list: true,
      verdict: 'fail' as const,
      reasoning: 'The assistant only recapped the saved list without picking one.',
    };
    const result = JudgeRubricSchema.safeParse(summaryOnly);
    expect(result.success).toBe(true);
    expect(result.success && result.data.verdict).toBe('fail');
  });

  it('accepts the optional clarified_instead_of_guessing flag for ambiguous scenarios', () => {
    const clarified = {
      explicit_recommendation: false,
      tradeoffs_cited: [],
      grounded_in_saved_list: true,
      clarified_instead_of_guessing: true,
      verdict: 'pass' as const,
      reasoning: 'Asked which price range before guessing.',
    };
    expect(JudgeRubricSchema.safeParse(clarified).success).toBe(true);
  });

  it('rejects a missing verdict', () => {
    const { verdict: _verdict, ...rest } = VALID_RECOMMENDATION;
    expect(JudgeRubricSchema.safeParse(rest).success).toBe(false);
  });
});

describe('renderTruthTableForJudge', () => {
  it('flags the archived row so the judge never treats it as recommendable', () => {
    const text = renderTruthTableForJudge();
    expect(text).toContain(SEED_LISTINGS.archived.nickname);
    expect(text).toContain('ARCHIVED');
  });

  it('includes every seeded nickname and rent', () => {
    const text = renderTruthTableForJudge();
    expect(text).toContain(SEED_LISTINGS.studio.nickname);
    expect(text).toContain(`$${SEED_LISTINGS.studio.rent}`);
  });
});

describe('judgeConversation', () => {
  it('calls generate with a prompt containing the transcript, truth table, and scenario description', async () => {
    const generate = vi.fn().mockResolvedValue(VALID_RECOMMENDATION);

    await judgeConversation({
      scenarioId: 'pick-for-me-01',
      scenarioDescription: 'Student asks which saved listing to pick.',
      transcriptText: 'user: which one should I pick?\nassistant: Go with the studio.',
      generate,
    });

    expect(generate).toHaveBeenCalledTimes(1);
    const call = generate.mock.calls[0]![0];
    expect(call.functionId).toBe('eval.ain93.judge');
    expect(call.prompt).toContain('which one should I pick?');
    expect(call.prompt).toContain('Student asks which saved listing to pick.');
    expect(call.prompt).toContain(SEED_LISTINGS.studio.nickname);
    expect(call.schema).toBe(JudgeRubricSchema);
  });

  it('returns the parsed rubric from generate', async () => {
    const generate = vi.fn().mockResolvedValue(VALID_RECOMMENDATION);
    const rubric = await judgeConversation({
      scenarioId: 's1',
      scenarioDescription: 'desc',
      transcriptText: 'transcript',
      generate,
    });
    expect(rubric).toEqual(VALID_RECOMMENDATION);
  });

  it('propagates a malformed-output throw from generate — NO silent middle score', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('NoObjectGeneratedError: schema mismatch'));

    await expect(
      judgeConversation({
        scenarioId: 's1',
        scenarioDescription: 'desc',
        transcriptText: 'transcript',
        generate,
      }),
    ).rejects.toThrow(/NoObjectGeneratedError/);
  });

  it('instructs the judge that live Google-tool claims (reviews/ratings/landlord/neighborhood) are not in the saved-list table and must not be penalized for grounding unless they contradict it (live-run finding)', async () => {
    const generate = vi.fn().mockResolvedValue(VALID_RECOMMENDATION);

    await judgeConversation({
      scenarioId: 's1',
      scenarioDescription: 'desc',
      transcriptText: 'transcript',
      generate,
    });

    const call = generate.mock.calls[0]![0];
    expect(call.prompt).toMatch(/Google-data tools/i);
    expect(call.prompt).toMatch(/reviews|ratings|landlord|neighborhood/i);
    expect(call.prompt).toMatch(/contradict/i);
  });

  it('instructs the judge that a complete informational answer with no pick is a PASS unless the user asked for a decision between listings (live-run finding)', async () => {
    const generate = vi.fn().mockResolvedValue(VALID_RECOMMENDATION);

    await judgeConversation({
      scenarioId: 's1',
      scenarioDescription: 'desc',
      transcriptText: 'transcript',
      generate,
    });

    const call = generate.mock.calls[0]![0];
    expect(call.prompt).toMatch(/INFORMATIONAL ask/);
    expect(call.prompt).toMatch(/no-pick-fails rule applies ONLY/i);
  });
});
