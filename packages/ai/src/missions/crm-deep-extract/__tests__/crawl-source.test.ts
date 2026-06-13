/**
 * Tests for crawl-source step (AIN-71 step 4.2).
 */

import { describe, it, expect, vi } from 'vitest';
import type { StepContext } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
  return {
    missionId: 'mission-1',
    userId: 'user-1',
    campusId: 'uw-madison',
    campusSlug: 'uw-madison',
    input: { listingId: 'listing-1', sourceUrl: 'https://x01oncampus.com/units/2br' },
    state: {},
    supabase: makeMockSupabase({ found: true }) as unknown as StepContext['supabase'],
    ...overrides,
  };
}

function makeMockSupabase(opts: { found: boolean; archived?: boolean; wrongUser?: boolean }) {
  const row =
    opts.found && !opts.archived && !opts.wrongUser
      ? {
          id: 'listing-1',
          user_id: 'user-1',
          title: 'X01 on Campus',
          address: '640 W Dayton St, Madison, WI',
          rent: 1450,
          extraction_confidence: 0.3,
          status: 'active',
        }
      : opts.archived
        ? { id: 'listing-1', user_id: 'user-1', title: 'X01', address: null, rent: null, extraction_confidence: 0.3, status: 'archived' }
        : null;

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
          })),
        })),
      })),
    })),
  };
}

const FLOOR_PLAN_HTML = `
<html><body>
<a href="/floor-plans">Floor Plans</a>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Apartment","name":"X01 on Campus","address":{"@type":"PostalAddress","streetAddress":"640 W Dayton St"},"offers":{"@type":"Offer","price":"1450"}}
</script>
</body></html>`;

const NON_HOUSING_HTML = `
<html><body>
<h1>Join Our Team!</h1>
<p>We are hiring a leasing consultant. Apply today.</p>
</body></html>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('crawl_source step', () => {
  it('happy path: fetches landing page, extracts fields, returns pages output', async () => {
    const stubFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }), text: () => Promise.resolve(FLOOR_PLAN_HTML), body: null });
    const { crawlSourceStep } = await import('../steps/01-crawl-source');
    const ctx = makeCtx();
    (ctx.input as Record<string, unknown>).fetchHtml = stubFetch;

    const result = await crawlSourceStep.run(ctx);

    expect(result.output.skipped).toBeUndefined();
    expect(Array.isArray(result.output.pages)).toBe(true);
    const pages = result.output.pages as Array<{ url: string }>;
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.at(0)?.url).toBe('https://x01oncampus.com/units/2br');
  });

  it('returns skipped:row_gone when listing is missing', async () => {
    const { crawlSourceStep } = await import('../steps/01-crawl-source');
    const ctx = makeCtx({
      supabase: makeMockSupabase({ found: false }) as unknown as StepContext['supabase'],
    });
    const result = await crawlSourceStep.run(ctx);
    expect(result.output.skipped).toBe('row_gone');
    expect(result.done).toBe(true);
  });

  it('returns skipped:row_gone when listing belongs to a different user', async () => {
    const ctx = makeCtx({
      supabase: makeMockSupabase({ found: true, wrongUser: true }) as unknown as StepContext['supabase'],
    });
    const { crawlSourceStep } = await import('../steps/01-crawl-source');
    const result = await crawlSourceStep.run(ctx);
    expect(result.output.skipped).toBe('row_gone');
    expect(result.done).toBe(true);
  });

  it('skips a subpage that fails isHousingRelated and records in discarded', async () => {
    const { crawlSourceStep } = await import('../steps/01-crawl-source');

    // Landing page has floor-plan link that leads to a jobs page
    const landingHtml = `<html><body>
      <a href="/apply">Apply</a>
    </body></html>`;

    let callCount = 0;
    const stubFetch = vi.fn().mockImplementation(() => {
      const html = callCount++ === 0 ? landingHtml : NON_HOUSING_HTML;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve(html),
        body: null,
      });
    });

    const ctx = makeCtx();
    (ctx.input as Record<string, unknown>).fetchHtml = stubFetch;

    const result = await crawlSourceStep.run(ctx);

    const discarded = result.output.discarded as Array<{ url: string; reason: string }>;
    const jobsDiscarded = discarded?.find((d) => d.reason === 'not_housing');
    expect(jobsDiscarded).toBeDefined();
  });

  // FIX 7: invalid sourceUrl in JSONB → early exit
  it('returns skipped:invalid_input with done:true when sourceUrl is not an absolute http(s) URL', async () => {
    const { crawlSourceStep } = await import('../steps/01-crawl-source');
    const ctx = makeCtx({
      input: { listingId: 'listing-1', sourceUrl: 'javascript:alert(1)' },
    } as Partial<StepContext>);

    const result = await crawlSourceStep.run(ctx);

    expect(result.output.skipped).toBe('invalid_input');
    expect(result.done).toBe(true);
  });

  it('returns skipped:invalid_input with done:true when sourceUrl is relative', async () => {
    const { crawlSourceStep } = await import('../steps/01-crawl-source');
    const ctx = makeCtx({
      input: { listingId: 'listing-1', sourceUrl: '/relative/path' },
    } as Partial<StepContext>);

    const result = await crawlSourceStep.run(ctx);

    expect(result.output.skipped).toBe('invalid_input');
    expect(result.done).toBe(true);
  });

  it('never stores raw HTML in output (JSONB-safe)', async () => {
    const { crawlSourceStep } = await import('../steps/01-crawl-source');
    const stubFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: () => Promise.resolve(FLOOR_PLAN_HTML),
      body: null,
    });
    const ctx = makeCtx();
    (ctx.input as Record<string, unknown>).fetchHtml = stubFetch;

    const result = await crawlSourceStep.run(ctx);

    const pages = result.output.pages as Array<Record<string, unknown>>;
    for (const page of pages) {
      expect(page.html).toBeUndefined();
      // textExcerpt is allowed but must be capped at 20k
      if (page.textExcerpt) {
        expect((page.textExcerpt as string).length).toBeLessThanOrEqual(20_000);
      }
    }
  });
});
