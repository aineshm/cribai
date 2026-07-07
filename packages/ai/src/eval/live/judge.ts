/**
 * AIN-93 live-eval harness — soft-criteria judge (plan decision 7).
 *
 * The hard checks (`checks/`) are exact and deterministic; the ticket's soft
 * criterion — "an explicit recommendation WITH tradeoffs, not just a
 * summary" — needs judgment, so it goes through `defaultCrmGenerate`
 * (the SAME structured-generation seam the CRM workflows use, AIN-15 "#3")
 * with a Zod rubric. `generateObject` THROWS `NoObjectGeneratedError` on a
 * schema mismatch — this module does NOT catch that and substitute a
 * middle score (unlike `scorers.ts`'s in-process `scoreQuality`, which
 * degrades to rubric 3 on judge failure): a malformed judge response must
 * surface as a visible harness failure, never a silent pass.
 */
import { z } from 'zod';
import { defaultCrmGenerate, type CrmGenerateObject } from '../../crm/generate';
import { seedListingsList, type SeedListingTruth } from './seed-truth';

export const JudgeRubricSchema = z
  .object({
    /** Did the assistant make an explicit pick/recommendation (not just a summary)? */
    explicit_recommendation: z.boolean(),
    /** Concrete tradeoffs cited for the recommendation (rent vs sqft, commute vs price, etc). */
    tradeoffs_cited: z.array(z.string().min(1)).max(10),
    /** Did the response stay grounded in the user's actual saved list (no invented listings)? */
    grounded_in_saved_list: z.boolean(),
    /** Only meaningful for the deliberately-ambiguous bucket. */
    clarified_instead_of_guessing: z.boolean().optional(),
    verdict: z.enum(['pass', 'fail']),
    reasoning: z.string().min(1).max(2000),
  })
  .superRefine((value, ctx) => {
    if (value.explicit_recommendation && value.tradeoffs_cited.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'tradeoffs_cited must cite at least 1 tradeoff when explicit_recommendation is true',
        path: ['tradeoffs_cited'],
      });
    }
  });

export type JudgeRubric = z.infer<typeof JudgeRubricSchema>;

const JUDGE_FUNCTION_ID = 'eval.ain93.judge';

/** Render the seed truth table as compact text the judge can ground against. */
export function renderTruthTableForJudge(rows: readonly SeedListingTruth[] = seedListingsList()): string {
  return rows
    .map((r) => {
      const status = r.status === 'archived' ? ' [ARCHIVED — must never be recommended]' : '';
      return `- "${r.nickname}" (${r.key}): $${r.rent}/mo, ${r.bedrooms}bd/${r.bathrooms}ba, ${r.sqft}sqft, ${r.address}${status}`;
    })
    .join('\n');
}

const JUDGE_INSTRUCTIONS = `You are grading one conversation turn from a student-housing AI assistant against a rubric. This is a Personal CRM — the assistant is discussing listings the STUDENT has already saved, not searching new ones.

Score honestly:
- explicit_recommendation: true only if the assistant clearly picked/recommended a specific saved listing (or explicitly declined to pick with a stated reason), not merely described options.
- tradeoffs_cited: the concrete tradeoffs actually named (e.g. "cheaper but smaller", "closer to campus but no parking"). A bare recommendation with NO cited tradeoff is a rubric violation — leave this empty and set explicit_recommendation accordingly.
- grounded_in_saved_list: false if the assistant references a listing that is not in the student's saved list below, or misstates a saved listing's facts.
- clarified_instead_of_guessing: for an AMBIGUOUS ask (multiple saved listings could match, insufficient detail to safely pick), true means the assistant asked a clarifying question instead of guessing.
- verdict: 'fail' whenever this turn was asking for a decision/recommendation and the assistant gave ONLY a summary with no explicit pick and no cited tradeoffs — a plain recap of the list is NOT a passing answer to "which one should I pick". Also 'fail' on any hallucinated listing or archived-listing recommendation.`;

export interface JudgeInput {
  readonly scenarioId: string;
  readonly scenarioDescription: string;
  /** The full turn transcript (assistant prose the harness collected — never include auth headers/tokens). */
  readonly transcriptText: string;
  readonly truthTableText?: string;
  /** DI seam for tests; defaults to the real `defaultCrmGenerate`. */
  readonly generate?: CrmGenerateObject;
}

/**
 * Judge one scenario run's transcript against the soft rubric. Throws
 * (never degrades) on a malformed/unparseable judge response.
 */
export async function judgeConversation(input: JudgeInput): Promise<JudgeRubric> {
  const generate = input.generate ?? defaultCrmGenerate;
  const truthTableText = input.truthTableText ?? renderTruthTableForJudge();

  const prompt = `${JUDGE_INSTRUCTIONS}

Scenario: ${input.scenarioDescription}

Student's saved listings (ground truth):
${truthTableText}

Conversation transcript:
${input.transcriptText}

Score this conversation now.`;

  return generate<JudgeRubric>({
    schema: JudgeRubricSchema,
    prompt,
    functionId: JUDGE_FUNCTION_ID,
    metadata: { scenarioId: input.scenarioId },
  });
}
