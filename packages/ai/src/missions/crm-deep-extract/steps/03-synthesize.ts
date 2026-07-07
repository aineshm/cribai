/**
 * synthesize step for crm_deep_extract mission (AIN-71).
 *
 * One LLM call to synthesize all crawled page context into a structured
 * DeepExtract schema. Floor-plan-only sites (top-level rent = cheapest plan)
 * are handled here. Never throws — LLM failures degrade to empty fields.
 */

import { z } from 'zod';
import type { MissionStep, StepContext, StepResult } from '../../types';
import {
  defaultCrmGenerate,
  type CrmGenerateObject,
} from '../../../crm/generate';
import {
  FloorPlanSchema,
  FloorPlansArraySchema,
  FLOOR_PLAN_MAX_COUNT,
  type FloorPlan,
} from '../../../extraction/floor-plan';

// Re-exported so existing callers (04-update-row.ts, tests) importing
// `FloorPlan` from this module keep working — the shared definition now
// lives in `extraction/floor-plan.ts` (AIN-83 Task 1), reused by the
// deterministic Zillow projection (Task 2) and this LLM mission path.
export type { FloorPlan } from '../../../extraction/floor-plan';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const DeepExtractSchema = z.object({
  title: z.string().max(200).nullish(),
  description: z.string().max(2000).nullish(),
  rent: z.number().positive().max(50_000).nullish(),
  bedrooms: z.number().min(0).max(20).nullish(),
  bathrooms: z.number().min(0).max(20).nullish(),
  sqft: z.number().positive().max(50_000).nullish(),
  address: z.string().max(300).nullish(),
  available_from: z.string().max(40).nullish(),
  amenities: z.array(z.string().max(80)).max(30).nullish(),
  floor_plans: z.array(FloorPlanSchema).max(FLOOR_PLAN_MAX_COUNT).nullish(),
});

export type DeepExtract = z.infer<typeof DeepExtractSchema>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max chars of text excerpt per page included in the prompt. */
const MAX_PAGE_EXCERPT_CHARS = 20_000;
/** Max number of pages included in the prompt (avoid context blow-up). */
const MAX_PAGES_IN_PROMPT = 4;

const SYSTEM_PROMPT = `You are extracting apartment listing data from marketing website page text.

Output ONLY values explicitly evidenced in the provided page text. Use null when not evidenced.

If the site lists floor plans rather than a specific unit, populate floor_plans with one entry per
plan and set the top-level rent/bedrooms/bathrooms/sqft from the CHEAPEST plan (this is "from"
pricing for a property-level save).

Prices: monthly USD; per-installment student pricing counts as monthly.
Never guess unit numbers — absence is normal.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPrompt(
  pages: ReadonlyArray<{ url: string; textExcerpt: string }>,
): string {
  const sections = pages
    .slice(0, MAX_PAGES_IN_PROMPT)
    .map((p, i) => {
      const excerpt = p.textExcerpt.slice(0, MAX_PAGE_EXCERPT_CHARS);
      return `--- PAGE ${i + 1}: ${p.url} ---\n${excerpt}`;
    })
    .join('\n\n');

  return `${SYSTEM_PROMPT}\n\n${sections}\n\nExtract the listing data:`;
}

/**
 * When floor_plans is present, ensure top-level rent/bedrooms/bathrooms/sqft
 * reflect the cheapest plan. The synthesize step enforces this — recompute
 * min and prefer it if they disagree (per plan spec in step 4.5).
 *
 * CodeRabbit PR #121 fix 1 (Major): callers MUST pass this the FINAL merged
 * fields (post `mergeOntoBaseline`), never the raw LLM output. The merge can
 * choose the deterministic baseline's floor_plans over the LLM's (baseline
 * wins when non-empty — see `mergeOntoBaseline` below); deriving from the
 * LLM's own (possibly-discarded) plan list would let a hallucinated rent
 * reach the row even though no PERSISTED plan supports it.
 */
function applyFloorPlanTopLevel(fields: DeepExtract): DeepExtract {
  const plans = fields.floor_plans;
  if (!plans || plans.length === 0) return fields;

  // Find cheapest by rent_min
  let cheapest: FloorPlan | null = null;
  for (const plan of plans) {
    const price = plan.rent_min ?? plan.rent_max;
    if (price == null) continue;
    const cheapestPrice = cheapest?.rent_min ?? cheapest?.rent_max;
    if (cheapest === null || cheapestPrice == null || price < cheapestPrice) {
      cheapest = plan;
    }
  }

  if (!cheapest) return fields;

  const computedRent = cheapest.rent_min ?? cheapest.rent_max ?? null;
  return {
    ...fields,
    rent: computedRent ?? fields.rent,
    bedrooms: cheapest.bedrooms ?? fields.bedrooms,
    bathrooms: cheapest.bathrooms ?? fields.bathrooms,
    sqft: cheapest.sqft ?? fields.sqft,
  };
}

/**
 * Build a DeepExtract baseline from the structured fields crawl_source already
 * extracted into state.pages[].fields (ExtractedListing names: price→rent,
 * square_feet→sqft). AIN-81: this is the floor the LLM augments. When the LLM
 * call fails or returns null for a field, the high-confidence json_ld/OG
 * extraction still reaches the row instead of being silently dropped. First
 * non-nullish value across pages wins (the landing page is pages[0]).
 */
function buildBaselineFromPages(
  pages: ReadonlyArray<{ fields: Record<string, unknown> }>,
): DeepExtract {
  const baseline: DeepExtract = {};
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim().length > 0 ? v : undefined;
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
  // bedrooms/bathrooms may legitimately be 0 (a studio) — allow >= 0 so the
  // count isn't silently dropped to null on the baseline path.
  const countNum = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;

  for (const { fields: f } of pages) {
    baseline.rent ??= num(f['price']);
    baseline.sqft ??= num(f['square_feet']);
    baseline.bedrooms ??= countNum(f['bedrooms']);
    baseline.bathrooms ??= countNum(f['bathrooms']);
    baseline.title ??= str(f['title']);
    baseline.address ??= str(f['address']);
    baseline.description ??= str(f['description']);
    baseline.available_from ??= str(f['available_from']);
    if (baseline.amenities == null && Array.isArray(f['amenities']) && f['amenities'].length > 0) {
      baseline.amenities = (f['amenities'] as unknown[]).filter(
        (a): a is string => typeof a === 'string',
      );
    }
    // AIN-83: floor_plans populated by crawl_source for Zillow building pages
    // (Task 2's extractZillowFloorPlans, threaded through pages[].fields).
    // First page with a non-empty array wins — same "landing page first"
    // precedence as every other baseline field above.
    //
    // CodeRabbit PR #121 fix 3: validate rather than bare-cast. `pages[].fields`
    // is untrusted (crawl_source output, not schema-checked at this seam) — a
    // malformed shape must be dropped, not silently pushed through to the row.
    if (baseline.floor_plans == null && Array.isArray(f['floor_plans']) && f['floor_plans'].length > 0) {
      const parsedPlans = FloorPlansArraySchema.safeParse(f['floor_plans']);
      if (parsedPlans.success) {
        baseline.floor_plans = parsedPlans.data;
      }
    }
  }
  return baseline;
}

/**
 * Merge the LLM's structured output ONTO the baseline: the LLM wins on any field
 * it provides a non-nullish value for; the baseline fills the rest. Gap-fill
 * against existing row values (never overwriting user data) happens in update-row.
 */
function mergeOntoBaseline(llm: DeepExtract, baseline: DeepExtract): DeepExtract {
  const pick = <K extends keyof DeepExtract>(k: K): DeepExtract[K] =>
    (llm[k] ?? baseline[k] ?? null) as DeepExtract[K];
  return {
    title: pick('title'),
    description: pick('description'),
    rent: pick('rent'),
    bedrooms: pick('bedrooms'),
    bathrooms: pick('bathrooms'),
    sqft: pick('sqft'),
    address: pick('address'),
    available_from: pick('available_from'),
    amenities:
      llm.amenities && llm.amenities.length > 0 ? llm.amenities : baseline.amenities ?? null,
    // AIN-83 decision 4: the deterministic baseline WINS over the LLM here
    // (the opposite precedence from every scalar field above) — exact
    // structured numbers from __NEXT_DATA__ beat prose-mined guesses, and
    // this also gives AIN-81 robustness for free: floor plans persist even
    // when the LLM call throws (`fields = baseline` in the catch below).
    // The LLM remains the only source for marketing sites with no
    // structured blob (baseline empty).
    floor_plans:
      baseline.floor_plans && baseline.floor_plans.length > 0
        ? baseline.floor_plans
        : llm.floor_plans ?? null,
  };
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

export const synthesizeStep: MissionStep = {
  id: 'synthesize',
  label: 'Synthesizing extracted data',

  async run(ctx: StepContext): Promise<StepResult> {
    const pages = (
      (ctx.state as Record<string, unknown>).pages ?? []
    ) as ReadonlyArray<{ url: string; fields: Record<string, unknown>; textExcerpt: string }>;

    // When no pages were crawled (e.g. source was bot-blocked), skip the LLM call —
    // return empty fields so the pipeline continues without wasting a token budget.
    if (pages.length === 0) {
      return { output: { fields: {} } };
    }

    const generate = (
      (ctx.input as Record<string, unknown>).generate as CrmGenerateObject | undefined
    ) ?? defaultCrmGenerate;

    const prompt = buildPrompt(pages);

    // AIN-81: the structured json_ld/OG extraction from crawl_source is the
    // baseline. The LLM augments it; on LLM failure the baseline still ships.
    //
    // AIN-83 live-proof fix: `applyFloorPlanTopLevel` must run here too, not
    // just on the parse-success path below. Both the catch path (LLM threw)
    // and the parse-failure path (schema safeParse failed) fall through to
    // this `fields` value unchanged — without the derivation, a baseline that
    // carries floor_plans but no top-level bedrooms/sqft (e.g. crawl_source
    // only populated floor_plans) ships nulls even though a persisted plan
    // has the answer. No-op when there are no floor_plans.
    const baseline = buildBaselineFromPages(pages);
    let fields: DeepExtract = applyFloorPlanTopLevel(baseline);

    try {
      const raw = await generate({
        schema: DeepExtractSchema as z.ZodType<Record<string, unknown>>,
        prompt,
        functionId: 'crm.deep_extract.synthesize',
        metadata: { listingId: ctx.input.listingId as string },
      });
      const parsed = DeepExtractSchema.safeParse(raw);
      if (parsed.success) {
        // CodeRabbit PR #121 fix 1: merge FIRST, then derive top-level fields
        // from the FINAL floor_plans list — never from the LLM's raw output,
        // which the merge may discard entirely in favor of the deterministic
        // baseline.
        fields = applyFloorPlanTopLevel(mergeOntoBaseline(parsed.data, baseline));
      }
    } catch {
      // LLM failure → keep the structured baseline (never throws)
    }

    return {
      output: { fields },
    };
  },
};
