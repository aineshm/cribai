/**
 * `extractListingFromHtml(html, sourceUrl)` — the Chrome-extension ingest
 * seam (AIN-62, CRM v1 WS3a).
 *
 * The extension captures `document.documentElement.outerHTML` from the user's
 * real browser session and POSTs it to the ingest route, which calls this
 * entry point. Contract under test:
 *
 *   1. Runs the SAME post-fetch pipeline as `extractListing` (JSON-LD → OG
 *      merge → numeric scrub → DOM escalation → LLM rare path → normalize →
 *      method/confidence) — proven by parity against the URL entry point.
 *   2. Does NOT apply the `BLOCK_SIGNALS` substring heuristic. Phase-0
 *      finding: legit browser-captured Zillow HTML embeds the substring
 *      "captcha" (reCAPTCHA config), so block detection on caller-supplied
 *      HTML is a guaranteed false positive. HTML from the user's browser is
 *      trusted-as-data.
 *   3. Validates inputs at the boundary: html must be a non-empty string
 *      under the 5MB cap; sourceUrl must be a valid http(s) URL.
 *   4. `source_domain` derives from the supplied sourceUrl.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { extractListing, extractListingFromHtml } from '../index';
import type { DnsLookupOption, LlmExtractor } from '../types';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

const publicLookup: DnsLookupOption = (async () => [
  { address: '203.0.113.1', family: 4 as const },
]) as DnsLookupOption;

async function loadFixture(name: string): Promise<string> {
  return await readFile(join(FIXTURES_DIR, name), 'utf8');
}

const ZILLOW_FIXTURE_URL =
  'https://www.zillow.com/homedetails/123-W-Gorham-St-APT-3-Madison-WI-53703/12345_zpid/';

const REAL_SINGLE_UNIT_URL =
  'https://www.zillow.com/homedetails/2306-Kendall-Ave-Madison-WI-53726/55402232_zpid/';

describe('extractListingFromHtml', () => {
  beforeEach(() => {
    // Deterministically disable the credentialed LLM rare path.
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('input validation', () => {
    it('rejects an empty html string with parse_failed', async () => {
      await expect(
        extractListingFromHtml('', ZILLOW_FIXTURE_URL),
      ).rejects.toMatchObject({ name: 'ExtractionError', code: 'parse_failed' });
    });

    it('rejects whitespace-only html with parse_failed', async () => {
      await expect(
        extractListingFromHtml('   \n\t  ', ZILLOW_FIXTURE_URL),
      ).rejects.toMatchObject({ name: 'ExtractionError', code: 'parse_failed' });
    });

    it('rejects a non-string html value with parse_failed', async () => {
      await expect(
        extractListingFromHtml(null as unknown as string, ZILLOW_FIXTURE_URL),
      ).rejects.toMatchObject({ name: 'ExtractionError', code: 'parse_failed' });
    });

    it('rejects html over the 5MB byte cap with parse_failed', async () => {
      // 5MB + 1 of multi-byte text would also trip it; plain ASCII is enough.
      const oversized = 'x'.repeat(5 * 1024 * 1024 + 1);
      await expect(
        extractListingFromHtml(oversized, ZILLOW_FIXTURE_URL),
      ).rejects.toMatchObject({ name: 'ExtractionError', code: 'parse_failed' });
    });

    it('rejects an unparseable sourceUrl with parse_failed', async () => {
      await expect(
        extractListingFromHtml('<html></html>', 'not a url'),
      ).rejects.toMatchObject({ name: 'ExtractionError', code: 'parse_failed' });
    });

    it('rejects a non-http(s) sourceUrl scheme with parse_failed', async () => {
      await expect(
        extractListingFromHtml('<html></html>', 'javascript:alert(1)'),
      ).rejects.toMatchObject({ name: 'ExtractionError', code: 'parse_failed' });
    });

    it('throws no_listing_data when no layer produces fields', async () => {
      await expect(
        extractListingFromHtml(
          '<html><head><title>nothing</title></head><body></body></html>',
          'https://listings.example.com/empty',
        ),
      ).rejects.toMatchObject({ name: 'ExtractionError', code: 'no_listing_data' });
    });
  });

  describe('BLOCK_SIGNALS must NOT apply to caller-supplied HTML (Phase-0 finding 1)', () => {
    it('extracts from HTML that embeds "captcha" inside a script', async () => {
      const html = `<!doctype html><html><head>
        <script>window.GOOGLE_CAPTCHA_PUBLIC_KEY = "6Lcabc";</script>
        <script type="application/ld+json">{
          "@type": "Apartment",
          "name": "Captcha-string false positive",
          "address": {"@type": "PostalAddress", "streetAddress": "1 Test St"},
          "offers": {"@type": "Offer", "price": 1200}
        }</script>
      </head><body></body></html>`;

      const result = await extractListingFromHtml(html, 'https://www.zillow.com/homedetails/x_zpid/');
      expect(result.price).toBe(1200);
      expect(result.address).toBe('1 Test St');
    });

    it('extracts the real browser-captured Zillow page that extractListing rejects as fetch_blocked', async () => {
      const html = await loadFixture('zillow-madison-single-unit.html');

      // Control: the fetch path still applies BLOCK_SIGNALS and rejects.
      const fetcher = (async () => new Response(html, { status: 200 })) as unknown as typeof fetch;
      await expect(
        extractListing(REAL_SINGLE_UNIT_URL, { fetcher, lookup: publicLookup }),
      ).rejects.toMatchObject({ code: 'fetch_blocked' });

      // The HTML seam trusts the caller's HTML as data and extracts.
      const result = await extractListingFromHtml(html, REAL_SINGLE_UNIT_URL);
      expect(result.source_url).toBe(REAL_SINGLE_UNIT_URL);
      expect(result.source_domain).toBe('zillow.com');
      expect(result.price).toBe(3180);
      expect(result.bedrooms).toBe(3);
      expect(result.title).toContain('2306 Kendall Ave');
    });
  });

  describe('pipeline parity with extractListing', () => {
    it('produces an identical result to the URL entry point for the same HTML', async () => {
      const html = await loadFixture('zillow.html');
      const fetcher = (async () => new Response(html, { status: 200 })) as unknown as typeof fetch;

      const viaUrl = await extractListing(ZILLOW_FIXTURE_URL, { fetcher, lookup: publicLookup });
      const viaHtml = await extractListingFromHtml(html, ZILLOW_FIXTURE_URL);

      expect(viaHtml).toEqual(viaUrl);
    });

    it('runs the DOM escalation layer keyed off the sourceUrl domain', async () => {
      // zillow-nextdata.html has no JSON-LD price — the Zillow site extractor
      // must be dispatched from the supplied sourceUrl for fields to appear.
      const html = await loadFixture('zillow-nextdata.html');
      const result = await extractListingFromHtml(
        html,
        'https://www.zillow.com/homedetails/next_zpid/',
      );
      expect(result.extraction_method).toContain('dom');
      expect(result.price).toBeGreaterThan(0);
    });

    it('honors an injected llmExtractor for the rare path', async () => {
      const html = await loadFixture('zillow-llm.html');
      const llmExtractor: LlmExtractor = async () => ({
        price: 999,
        address: '99 Model St',
      });
      const result = await extractListingFromHtml(
        html,
        'https://www.zillow.com/homedetails/llm_zpid/',
        { llmExtractor },
      );
      expect(result.extraction_method).toContain('llm');
      expect(result.price).toBe(999);
      expect(result.address).toBe('99 Model St');
    });
  });

  describe('source_domain derivation from sourceUrl', () => {
    it('strips common subdomain prefixes', async () => {
      const html = await loadFixture('og-only.html');
      const result = await extractListingFromHtml(html, 'https://www.example.com/unit-12');
      expect(result.source_domain).toBe('example.com');
      expect(result.source_url).toBe('https://www.example.com/unit-12');
    });
  });
});
