/**
 * Tests for synthesize step (AIN-71 step 4.4).
 */

import { describe, it, expect, vi } from 'vitest';
import type { StepContext } from '../../types';

function makeCtx(
  pages: Array<{ url: string; fields: Record<string, unknown>; textExcerpt: string }>,
  stubs: Partial<StepContext> = {},
): StepContext {
  return {
    missionId: 'mission-1',
    userId: 'user-1',
    campusId: 'uw-madison',
    campusSlug: 'uw-madison',
    input: { listingId: 'listing-1', sourceUrl: 'https://x01oncampus.com/' },
    state: { pages, discarded: [] },
    supabase: {} as unknown as StepContext['supabase'],
    ...stubs,
  };
}

const FIXTURE_STANDARD = {
  title: 'X01 on Campus',
  description: 'Modern student housing near UW-Madison.',
  rent: 1450,
  bedrooms: 2,
  bathrooms: 2,
  sqft: 900,
  address: '640 W Dayton St, Madison, WI 53703',
  available_from: 'Fall 2026',
  amenities: ['dishwasher', 'in-unit laundry'],
  floor_plans: null,
};

const FIXTURE_FLOOR_PLANS_ONLY = {
  title: 'X01 on Campus',
  description: null,
  rent: 899,
  bedrooms: 0,
  bathrooms: 1,
  sqft: 450,
  address: null,
  available_from: null,
  amenities: null,
  floor_plans: [
    { name: 'Studio', bedrooms: 0, bathrooms: 1, rent_min: 899, rent_max: 950, sqft: 450, availability: '2 left' },
    { name: '2BR/2BA', bedrooms: 2, bathrooms: 2, rent_min: 1450, rent_max: 1600, sqft: 900, availability: 'Fall 2026' },
  ],
};

describe('synthesize step', () => {
  it('calls LLM with page context and returns fields', async () => {
    const stubGenerate = vi.fn().mockResolvedValue(FIXTURE_STANDARD);
    const { synthesizeStep } = await import('../steps/03-synthesize');

    const pages = [
      { url: 'https://x01oncampus.com/', fields: { address: '640 W Dayton St' }, textExcerpt: 'Rent from $1450. 2 Bed / 2 Bath.' },
    ];
    const ctx = makeCtx(pages);
    (ctx.input as Record<string, unknown>).generate = stubGenerate;

    const result = await synthesizeStep.run(ctx);

    expect(stubGenerate).toHaveBeenCalledOnce();
    expect(result.output.fields).toMatchObject({ rent: 1450 });
  });

  it('handles floor-plan-only sites: top-level rent from cheapest plan', async () => {
    const stubGenerate = vi.fn().mockResolvedValue(FIXTURE_FLOOR_PLANS_ONLY);
    const { synthesizeStep } = await import('../steps/03-synthesize');

    const ctx = makeCtx([{ url: 'https://x01oncampus.com/floor-plans', fields: {}, textExcerpt: 'Studio from $899' }]);
    (ctx.input as Record<string, unknown>).generate = stubGenerate;

    const result = await synthesizeStep.run(ctx);

    const fields = result.output.fields as typeof FIXTURE_FLOOR_PLANS_ONLY;
    expect(fields.floor_plans).toHaveLength(2);
    // top-level rent should be from cheapest plan (studio @ $899)
    expect(fields.rent).toBe(899);
    expect(fields.bedrooms).toBe(0);
  });

  it('degrades to the structured baseline on LLM failure (empty here — no page fields)', async () => {
    const stubGenerate = vi.fn().mockRejectedValue(new Error('provider error'));
    const { synthesizeStep } = await import('../steps/03-synthesize');

    const ctx = makeCtx([{ url: 'https://x01oncampus.com/', fields: {}, textExcerpt: '' }]);
    (ctx.input as Record<string, unknown>).generate = stubGenerate;

    const result = await synthesizeStep.run(ctx);
    expect(result.output.fields).toBeDefined();
    // No throw — mission continues
  });

  it('does not include raw HTML in the LLM prompt (JSONB-safe)', async () => {
    let capturedPrompt = '';
    const stubGenerate = vi.fn().mockImplementation((opts: { prompt: string }) => {
      capturedPrompt = opts.prompt;
      return Promise.resolve(FIXTURE_STANDARD);
    });
    const { synthesizeStep } = await import('../steps/03-synthesize');

    const ctx = makeCtx([{ url: 'https://x01oncampus.com/', fields: {}, textExcerpt: 'Apartments from $899' }]);
    (ctx.input as Record<string, unknown>).generate = stubGenerate;

    await synthesizeStep.run(ctx);

    expect(capturedPrompt).not.toMatch(/<html/i);
    expect(capturedPrompt).toContain('Apartments from $899');
  });

  // AIN-81: the high-confidence structured extraction from crawl_source
  // (pages[].fields, ExtractedListing names: price=rent, square_feet=sqft) must
  // reach the row. It is the BASELINE; the LLM augments/overrides it per-field.
  describe('structured baseline (AIN-81)', () => {
    it('falls back to structured page extraction when the LLM fails', async () => {
      const stubGenerate = vi.fn().mockRejectedValue(new Error('provider error'));
      const { synthesizeStep } = await import('../steps/03-synthesize');

      const pages = [{
        url: 'https://www.zillow.com/homedetails/x/',
        fields: {
          price: 1950,
          square_feet: 850,
          bedrooms: 2,
          bathrooms: 1,
          address: '123 W Gorham St',
          description: 'Cozy 2BR near campus.',
          available_from: '2026-08-15',
          amenities: ['In-unit laundry', 'Dishwasher'],
        },
        textExcerpt: '<h1>123 W Gorham St</h1>',
      }];
      const ctx = makeCtx(pages);
      (ctx.input as Record<string, unknown>).generate = stubGenerate;

      const result = await synthesizeStep.run(ctx);
      const f = result.output.fields as Record<string, unknown>;
      expect(f.rent).toBe(1950);
      expect(f.sqft).toBe(850);
      expect(f.bedrooms).toBe(2);
      expect(f.bathrooms).toBe(1);
      expect(f.address).toBe('123 W Gorham St');
      expect(f.description).toBe('Cozy 2BR near campus.');
      expect(f.available_from).toBe('2026-08-15');
      expect(f.amenities).toEqual(['In-unit laundry', 'Dishwasher']);
    });

    it('uses the LLM output to fill gaps the structured extraction missed', async () => {
      const stubGenerate = vi.fn().mockResolvedValue({ description: 'Modern apartment', rent: null });
      const { synthesizeStep } = await import('../steps/03-synthesize');

      const pages = [{ url: 'https://x/', fields: { price: 1950 }, textExcerpt: 'Apartments' }];
      const ctx = makeCtx(pages);
      (ctx.input as Record<string, unknown>).generate = stubGenerate;

      const result = await synthesizeStep.run(ctx);
      const f = result.output.fields as Record<string, unknown>;
      expect(f.rent).toBe(1950); // from structured baseline (LLM returned null)
      expect(f.description).toBe('Modern apartment'); // from LLM
    });

    it('preserves bedrooms: 0 (studio) from the structured baseline on LLM failure', async () => {
      const stubGenerate = vi.fn().mockRejectedValue(new Error('provider error'));
      const { synthesizeStep } = await import('../steps/03-synthesize');

      const pages = [{ url: 'https://x/', fields: { price: 1500, bedrooms: 0, bathrooms: 1 }, textExcerpt: '' }];
      const ctx = makeCtx(pages);
      (ctx.input as Record<string, unknown>).generate = stubGenerate;

      const result = await synthesizeStep.run(ctx);
      const f = result.output.fields as Record<string, unknown>;
      expect(f.bedrooms).toBe(0); // studio — must not be dropped to null
      expect(f.bathrooms).toBe(1);
      expect(f.rent).toBe(1500);
    });

    it('prefers the LLM value over the structured baseline on conflict', async () => {
      const stubGenerate = vi.fn().mockResolvedValue({ rent: 1800 });
      const { synthesizeStep } = await import('../steps/03-synthesize');

      const pages = [{ url: 'https://x/', fields: { price: 1950 }, textExcerpt: 'Apartments' }];
      const ctx = makeCtx(pages);
      (ctx.input as Record<string, unknown>).generate = stubGenerate;

      const result = await synthesizeStep.run(ctx);
      const f = result.output.fields as Record<string, unknown>;
      expect(f.rent).toBe(1800); // LLM wins on a real conflict
    });
  });

  // -------------------------------------------------------------------------
  // AIN-83 Task 4: deterministic floor_plans baseline wins over the LLM.
  // The crawl_source step now populates pages[].fields.floor_plans for
  // Zillow building pages (Task 2's extractZillowFloorPlans); those are
  // EXACT numbers from __NEXT_DATA__ and must beat any LLM-mined guess.
  // -------------------------------------------------------------------------
  describe('deterministic floor_plans baseline (AIN-83)', () => {
    const DETERMINISTIC_PLANS = [
      { name: 'A11', bedrooms: 1, bathrooms: 1, rent_min: 1819, rent_max: 2118, sqft: 799 },
      { name: 'S1', bedrooms: 0, bathrooms: 1, rent_min: 1825, rent_max: 1825, sqft: 547 },
    ];

    it('carries page-fields floor_plans into the baseline (first page with a non-empty array wins)', async () => {
      const stubGenerate = vi.fn().mockRejectedValue(new Error('provider error'));
      const { synthesizeStep } = await import('../steps/03-synthesize');

      const pages = [
        { url: 'https://www.zillow.com/apartments/x/', fields: { floor_plans: DETERMINISTIC_PLANS }, textExcerpt: '' },
      ];
      const ctx = makeCtx(pages);
      (ctx.input as Record<string, unknown>).generate = stubGenerate;

      const result = await synthesizeStep.run(ctx);
      const f = result.output.fields as Record<string, unknown>;
      expect(f.floor_plans).toEqual(DETERMINISTIC_PLANS);
    });

    it('ignores the LLM floor_plans when the deterministic baseline is non-empty (baseline wins)', async () => {
      const llmPlans = [{ name: 'LLM-guessed plan', bedrooms: 3, rent_min: 500 }];
      const stubGenerate = vi.fn().mockResolvedValue({ floor_plans: llmPlans });
      const { synthesizeStep } = await import('../steps/03-synthesize');

      const pages = [
        { url: 'https://www.zillow.com/apartments/x/', fields: { floor_plans: DETERMINISTIC_PLANS }, textExcerpt: 'Studio from $899' },
      ];
      const ctx = makeCtx(pages);
      (ctx.input as Record<string, unknown>).generate = stubGenerate;

      const result = await synthesizeStep.run(ctx);
      const f = result.output.fields as Record<string, unknown>;
      expect(f.floor_plans).toEqual(DETERMINISTIC_PLANS);
      expect(f.floor_plans).not.toEqual(llmPlans);
    });

    it('uses the LLM floor_plans when the baseline has none (marketing sites with no structured blob)', async () => {
      const llmPlans = [{ name: 'Studio', bedrooms: 0, rent_min: 899 }];
      const stubGenerate = vi.fn().mockResolvedValue({ floor_plans: llmPlans });
      const { synthesizeStep } = await import('../steps/03-synthesize');

      const pages = [
        { url: 'https://x01oncampus.com/floor-plans', fields: {}, textExcerpt: 'Studio from $899' },
      ];
      const ctx = makeCtx(pages);
      (ctx.input as Record<string, unknown>).generate = stubGenerate;

      const result = await synthesizeStep.run(ctx);
      const f = result.output.fields as Record<string, unknown>;
      expect(f.floor_plans).toEqual(llmPlans);
    });

    it('AIN-81 robustness: deterministic floor_plans still persist when the LLM call throws', async () => {
      const stubGenerate = vi.fn().mockRejectedValue(new Error('provider error'));
      const { synthesizeStep } = await import('../steps/03-synthesize');

      const pages = [
        { url: 'https://www.zillow.com/apartments/x/', fields: { floor_plans: DETERMINISTIC_PLANS }, textExcerpt: '' },
      ];
      const ctx = makeCtx(pages);
      (ctx.input as Record<string, unknown>).generate = stubGenerate;

      const result = await synthesizeStep.run(ctx);
      const f = result.output.fields as Record<string, unknown>;
      expect(f.floor_plans).toEqual(DETERMINISTIC_PLANS);
    });

    // CodeRabbit PR #121 fix 1 (Major): the cheapest-plan top-level derivation
    // must run on the FINAL merged floor_plans list, not the raw LLM output.
    // The merge can pick the deterministic baseline over the LLM's floor_plans
    // (as the test above proves) — deriving rent/bedrooms/bathrooms/sqft from
    // the LLM's (discarded) plans before that merge lets an LLM-hallucinated
    // number reach the row even though it matches NO persisted plan.
    it('derives top-level fields from the FINAL merged floor_plans, not the raw (possibly-discarded) LLM output', async () => {
      const llmPlans = [
        { name: 'LLM-guessed plan', bedrooms: 3, bathrooms: 2, rent_min: 900, sqft: 1200 },
      ];
      // The LLM's own top-level fields agree with ITS cheapest plan (900) —
      // but the deterministic baseline (cheapest = A11 @ 1819) wins the
      // floor_plans merge. Final top-level fields must reflect the WINNING
      // (baseline) plans, not the LLM's discarded 900/3bed/1200sqft.
      const stubGenerate = vi.fn().mockResolvedValue({
        floor_plans: llmPlans,
        rent: 900,
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1200,
      });
      const { synthesizeStep } = await import('../steps/03-synthesize');

      const pages = [
        { url: 'https://www.zillow.com/apartments/x/', fields: { floor_plans: DETERMINISTIC_PLANS }, textExcerpt: 'plans' },
      ];
      const ctx = makeCtx(pages);
      (ctx.input as Record<string, unknown>).generate = stubGenerate;

      const result = await synthesizeStep.run(ctx);
      const f = result.output.fields as Record<string, unknown>;

      expect(f.floor_plans).toEqual(DETERMINISTIC_PLANS);
      // Cheapest PERSISTED plan is A11 (rent_min 1819) — top-level fields
      // must derive from that, never the LLM's hallucinated 900.
      expect(f.rent).toBe(1819);
      expect(f.bedrooms).toBe(1);
      expect(f.bathrooms).toBe(1);
      expect(f.sqft).toBe(799);
    });
  });

  // -------------------------------------------------------------------------
  // CodeRabbit PR #121 fix 3: validate the baseline floor_plans instead of a
  // bare cast. A malformed shape on page fields must be ignored, not passed
  // through to the row.
  // -------------------------------------------------------------------------
  describe('baseline floor_plans validation (CodeRabbit PR #121 fix 3)', () => {
    it('ignores a malformed floor_plans shape on page fields (baseline floor_plans stays undefined)', async () => {
      const stubGenerate = vi.fn().mockRejectedValue(new Error('provider error'));
      const { synthesizeStep } = await import('../steps/03-synthesize');

      const pages = [
        {
          url: 'https://www.zillow.com/apartments/x/',
          fields: {
            // Malformed: `name` missing (required) and `rent_min` out of the
            // schema's positive/max(50_000) range.
            floor_plans: [{ bedrooms: 1, rent_min: -5 }],
          },
          textExcerpt: '',
        },
      ];
      const ctx = makeCtx(pages);
      (ctx.input as Record<string, unknown>).generate = stubGenerate;

      const result = await synthesizeStep.run(ctx);
      const f = result.output.fields as Record<string, unknown>;
      expect(f.floor_plans).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // AIN-83 live-proof finding: the Trinity Place mission's LLM call failed
  // and the fallback fields never ran applyFloorPlanTopLevel, so top-level
  // bedrooms/sqft stayed null even though the persisted floor_plans carried
  // them (rent happened to already match via buildBaselineFromPages, masking
  // the gap). Every path that produces the step's final `fields` must derive
  // top-level rent/bedrooms/bathrooms/sqft from the cheapest floor plan.
  // -------------------------------------------------------------------------
  describe('cheapest-plan derivation on LLM-failure paths (AIN-83 live-proof fix)', () => {
    const BASELINE_PLANS = [
      { name: 'A11', bedrooms: 2, bathrooms: 1, rent_min: 1819, rent_max: 2118, sqft: 900 },
      { name: 'S1', bedrooms: 0, bathrooms: 1, rent_min: 2200, rent_max: 2200, sqft: 547 },
    ];

    it('derives top-level bedrooms/sqft from the cheapest baseline plan when the LLM call throws', async () => {
      const stubGenerate = vi.fn().mockRejectedValue(new Error('provider error'));
      const { synthesizeStep } = await import('../steps/03-synthesize');

      const pages = [
        { url: 'https://www.zillow.com/apartments/x/', fields: { floor_plans: BASELINE_PLANS }, textExcerpt: '' },
      ];
      const ctx = makeCtx(pages);
      (ctx.input as Record<string, unknown>).generate = stubGenerate;

      const result = await synthesizeStep.run(ctx);
      const f = result.output.fields as Record<string, unknown>;

      expect(f.rent).toBe(1819);
      expect(f.bedrooms).toBe(2);
      expect(f.sqft).toBe(900);
    });

    it('derives top-level bedrooms/sqft from the cheapest baseline plan when the LLM output fails schema parse', async () => {
      // Garbage shape: `rent` is a string, `bedrooms` exceeds the schema max —
      // DeepExtractSchema.safeParse must fail, leaving `fields` at the baseline.
      const stubGenerate = vi.fn().mockResolvedValue({ rent: 'not-a-number', bedrooms: 999 });
      const { synthesizeStep } = await import('../steps/03-synthesize');

      const pages = [
        { url: 'https://www.zillow.com/apartments/x/', fields: { floor_plans: BASELINE_PLANS }, textExcerpt: 'plans' },
      ];
      const ctx = makeCtx(pages);
      (ctx.input as Record<string, unknown>).generate = stubGenerate;

      const result = await synthesizeStep.run(ctx);
      const f = result.output.fields as Record<string, unknown>;

      expect(f.rent).toBe(1819);
      expect(f.bedrooms).toBe(2);
      expect(f.sqft).toBe(900);
    });
  });

  // AIN-75 Task 4: no-op on empty pages (blocked crawl path)
  it('returns empty fields without calling LLM when pages is empty (blocked crawl path)', async () => {
    const mockGenerate = vi.fn().mockResolvedValue(FIXTURE_STANDARD);
    const { synthesizeStep } = await import('../steps/03-synthesize');

    // Empty pages array — simulates crawl:blocked output flowing into synthesize
    const ctx = makeCtx([]);
    (ctx.input as Record<string, unknown>).generate = mockGenerate;

    const result = await synthesizeStep.run(ctx);

    expect(result.output.fields).toEqual({});
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
