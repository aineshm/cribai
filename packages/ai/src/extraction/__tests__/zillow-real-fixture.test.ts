/**
 * Phase 0 verification #4 (CRM v1 release plan): real Zillow HTML, captured
 * from a normal browser session (Playwright, 2026-06-09, Madison WI), run
 * OFFLINE through the merged extraction layers — no network fetch, no LLM.
 *
 * This is the riskiest-assumption check behind the Chrome-extension bet:
 * "extension-captured HTML feeds the existing pipeline". The fixtures are
 * verbatim `document.documentElement.outerHTML` dumps of:
 *
 *   - zillow-madison-single-unit.html — /homedetails/ page for
 *     2306 Kendall Ave, Madison WI 53726 (3bd/1ba, $3,180/mo, 1,733 sqft)
 *   - zillow-madison-building.html — /apartments/ multi-unit page for
 *     EO Madison Yards, 4702 Madison Yards Way, Madison WI (24 units)
 *
 * Empirical findings these tests pin down (see assertions for detail):
 *
 *   1. Both page types ship rich JSON-LD (`RealEstateListing`+`Product` root)
 *      AND `__NEXT_DATA__` — the structured data IS there in browser HTML.
 *   2. The JSON-LD projection only reads the ROOT entity. On real Zillow
 *      pages address/geo/beds live one level deeper (`offers.itemOffered`
 *      on single-unit; `about` ApartmentComplex on buildings), so JSON-LD
 *      yields title+price (single-unit) or title+description (building).
 *   3. Building prices are `AggregateOffer.lowPrice`/`highPrice`, which
 *      `extractPrice` does not read → no price from JSON-LD on buildings.
 *   4. The Zillow DOM extractor's `__NEXT_DATA__` path
 *      (`props.pageProps.componentProps.property`) no longer exists: real
 *      pages keep the data in `componentProps.gdpClientCache` (single-unit,
 *      JSON-string keyed by GraphQL query) or
 *      `componentProps.initialReduxState.gdp.building` (buildings). The
 *      labeled-DOM regex fallback still recovers beds/baths/sqft.
 *   5. Legit browser-captured Zillow HTML contains the substring "captcha"
 *      (Google reCAPTCHA public-key config + an aframe iframe), so
 *      `extractListing`'s BLOCK_SIGNALS heuristic false-positives with
 *      `fetch_blocked`. The planned `extractListingFromHtml(html, url)`
 *      seam must NOT apply substring block heuristics to caller-supplied
 *      HTML.
 *
 * Assertions marked "Phase-0 gap" pin CURRENT behavior on purpose: when the
 * extractor closes the gap (deeper JSON-LD merge, AggregateOffer.lowPrice,
 * gdpClientCache path), the failing assertion is the signal to flip it.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { extractListing, extractFromJsonLd, extractFromOg, extractFromDom } from '../index';
import type { DnsLookupOption } from '../types';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

const SINGLE_UNIT = {
  fixture: 'zillow-madison-single-unit.html',
  url: 'https://www.zillow.com/homedetails/2306-Kendall-Ave-Madison-WI-53726/55402232_zpid/',
};
const BUILDING = {
  fixture: 'zillow-madison-building.html',
  url: 'https://www.zillow.com/apartments/madison-wi/eo-madison-yards/ChRJJw/',
};

/** Mirrors MAX_BODY_BYTES in ../index.ts (not exported). */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * Mirrors the orchestrator's `hasKeyFields` escalation gate (../index.ts):
 * price AND (bedrooms OR address). Used here to assert which page types
 * would reach the LLM rare path — without calling any LLM.
 */
const satisfiesKeyFieldsGate = (f: {
  price?: number;
  bedrooms?: number;
  address?: string;
}): boolean =>
  typeof f.price === 'number' &&
  (typeof f.bedrooms === 'number' || typeof f.address === 'string');

const publicLookup: DnsLookupOption = (async () => [
  { address: '203.0.113.1', family: 4 as const },
]) as DnsLookupOption;

async function loadFixture(name: string): Promise<string> {
  return await readFile(join(FIXTURES_DIR, name), 'utf8');
}

describe('Real Zillow HTML (browser-captured) — offline layers 1-3', () => {
  describe('single-unit /homedetails/ page (2306 Kendall Ave)', () => {
    it('stays under the 5MB ingest cap', async () => {
      const html = await loadFixture(SINGLE_UNIT.fixture);
      expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(MAX_BODY_BYTES);
    });

    it('layer 1 (JSON-LD): extracts title + price from the root AND address/beds/geo from offers.itemOffered', async () => {
      const html = await loadFixture(SINGLE_UNIT.fixture);
      const jsonLd = extractFromJsonLd(html, SINGLE_UNIT.url);

      expect(jsonLd).not.toBeNull();
      expect(jsonLd!.title).toBe('2306 Kendall Ave, Madison, WI 53726');
      expect(jsonLd!.price).toBe(3180);

      // Phase-0 gap CLOSED (AIN-62): the SingleFamilyResidence nested in
      // `offers.itemOffered` now gap-fills address / beds / geo / sqft.
      expect(jsonLd!.address).toBe('2306 Kendall Ave');
      expect(jsonLd!.city).toBe('Madison');
      expect(jsonLd!.state).toBe('WI');
      expect(jsonLd!.zip).toBe('53726');
      expect(jsonLd!.bedrooms).toBe(3);
      expect(jsonLd!.square_feet).toBe(1733);
      expect(jsonLd!.latitude).toBe(43.071693);
    });

    it('layer 2 (OpenGraph): fills description + photo', async () => {
      const html = await loadFixture(SINGLE_UNIT.fixture);
      const og = extractFromOg(html, SINGLE_UNIT.url);

      expect(og.hasAnyOgData).toBe(true);
      expect(og.fields.title).toContain('2306 Kendall Ave');
      expect(og.fields.description).toContain('3 bedrooms');
      expect(og.fields.photos).toHaveLength(1);
      expect(og.fields.photos![0]).toMatch(/^https:\/\/photos\.zillowstatic\.com\//);
      // OG never carries price/address/beds as structured fields on Zillow.
      expect(og.fields.price).toBeUndefined();
      expect(og.fields.address).toBeUndefined();
    });

    it('layer 3 (DOM): labeled-DOM fallback recovers beds/baths/sqft; __NEXT_DATA__ path is dead', async () => {
      const html = await loadFixture(SINGLE_UNIT.fixture);
      const dom = extractFromDom(html, SINGLE_UNIT.url, 'zillow.com');

      // These come from the labeled-DOM regexes ("3 beds" / "1 bath" /
      // "1,733 sqft"), NOT from __NEXT_DATA__: the blob path expects
      // `componentProps.property`, but real pages store the listing in
      // `componentProps.gdpClientCache` (a JSON string keyed by GraphQL
      // query) which fromNextData() does not parse.
      expect(dom.bedrooms).toBe(3);
      expect(dom.bathrooms).toBe(1);
      expect(dom.square_feet).toBe(1733);

      // Phase-0 gap: price + address ARE present in gdpClientCache
      // (price: 3180, streetAddress: "2306 Kendall Ave", lat/lng, 15
      // photos under `responsivePhotos`) but unreachable via the current
      // `property` path. Flip when sites/zillow.ts learns gdpClientCache.
      expect(dom.price).toBeUndefined();
      expect(dom.address).toBeUndefined();
      expect(dom.photos).toBeUndefined();
    });

    it('critical fields present and sane across layers 1-3, no LLM needed', async () => {
      const html = await loadFixture(SINGLE_UNIT.fixture);
      const jsonLd = extractFromJsonLd(html, SINGLE_UNIT.url);
      const dom = extractFromDom(html, SINGLE_UNIT.url, 'zillow.com');

      // Merged view (JSON-LD wins, later layers fill gaps — same semantics
      // as the orchestrator's fillGaps).
      const merged = { ...dom, ...jsonLd };

      // Critical trio: price + bedrooms + address all present and sane
      // (address gap closed by the AIN-62 itemOffered traversal).
      expect(merged.price).toBe(3180);
      expect(merged.price).toBeGreaterThan(200);
      expect(merged.price).toBeLessThan(20_000);
      expect(merged.bedrooms).toBe(3);
      expect(merged.address).toBe('2306 Kendall Ave');

      // The escalation gate is satisfied by layers 1+3 → the LLM rare path
      // is NOT required for single-unit pages.
      expect(satisfiesKeyFieldsGate(merged)).toBe(true);
    });
  });

  describe('multi-unit /apartments/ building page (EO Madison Yards)', () => {
    it('stays under the 5MB ingest cap', async () => {
      const html = await loadFixture(BUILDING.fixture);
      expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(MAX_BODY_BYTES);
    });

    it('layer 1 (JSON-LD): AggregateOffer price range + `about` ApartmentComplex address/geo/amenities', async () => {
      const html = await loadFixture(BUILDING.fixture);
      const jsonLd = extractFromJsonLd(html, BUILDING.url);

      expect(jsonLd).not.toBeNull();
      expect(jsonLd!.title).toBe('EO Madison Yards');
      expect(jsonLd!.description).toContain('Madison');

      // Phase-0 gaps CLOSED (AIN-62):
      //  - `offers[]` are per-floorplan AggregateOffers; the price collapses
      //    to the minimum lowPrice ($1,819-$2,308 range at capture time).
      //  - `about` (ApartmentComplex) gap-fills address / geo / amenities /
      //    the hero photo.
      expect(jsonLd!.price).toBe(1819);
      expect(jsonLd!.address).toBe('4702 Madison Yards Way');
      expect(jsonLd!.city).toBe('Madison');
      expect(jsonLd!.state).toBe('WI');
      expect(jsonLd!.zip).toBe('53705');
      expect(jsonLd!.latitude).toBe(43.074676);
      expect(jsonLd!.amenities).toBeDefined();
      expect(jsonLd!.amenities).toContain('24-Hour Package Room & Amazon Lockers');
      expect(jsonLd!.photos).toEqual([
        'https://photos.zillowstatic.com/fp/92d902147d2346834e859a44e34b6995-p_d.jpg',
      ]);
    });

    it('layer 2 (OpenGraph): fills photo; address only inside the og:title string', async () => {
      const html = await loadFixture(BUILDING.fixture);
      const og = extractFromOg(html, BUILDING.url);

      expect(og.hasAnyOgData).toBe(true);
      expect(og.fields.title).toContain('4702 Madison Yards Way');
      expect(og.fields.photos).toHaveLength(1);
      expect(og.fields.price).toBeUndefined();
      expect(og.fields.address).toBeUndefined();
    });

    it('layer 3 (DOM): key fields satisfied without it — no LLM escalation for building pages', async () => {
      const html = await loadFixture(BUILDING.fixture);
      const jsonLd = extractFromJsonLd(html, BUILDING.url);
      const dom = extractFromDom(html, BUILDING.url, 'zillow.com');

      // The labeled-DOM regexes catch a floorplan's "N beds" / "NNN sqft"
      // text (first match wins — not necessarily the cheapest unit).
      expect(typeof dom.bedrooms).toBe('number');
      expect(typeof dom.square_feet).toBe('number');

      // Phase-0 gap CLOSED (AIN-62): with JSON-LD now carrying the
      // AggregateOffer price + `about` address, the key-fields gate passes
      // at Pass 1 — building pages no longer escalate to the LLM rare path.
      const merged = { ...dom, ...jsonLd };
      expect(satisfiesKeyFieldsGate(merged)).toBe(true);
    });
  });

  describe('extractListing() end-to-end over captured HTML', () => {
    it('false-positives fetch_blocked: legit Zillow HTML contains the "captcha" block signal', async () => {
      // Real Zillow pages embed GOOGLE_CAPTCHA_PUBLIC_KEY config and a
      // recaptcha aframe iframe — the BLOCK_SIGNALS substring heuristic
      // ('captcha') trips on a page that was served fine. This pins the
      // behavior the `extractListingFromHtml(html, url)` refactor must NOT
      // inherit for caller-supplied (extension-captured) HTML. If this
      // starts failing, the heuristic changed — re-verify the refactor plan.
      const html = await loadFixture(SINGLE_UNIT.fixture);
      const fetcher = (async () => new Response(html, { status: 200 })) as unknown as typeof fetch;

      await expect(
        extractListing(SINGLE_UNIT.url, { fetcher, lookup: publicLookup }),
      ).rejects.toMatchObject({ name: 'ExtractionError', code: 'fetch_blocked' });
    });
  });
});
