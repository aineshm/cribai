/**
 * AIN-93 live-eval harness — LIVE smoke for the judge (`judge.ts` →
 * `defaultCrmGenerate` → real OpenAI). Skipped unless E2E_LIVE_OPENAI=1 (the
 * SAME flag `openai-live.smoke.test.ts` / `crm-machinedata-live.smoke.test.ts`
 * use — one env var gates every real-OpenAI smoke in this package).
 *
 * The mocked suite (`__tests__/judge.test.ts`) injects a fake `generate` and
 * never touches a model — it proves the PROMPT WIRING, not that a real OpenAI
 * structured-generation call actually returns a rubric matching the Zod
 * schema. That's the schema-strictness trap `openai-live.smoke.test.ts`'s
 * header documents: `generateObject` THROWS `NoObjectGeneratedError` on a
 * mismatch, so `judgeConversation` resolving at all — with no injected
 * `generate`, i.e. the real `defaultCrmGenerate` path — IS the schema-
 * strictness assertion.
 *
 * Two canned transcripts, both grounded in the fixed truth table
 * (`seed-truth.ts`) so `grounded_in_saved_list` has real listing names/rents
 * to check against:
 *   (a) an explicit pick with cited tradeoffs -> expect verdict 'pass' and
 *       explicit_recommendation true.
 *   (b) a wishy-washy recap with NO pick -> expect the discriminating signal
 *       (verdict 'fail' OR explicit_recommendation false). Deliberately does
 *       NOT pin which field the judge uses to encode "no pick" — the rubric
 *       schema's own superRefine ties them together but doesn't force one
 *       specific encoding.
 *
 * Run (key passed inline, never committed):
 *   OPENAI_API_KEY=... E2E_LIVE_OPENAI=1 \
 *     pnpm --filter @campusnest/ai exec vitest run src/eval/live/__tests__/judge-live.smoke.test.ts
 */
import { describe, expect, it } from 'vitest';
import { judgeConversation } from '../judge';
import { SEED_LISTINGS } from '../seed-truth';

const LIVE = process.env.E2E_LIVE_OPENAI === '1';

const SCENARIO_DESCRIPTION =
  'Student asks which saved listing to pick between the studio and the one-bedroom.';

const CLEAR_RECOMMENDATION_TRANSCRIPT = `user: I'm deciding between "${SEED_LISTINGS.studio.nickname}" and "${SEED_LISTINGS.onebed.nickname}" — which one should I pick?
assistant: Go with "${SEED_LISTINGS.studio.nickname}". It's $${SEED_LISTINGS.studio.rent}/mo vs $${SEED_LISTINGS.onebed.rent}/mo for "${SEED_LISTINGS.onebed.nickname}" — cheaper, though it's smaller at ${SEED_LISTINGS.studio.sqft}sqft vs ${SEED_LISTINGS.onebed.sqft}sqft and only has basic laundry-on-site instead of a dishwasher. If budget is your main constraint, the studio wins on price; if you want the extra room and the dishwasher, the one-bedroom is worth the roughly $200/mo premium.`;

const WISHY_WASHY_TRANSCRIPT = `user: I'm deciding between "${SEED_LISTINGS.studio.nickname}" and "${SEED_LISTINGS.onebed.nickname}" — which one should I pick?
assistant: Here's a quick recap of both: "${SEED_LISTINGS.studio.nickname}" is $${SEED_LISTINGS.studio.rent}/mo, ${SEED_LISTINGS.studio.sqft}sqft, with laundry on site. "${SEED_LISTINGS.onebed.nickname}" is $${SEED_LISTINGS.onebed.rent}/mo, ${SEED_LISTINGS.onebed.sqft}sqft, with laundry on site and a dishwasher. Both are solid options near campus depending on what matters most to you!`;

describe.skipIf(!LIVE)('judgeConversation — LIVE smoke (real OpenAI judge)', () => {
  it('scores an explicit recommendation with cited tradeoffs as pass/explicit', async () => {
    expect(
      process.env.OPENAI_API_KEY,
      'OPENAI_API_KEY must be set for the live smoke',
    ).toBeTruthy();

    const startedAt = Date.now();
    const rubric = await judgeConversation({
      scenarioId: 'live-smoke-clear-recommendation',
      scenarioDescription: SCENARIO_DESCRIPTION,
      transcriptText: CLEAR_RECOMMENDATION_TRANSCRIPT,
    });
    const latencyMs = Date.now() - startedAt;

    // Surface the real judge output regardless of pass/fail (key NOT logged).
    // eslint-disable-next-line no-console
    console.log(
      'LIVE_SMOKE_RESULT ' +
        JSON.stringify({
          case: 'clear-recommendation',
          verdict: rubric.verdict,
          explicit_recommendation: rubric.explicit_recommendation,
          tradeoffs_cited: rubric.tradeoffs_cited,
          grounded_in_saved_list: rubric.grounded_in_saved_list,
          latencyMs,
        }),
    );

    expect(rubric.verdict).toBe('pass');
    expect(rubric.explicit_recommendation).toBe(true);
    expect(rubric.tradeoffs_cited.length).toBeGreaterThan(0);
  }, 60_000);

  it('scores a no-pick summary as fail or non-explicit — never a clean pass', async () => {
    expect(
      process.env.OPENAI_API_KEY,
      'OPENAI_API_KEY must be set for the live smoke',
    ).toBeTruthy();

    const startedAt = Date.now();
    const rubric = await judgeConversation({
      scenarioId: 'live-smoke-wishy-washy',
      scenarioDescription: SCENARIO_DESCRIPTION,
      transcriptText: WISHY_WASHY_TRANSCRIPT,
    });
    const latencyMs = Date.now() - startedAt;

    // eslint-disable-next-line no-console
    console.log(
      'LIVE_SMOKE_RESULT ' +
        JSON.stringify({
          case: 'wishy-washy-summary',
          verdict: rubric.verdict,
          explicit_recommendation: rubric.explicit_recommendation,
          tradeoffs_cited: rubric.tradeoffs_cited,
          grounded_in_saved_list: rubric.grounded_in_saved_list,
          latencyMs,
        }),
    );

    // Don't over-pin exact judge behavior: assert the discriminating signal
    // ("this was NOT a clean recommendation"), allow either encoding.
    const failedOrNonExplicit =
      rubric.verdict === 'fail' || rubric.explicit_recommendation === false;
    expect(
      failedOrNonExplicit,
      `expected verdict 'fail' or explicit_recommendation=false, got ${JSON.stringify({
        verdict: rubric.verdict,
        explicit_recommendation: rubric.explicit_recommendation,
      })}`,
    ).toBe(true);
  }, 60_000);
});
