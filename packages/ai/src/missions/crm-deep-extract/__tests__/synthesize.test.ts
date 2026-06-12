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

  it('returns empty fields without throwing when LLM fails', async () => {
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
});
