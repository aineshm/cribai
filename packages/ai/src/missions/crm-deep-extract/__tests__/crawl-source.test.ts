/**
 * Tests for crawl-source step (AIN-71 step 4.2; capture storage per AIN-84).
 */

import { describe, it, expect, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
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

const CAPTURE_STORAGE_PATH = 'user-1/listing-1.html.gz';

interface MockSupabase {
  from: ReturnType<typeof vi.fn>;
  /**
   * Spy on the `.update()` that marks the capture row consumed (AIN-84:
   * consume MARKS consumed_at; nothing is deleted).
   */
  captureConsumeSpy: ReturnType<typeof vi.fn>;
  /** Spy on `storage.from('listing-captures').download(path)`. */
  storageDownloadSpy: ReturnType<typeof vi.fn>;
}

function makeMockSupabase(opts: {
  found: boolean;
  archived?: boolean;
  wrongUser?: boolean;
  /**
   * HTML the storage object gunzips to; null/undefined means no capture
   * pointer row exists at all.
   */
  captureHtml?: string | null;
  /** When true, the pointer row exists but the storage download fails (AIN-84). */
  downloadFails?: boolean;
  /**
   * Overrides the pointer row's storage_path (AIN-84 ownership check: a path
   * outside the owner's folder must be treated as a capture-miss).
   */
  captureStoragePath?: string;
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

  const hasPointerRow = opts.captureHtml != null || opts.downloadFails === true;

  // Spy exposed so tests can assert the capture row was marked consumed after
  // use. The update chains .eq('listing_id', …).eq('user_id', …) — AIN-78
  // defense-in-depth preserved; captureConsumeSpy is the update() itself so
  // tests can assert the consumed_at payload.
  const captureConsumeSpy = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  }));

  // AIN-84: the capture object lives in the private listing-captures bucket,
  // gzipped. download() returns a Blob-like with arrayBuffer().
  const storageDownloadSpy = vi.fn(async (_path: string) => {
    if (opts.downloadFails || opts.captureHtml == null) {
      return { data: null, error: { message: 'Object not found' } };
    }
    const gz = gzipSync(Buffer.from(opts.captureHtml, 'utf8'));
    return {
      data: { arrayBuffer: async () => gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) },
      error: null,
    };
  });

  return {
    from: vi.fn((table: string) => {
      // ── crm_listing_captures: pointer select or consumed-mark update ──────
      if (table === 'crm_listing_captures') {
        const captureData = hasPointerRow
          ? { storage_path: opts.captureStoragePath ?? CAPTURE_STORAGE_PATH }
          : null;
        return {
          // select chains .eq('listing_id').eq('user_id').maybeSingle()
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: captureData, error: null }),
              })),
            })),
          })),
          update: captureConsumeSpy,
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
    storage: {
      from: vi.fn(() => ({ download: storageDownloadSpy })),
    },
    captureConsumeSpy,
    storageDownloadSpy,
  } as MockSupabase & { storage: unknown };
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

  // AIN-84: reuse extension-captured HTML (gzipped storage object) in crawl_source
  it('uses extension capture HTML when present: skips landing fetch, populates pages[0], is not blocked, marks consumed', async () => {
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

    // pages[0] must be the landing page from the capture — the gunzipped
    // storage object content really reached extraction/pruning.
    const pages = result.output.pages as Array<{
      url: string;
      textExcerpt: string;
      fields: Record<string, unknown>;
    }>;
    expect(Array.isArray(pages)).toBe(true);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.at(0)?.url).toBe('https://x01oncampus.com/units/2br');
    // textExcerpt populated from the capture HTML
    expect(pages.at(0)?.textExcerpt.length).toBeGreaterThan(0);
    // Content from the gunzipped capture (JSON-LD name) made it into fields.
    expect((pages.at(0)?.fields as { title?: string } | undefined)?.title).toBe('X01 on Campus');

    // The storage object was downloaded at the pointer's path
    expect(mockSupa.storageDownloadSpy).toHaveBeenCalledWith(CAPTURE_STORAGE_PATH);

    // Fetch must NOT have been called with the landing page URL
    const landingFetchCalls = stubFetch.mock.calls.filter(
      (call: unknown[]) => String(call[0]) === 'https://x01oncampus.com/units/2br',
    );
    expect(landingFetchCalls.length).toBe(0);

    // AIN-84: the capture is MARKED consumed (consumed_at set), NOT deleted —
    // it stays readable for audit/eval and for a mid-subpage-crawl retry.
    expect(mockSupa.captureConsumeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ consumed_at: expect.any(String) }),
    );
  });

  it('falls back to fetch path when no capture row exists (AIN-78 fallback, unchanged)', async () => {
    const { crawlSourceStep } = await import('../steps/01-crawl-source');

    // No captureHtml → mock returns null pointer row from crm_listing_captures
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

    // No consumed-mark issued (nothing was consumed)
    expect(mockSupa.captureConsumeSpy).not.toHaveBeenCalled();
  });

  // AIN-84: pointer row exists but the storage download fails → capture-miss
  it('falls back to fetch path when the storage download fails (AIN-84 capture-miss)', async () => {
    const { crawlSourceStep } = await import('../steps/01-crawl-source');

    const mockSupa = makeMockSupabase({ found: true, downloadFails: true });
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

    // Degrades exactly like a capture-miss: the fetch fallback ran.
    expect(result.output.skipped).toBeUndefined();
    expect(result.output.crawl).toBeUndefined();
    const pages = result.output.pages as Array<{ url: string }>;
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.at(0)?.url).toBe('https://x01oncampus.com/units/2br');

    // The download was attempted at the pointer's path…
    expect(mockSupa.storageDownloadSpy).toHaveBeenCalledWith(CAPTURE_STORAGE_PATH);
    // …the landing page was fetched as fallback…
    const landingFetchCalls = stubFetch.mock.calls.filter(
      (call: unknown[]) => String(call[0]) === 'https://x01oncampus.com/units/2br',
    );
    expect(landingFetchCalls.length).toBe(1);
    // …and nothing was marked consumed (nothing was actually used).
    expect(mockSupa.captureConsumeSpy).not.toHaveBeenCalled();
  });

  it('treats a storage_path outside the owner folder as a capture-miss without downloading (AIN-84 ownership check)', async () => {
    const { crawlSourceStep } = await import('../steps/01-crawl-source');

    // A malicious owner can UPDATE their own pointer row (RLS allows it) to
    // aim at ANOTHER user's object. The service-role download would succeed —
    // the step must refuse the path before downloading.
    const mockSupa = makeMockSupabase({
      found: true,
      captureHtml: FLOOR_PLAN_HTML,
      captureStoragePath: 'other-user/listing-1.html.gz',
    });
    const stubFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: () => Promise.resolve(FLOOR_PLAN_HTML),
      body: null,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const ctx = makeCtx({
      supabase: mockSupa as unknown as StepContext['supabase'],
    });
    (ctx.input as Record<string, unknown>).fetchHtml = stubFetch;

    const result = await crawlSourceStep.run(ctx);

    // The foreign object was NEVER downloaded…
    expect(mockSupa.storageDownloadSpy).not.toHaveBeenCalled();
    // …the fetch fallback ran instead…
    expect(result.output.skipped).toBeUndefined();
    const landingFetchCalls = stubFetch.mock.calls.filter(
      (call: unknown[]) => String(call[0]) === 'https://x01oncampus.com/units/2br',
    );
    expect(landingFetchCalls.length).toBe(1);
    // …nothing was marked consumed, and the refusal was logged.
    expect(mockSupa.captureConsumeSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('outside owner folder'),
      expect.any(String),
    );
    warnSpy.mockRestore();
  });
});
