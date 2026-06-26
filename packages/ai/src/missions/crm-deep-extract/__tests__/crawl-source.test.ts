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

interface MockSupabase {
  from: ReturnType<typeof vi.fn>;
  /** Spy on the `.eq()` that fires when the capture row is deleted. */
  captureDeleteSpy: ReturnType<typeof vi.fn>;
}

function makeMockSupabase(opts: {
  found: boolean;
  archived?: boolean;
  wrongUser?: boolean;
  /** HTML to return from crm_listing_captures; null/undefined means no capture. */
  captureHtml?: string | null;
}): MockSupabase {
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

  // Spy exposed so tests can assert the capture row was deleted after consumption.
  // The delete chains two .eq() calls (listing_id, then user_id — AIN-78
  // defense-in-depth); captureDeleteSpy is the first .eq, returning a chainable
  // second .eq that resolves the query.
  const captureDeleteSpy = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  }));

  return {
    from: vi.fn((table: string) => {
      // ── crm_listing_captures: select or delete ────────────────────────────
      if (table === 'crm_listing_captures') {
        const captureData = opts.captureHtml != null ? { html: opts.captureHtml } : null;
        return {
          // select chains .eq('listing_id').eq('user_id').maybeSingle()
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: captureData, error: null }),
              })),
            })),
          })),
          delete: vi.fn(() => ({ eq: captureDeleteSpy })),
        };
      }
      // ── crm_listings: ownership + status check ────────────────────────────
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
            })),
          })),
        })),
      };
    }),
    captureDeleteSpy,
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

  // AIN-75 Task 3: blocked/uncrawlable source resilience
  it('returns crawl:blocked with empty pages when landing fetch throws (Zillow-style block)', async () => {
    const { crawlSourceStep } = await import('../steps/01-crawl-source');

    const stubFetch = vi.fn().mockRejectedValue(new Error('403 Forbidden — bot detected'));
    const ctx = makeCtx();
    (ctx.input as Record<string, unknown>).fetchHtml = stubFetch;

    const result = await crawlSourceStep.run(ctx);

    expect(result.output.crawl).toBe('blocked');
    expect(result.output.pages).toEqual([]);
    expect(result.output.discarded).toEqual([]);
    // Must not be done:true — pipeline continues (places_lookup + reanalyze still run)
    expect(result.done).toBeUndefined();
  });

  it('returns crawl:blocked when landing fetch rejects with ExtractionError', async () => {
    const { crawlSourceStep } = await import('../steps/01-crawl-source');
    const { ExtractionError } = await import('../../../extraction');

    const stubFetch = vi.fn().mockRejectedValue(
      new ExtractionError('fetch_blocked', 'bot block', 'https://x01oncampus.com/units/2br'),
    );
    const ctx = makeCtx();
    (ctx.input as Record<string, unknown>).fetchHtml = stubFetch;

    const result = await crawlSourceStep.run(ctx);

    expect(result.output.crawl).toBe('blocked');
    expect(result.output.pages).toEqual([]);
    expect(result.output.discarded).toEqual([]);
  });

  // AIN-78: reuse extension-captured HTML in crawl_source
  it('uses extension capture HTML when present: skips landing fetch, populates pages[0], is not blocked, deletes capture', async () => {
    const { crawlSourceStep } = await import('../steps/01-crawl-source');

    const captureHtml = FLOOR_PLAN_HTML;
    const mockSupa = makeMockSupabase({ found: true, captureHtml });
    const stubFetch = vi.fn(); // must NOT be called for the landing page

    const ctx = makeCtx({
      supabase: mockSupa as unknown as StepContext['supabase'],
    });
    // Inject stubFetch so subpage fetches (if any) use it instead of the real fetchPublicHtml.
    // For FLOOR_PLAN_HTML, subpage discovery yields /floor-plans; stubFetch handles it.
    stubFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: () => Promise.resolve(FLOOR_PLAN_HTML),
      body: null,
    });
    (ctx.input as Record<string, unknown>).fetchHtml = stubFetch;

    const result = await crawlSourceStep.run(ctx);

    // Must not be blocked
    expect(result.output.crawl).toBeUndefined();

    // pages[0] must be the landing page from the capture
    const pages = result.output.pages as Array<{ url: string; textExcerpt: string }>;
    expect(Array.isArray(pages)).toBe(true);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.at(0)?.url).toBe('https://x01oncampus.com/units/2br');
    // textExcerpt populated from the capture HTML
    expect(pages.at(0)?.textExcerpt.length).toBeGreaterThan(0);

    // Fetch must NOT have been called with the landing page URL
    const landingFetchCalls = stubFetch.mock.calls.filter(
      (call: unknown[]) => String(call[0]) === 'https://x01oncampus.com/units/2br',
    );
    expect(landingFetchCalls.length).toBe(0);

    // Capture must have been deleted after use (best-effort self-consume)
    expect(mockSupa.captureDeleteSpy).toHaveBeenCalledWith('listing_id', 'listing-1');
  });

  it('falls back to fetch path when no capture row exists (AIN-78 fallback)', async () => {
    const { crawlSourceStep } = await import('../steps/01-crawl-source');

    // No captureHtml → mock returns null from crm_listing_captures
    const mockSupa = makeMockSupabase({ found: true, captureHtml: null });
    const stubFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: () => Promise.resolve(FLOOR_PLAN_HTML),
      body: null,
    });

    const ctx = makeCtx({
      supabase: mockSupa as unknown as StepContext['supabase'],
    });
    (ctx.input as Record<string, unknown>).fetchHtml = stubFetch;

    const result = await crawlSourceStep.run(ctx);

    // Should succeed via the fetch path
    expect(result.output.skipped).toBeUndefined();
    expect(result.output.crawl).toBeUndefined();
    const pages = result.output.pages as Array<{ url: string }>;
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.at(0)?.url).toBe('https://x01oncampus.com/units/2br');

    // Fetch must have been called for the landing page (fallback path)
    const landingFetchCalls = stubFetch.mock.calls.filter(
      (call: unknown[]) => String(call[0]) === 'https://x01oncampus.com/units/2br',
    );
    expect(landingFetchCalls.length).toBe(1);

    // No capture delete issued (nothing to delete)
    expect(mockSupa.captureDeleteSpy).not.toHaveBeenCalled();
  });
});
