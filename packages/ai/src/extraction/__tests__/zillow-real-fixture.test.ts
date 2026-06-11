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
 * Empirical findings these tests pinned at Phase 0, and their AIN-62 status:
 *
 *   1. Both page types ship rich JSON-LD (`RealEstateListing`+`Product` root)
 *      AND `__NEXT_DATA__` — the structured data IS there in browser HTML.
 *   2. CLOSED — the JSON-LD projection now gap-fills from same-listing
 *      entities nested under `about` / `offers.itemOffered` (address / geo /
 *      beds / sqft / amenities). See json-ld-deep.test.ts.
 *   3. CLOSED — `extractPrice` collapses `AggregateOffer.lowPrice`/`highPrice`
 *      ranges to the minimum low bound when no concrete price exists.
 *   4. CLOSED — sites/zillow.ts reads both real `__NEXT_DATA__` shapes:
 *      `componentProps.gdpClientCache` (single-unit, JSON-string keyed by
 *      GraphQL query) and `componentProps.initialReduxState.gdp.building`
 *      (buildings). The legacy `componentProps.property` path is retained.
 *      See zillow-dom-paths.test.ts.
 *   5. PERMANENT — legit browser-captured Zillow HTML contains the substring
 *      "captcha" (Google reCAPTCHA public-key config + an aframe iframe), so
 *      `extractListing`'s BLOCK_SIGNALS heuristic false-positives with
 *      `fetch_blocked` on fetched copies of these pages. The
 *      `extractListingFromHtml(html, url)` seam therefore applies NO
 *      substring block heuristics to caller-supplied HTML — pinned below
 *      and in extract-listing-from-html.test.ts.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  extractListing,
  extractListingFromHtml,
  extractFromJsonLd,
  extractFromOg,
  extractFromDom,
  MAX_SEAM_HTML_BYTES,
} from '../index';
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
    it('stays under the seam ingest cap (MAX_SEAM_HTML_BYTES)', async () => {
      const html = await loadFixture(SINGLE_UNIT.fixture);
      expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(MAX_SEAM_HTML_BYTES);
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

    it('layer 3 (DOM): gdpClientCache provides price/address/photos alongside beds/baths/sqft', async () => {
      const html = await loadFixture(SINGLE_UNIT.fixture);
      const dom = extractFromDom(html, SINGLE_UNIT.url, 'zillow.com');

      expect(dom.bedrooms).toBe(3);
      expect(dom.bathrooms).toBe(1);
      expect(dom.square_feet).toBe(1733);

      // Phase-0 gap CLOSED (AIN-62): sites/zillow.ts now parses
      // `componentProps.gdpClientCache` (a JSON string keyed by GraphQL
      // query) — price, address, geo, and the 15 `responsivePhotos` are
      // all reachable.
      expect(dom.price).toBe(3180);
      expect(dom.address).toBe('2306 Kendall Ave');
      expect(dom.city).toBe('Madison');
      expect(dom.latitude).toBe(43.071693);
      expect(dom.photos).toHaveLength(15);
      expect(dom.photos![0]).toMatch(/^https:\/\/photos\.zillowstatic\.com\//);
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
    it('stays under the seam ingest cap (MAX_SEAM_HTML_BYTES)', async () => {
      // 3.47MB — the size that forced the seam cap to 4MB instead of the
      // 2MB the module comment once suggested listing pages fit inside.
      const html = await loadFixture(BUILDING.fixture);
      expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(MAX_SEAM_HTML_BYTES);
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

    it('layer 3 (DOM): redux building blob provides price/address/photos; no LLM escalation', async () => {
      const html = await loadFixture(BUILDING.fixture);
      const jsonLd = extractFromJsonLd(html, BUILDING.url);
      const dom = extractFromDom(html, BUILDING.url, 'zillow.com');

      // The labeled-DOM regexes catch a floorplan's "N beds" / "NNN sqft"
      // text (first match wins — not necessarily the cheapest unit).
      expect(typeof dom.bedrooms).toBe('number');
      expect(typeof dom.square_feet).toBe('number');

      // Phase-0 gap CLOSED (AIN-62): sites/zillow.ts now reads
      // `componentProps.initialReduxState.gdp.building` — the "from" price
      // (min across all floorplan units), the street address, geo, title,
      // and gallery photos are all reachable.
      expect(dom.price).toBe(1819);
      expect(dom.address).toBe('4702 Madison Yards Way');
      expect(dom.title).toBe('EO Madison Yards');
      expect(dom.latitude).toBe(43.074676);
      expect(dom.photos!.length).toBeGreaterThan(0);

      // With JSON-LD carrying the AggregateOffer price + `about` address,
      // the key-fields gate passes at Pass 1 — building pages no longer
      // escalate to the LLM rare path.
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

  describe('extractListingFromHtml() end-to-end over captured HTML (the extension seam)', () => {
    it('single-unit page: full key trio at high confidence, no DOM/LLM escalation needed', async () => {
      const html = await loadFixture(SINGLE_UNIT.fixture);
      const result = await extractListingFromHtml(html, SINGLE_UNIT.url);

      expect(result.source_url).toBe(SINGLE_UNIT.url);
      expect(result.source_domain).toBe('zillow.com');
      expect(result.title).toBe('2306 Kendall Ave, Madison, WI 53726');
      expect(result.price).toBe(3180);
      expect(result.bedrooms).toBe(3);
      expect(result.square_feet).toBe(1733);
      expect(result.address).toBe('2306 Kendall Ave');
      expect(result.city).toBe('Madison');
      expect(result.state).toBe('WI');
      expect(result.zip).toBe('53726');
      expect(result.latitude).toBe(43.071693);
      // JSON-LD now satisfies the key-fields gate at Pass 1; OG fills
      // description + photo. No DOM or LLM contribution.
      expect(result.extraction_method).toBe('json_ld_plus_og');
      expect(result.extraction_confidence).toBe('high');
    });

    it('building page: price range low + address + photos extract; no LLM needed', async () => {
      const html = await loadFixture(BUILDING.fixture);
      const result = await extractListingFromHtml(html, BUILDING.url);

      expect(result.source_url).toBe(BUILDING.url);
      expect(result.source_domain).toBe('zillow.com');
      expect(result.title).toBe('EO Madison Yards');
      expect(result.price).toBe(1819);
      expect(result.address).toBe('4702 Madison Yards Way');
      expect(result.city).toBe('Madison');
      expect(result.state).toBe('WI');
      expect(result.zip).toBe('53705');
      expect(result.latitude).toBe(43.074676);
      expect(result.photos!.length).toBeGreaterThan(0);
      expect(result.amenities).toContain('24-Hour Package Room & Amazon Lockers');
      // JSON-LD alone satisfies the gate (price + address); bedrooms stay
      // unset at building level → medium confidence, by design.
      expect(result.extraction_method).toBe('json_ld');
      expect(result.extraction_confidence).toBe('medium');
      expect(result.bedrooms).toBeUndefined();
    });
  });
});
