/**
 * URL-path behavior lock (AIN-62).
 *
 * Snapshots the COMPLETE `extractListing(url)` output (or thrown error) for
 * every offline fixture, with the LLM rare path deterministically disabled.
 * Captured BEFORE the `extractFromHtml` pipeline refactor so the refactor can
 * be proven behavior-identical on the existing URL/fetch entry point.
 *
 * Snapshot updates in later commits are intentional, reviewed behavior
 * changes (e.g. the AIN-62 building-page extraction upgrades) — never a
 * silent side effect of restructuring.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { extractListing } from '../index';
import type { DnsLookupOption } from '../types';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

/** Always-public DNS answer so the SSRF guard passes for fixture hosts. */
const publicLookup: DnsLookupOption = (async () => [
  { address: '203.0.113.1', family: 4 as const },
]) as DnsLookupOption;

/**
 * Every offline fixture, paired with a URL on the matching publisher domain
 * (the Layer-3 DOM dispatch is keyed by source domain, so the URL must agree
 * with the fixture's site). The two multi-megabyte real-browser captures are
 * exercised by zillow-real-fixture.test.ts and excluded here to keep snapshot
 * churn reviewable.
 */
const CASES: ReadonlyArray<{ fixture: string; url: string }> = [
  { fixture: 'zillow.html', url: 'https://www.zillow.com/homedetails/123_zpid/' },
  { fixture: 'zillow-og.html', url: 'https://www.zillow.com/homedetails/og_zpid/' },
  { fixture: 'zillow-sparse.html', url: 'https://www.zillow.com/homedetails/sparse_zpid/' },
  { fixture: 'zillow-nextdata.html', url: 'https://www.zillow.com/homedetails/next_zpid/' },
  { fixture: 'zillow-llm.html', url: 'https://www.zillow.com/homedetails/llm_zpid/' },
  { fixture: 'apartments-com.html', url: 'https://www.apartments.com/test-listing/' },
  { fixture: 'apartments-com-og.html', url: 'https://www.apartments.com/og-listing/' },
  { fixture: 'apartments-com-dom.html', url: 'https://www.apartments.com/dom-listing/' },
  { fixture: 'apartments-com-sparse.html', url: 'https://www.apartments.com/sparse-listing/' },
  { fixture: 'apartments-com-llm.html', url: 'https://www.apartments.com/llm-listing/' },
  { fixture: 'realtor.html', url: 'https://www.realtor.com/rentals/details/test' },
  { fixture: 'realtor-og.html', url: 'https://www.realtor.com/rentals/details/og' },
  { fixture: 'realtor-nextdata.html', url: 'https://www.realtor.com/rentals/details/next' },
  { fixture: 'realtor-sparse.html', url: 'https://www.realtor.com/rentals/details/sparse' },
  { fixture: 'realtor-llm.html', url: 'https://www.realtor.com/rentals/details/llm' },
  { fixture: 'trulia-jsonld.html', url: 'https://www.trulia.com/p/test' },
  { fixture: 'trulia-og.html', url: 'https://www.trulia.com/p/og' },
  { fixture: 'trulia-nextdata.html', url: 'https://www.trulia.com/p/next' },
  { fixture: 'trulia-sparse.html', url: 'https://www.trulia.com/p/sparse' },
  { fixture: 'trulia-llm.html', url: 'https://www.trulia.com/p/llm' },
  { fixture: 'facebook-jsonld.html', url: 'https://www.facebook.com/marketplace/item/1/' },
  { fixture: 'facebook-og.html', url: 'https://www.facebook.com/marketplace/item/2/' },
  { fixture: 'facebook-nextdata.html', url: 'https://www.facebook.com/marketplace/item/3/' },
  { fixture: 'facebook-blocked.html', url: 'https://www.facebook.com/marketplace/item/4/' },
  { fixture: 'facebook-llm.html', url: 'https://www.facebook.com/marketplace/item/5/' },
  { fixture: 'og-only.html', url: 'https://listings.example.com/unit-12' },
  { fixture: 'malformed-jsonld.html', url: 'https://listings.example.com/unit-13' },
  { fixture: 'no-structured-data.html', url: 'https://listings.example.com/unit-14' },
];

describe('extractListing URL-path regression lock (offline fixtures)', () => {
  beforeEach(() => {
    // Deterministically disable the LLM rare path: no injected extractor AND
    // no provider credentials → `llmPathAvailable` is false on every machine.
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  for (const { fixture, url } of CASES) {
    it(`pins extractListing output for ${fixture}`, async () => {
      const html = await readFile(join(FIXTURES_DIR, fixture), 'utf8');
      const fetcher = (async () =>
        new Response(html, { status: 200 })) as unknown as typeof fetch;

      let outcome: unknown;
      try {
        outcome = await extractListing(url, { fetcher, lookup: publicLookup });
      } catch (err) {
        const e = err as Error & { code?: string };
        outcome = { thrown: e.name, code: e.code, message: e.message };
      }
      expect(outcome).toMatchSnapshot();
    });
  }
});
