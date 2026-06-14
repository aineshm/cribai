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

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const FloorPlanSchema = z.object({
  name: z.string().max(120),
  bedrooms: z.number().min(0).max(20).nullish(),
  bathrooms: z.number().min(0).max(20).nullish(),
  rent_min: z.number().positive().max(50_000).nullish(),
  rent_max: z.number().positive().max(50_000).nullish(),
  sqft: z.number().positive().max(50_000).nullish(),
  availability: z.string().max(80).nullish(),
});

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
  floor_plans: z.array(FloorPlanSchema).max(20).nullish(),
});

export type DeepExtract = z.infer<typeof DeepExtractSchema>;
export type FloorPlan = z.infer<typeof FloorPlanSchema>;

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

    let fields: DeepExtract = {};

    try {
      const raw = await generate({
        schema: DeepExtractSchema as z.ZodType<Record<string, unknown>>,
        prompt,
        functionId: 'crm.deep_extract.synthesize',
        metadata: { listingId: ctx.input.listingId as string },
      });
      const parsed = DeepExtractSchema.safeParse(raw);
      if (parsed.success) {
        fields = applyFloorPlanTopLevel(parsed.data);
      }
    } catch {
      // LLM failures degrade to empty fields — never throws
    }

    return {
      output: { fields },
    };
  },
};
