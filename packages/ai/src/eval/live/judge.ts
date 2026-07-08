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
import { seedListingsList, type SeedFloorPlanTruth, type SeedListingTruth } from './seed-truth';

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

/**
 * Render one floor plan as a compact sub-line: name, bd/ba, sqft, rent
 * range, availability. Mirrors the compact style used elsewhere in this
 * harness/product (e.g. `crm/saved-list-context.ts`'s floor-plan rendering)
 * so the judge sees the same shape the model itself is prompted with.
 */
function renderFloorPlanForJudge(plan: SeedFloorPlanTruth): string {
  const beds = plan.bedrooms != null ? `${plan.bedrooms}bd` : '?bd';
  const baths = plan.bathrooms != null ? `${plan.bathrooms}ba` : '?ba';
  const sqft = plan.sqft != null ? `${plan.sqft}sqft` : 'sqft unknown';
  const rentRange =
    plan.rent_min != null
      ? plan.rent_max != null && plan.rent_max !== plan.rent_min
        ? `$${plan.rent_min.toLocaleString('en-US')}-$${plan.rent_max.toLocaleString('en-US')}`
        : `$${plan.rent_min.toLocaleString('en-US')}`
      : 'price unknown';
  const availability = plan.availability ?? 'availability unknown';
  return `    - ${plan.name}: ${beds}/${baths}, ${sqft}, ${rentRange}, ${availability}`;
}

/**
 * Render the seed truth table as compact text the judge can ground against.
 * Includes amenities — live-smoke evidence (2026-07-07): with amenities
 * omitted, the real judge scored every amenity tradeoff ("laundry vs
 * dishwasher") as an unverifiable claim and failed grounding on GOOD
 * answers. The truth text must carry every fact class the assistant
 * legitimately cites.
 *
 * AIN-93 run-4 calibration gap (2026-07-07): the `building` row's top-level
 * fields mirror only its CHEAPEST floor plan (see seed-truth.ts), but since
 * AIN-99 the CRM chat correctly surfaces the FULL floor-plan lineup from
 * `deep_extract`. With only the top-level fields rendered here, every
 * correct floor-plan answer looked like a hallucination to the judge (all 6
 * floor-plan-bucket runs + several comparison runs failed on exactly this).
 * Each row's `floorPlans` (when present) is now rendered as its own indented
 * sub-block, so a floor plan the model cites is verifiably IN the truth
 * table, still nested under its one parent listing.
 */
export function renderTruthTableForJudge(rows: readonly SeedListingTruth[] = seedListingsList()): string {
  return rows
    .map((r) => {
      const status = r.status === 'archived' ? ' [ARCHIVED — must never be recommended]' : '';
      const amenities = r.amenities.length > 0 ? `, amenities: ${r.amenities.join('/')}` : '';
      const base = `- "${r.nickname}" (${r.key}): $${r.rent}/mo, ${r.bedrooms}bd/${r.bathrooms}ba, ${r.sqft}sqft, ${r.address}${amenities}${status}`;
      if (!r.floorPlans || r.floorPlans.length === 0) return base;
      const plansHeader = '  floor plans available within THIS ONE listing (not separate saved listings):';
      const plansLines = r.floorPlans.map(renderFloorPlanForJudge).join('\n');
      return `${base}\n${plansHeader}\n${plansLines}`;
    })
    .join('\n');
}

const JUDGE_INSTRUCTIONS = `You are grading one conversation turn from a student-housing AI assistant against a rubric. This is a Personal CRM — the assistant is discussing listings the STUDENT has already saved, not searching new ones.

Score honestly:
- explicit_recommendation: true only if the assistant clearly picked/recommended a specific saved listing (or explicitly declined to pick with a stated reason), not merely described options.
- tradeoffs_cited: the concrete tradeoffs actually named (e.g. "cheaper but smaller", "closer to campus but no parking"). A bare recommendation with NO cited tradeoff is a rubric violation — leave this empty and set explicit_recommendation accordingly.
- grounded_in_saved_list: false ONLY if the assistant names a listing that is not in the student's saved list below, or CONTRADICTS a fact stated below (wrong rent, wrong sqft, wrong amenity, recommending an archived listing). A detail the list below simply doesn't mention is NOT a grounding violation — do not penalize plausible elaboration that contradicts nothing. Claims about reviews, ratings, landlord reputation, or neighborhood/crime/safety come from LIVE Google-data tools whose output is NOT shown in the saved-list table below — never penalize grounding for these claims unless they directly CONTRADICT something the table states; the table simply not mentioning a review or neighborhood fact is not a contradiction. A saved building listing may carry multiple floor plans (rendered as an indented sub-block under that listing) — an answer that cites a bed/bath count, sqft, price, or availability from one of those listed floor plans IS grounded, not a hallucination. But a floor plan is still part of that ONE parent listing, not a separate saved listing — never credit the user with a second saved listing just because a building has an additional floor plan, and never let the model substitute a building's floor plan for a DIFFERENT listing the user actually saved.
- clarified_instead_of_guessing: for an AMBIGUOUS ask (multiple saved listings could match, insufficient detail to safely pick), true means the assistant asked a clarifying question instead of guessing.
- verdict: 'fail' whenever this turn was asking for a decision/recommendation between listings and the assistant gave ONLY a summary with no explicit pick and no cited tradeoffs — a plain recap of the list is NOT a passing answer to "which one should I pick". Also 'fail' on any hallucinated listing or archived-listing recommendation. The no-pick-fails rule applies ONLY when the user asked for a decision/recommendation between saved listings. For an INFORMATIONAL ask (a checklist, what-to-ask-the-landlord list, floor-plan/amenity question, or other generic advice with no listing-vs-listing decision requested), a complete and helpful answer with no explicit pick is a PASS — do not fail an informational answer merely for lacking a recommendation.`;

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
 *
 * NOTE (AIN-93 live-run adjudication, harness-only rule): live evidence showed
 * the judge grading near-identical transcripts inconsistently across runs —
 * a `temperature: 0` call would help determinism, but `CrmGenerateObject` /
 * `CrmGenerateOptions` (`../crm/generate.ts`) do not expose a temperature
 * knob, and that file is out of scope for this harness-only fix (it's the
 * shared CRM structured-generation seam used by production workflows too).
 * Left as-is; flag for a follow-up if the seam grows a temperature option.
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
