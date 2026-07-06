/**
 * Tests for the deterministic Zillow building-page floor-plan projection
 * (AIN-83 Task 2).
 *
 * `extractZillowFloorPlans` reads `building.floorPlans[]` from the SAME
 * `__NEXT_DATA__` blob `sites/zillow.ts` already locates for
 * `minFloorPlanPrice` — but keeps every plan instead of collapsing to one
 * scalar. `isZillowBuildingUrl` is the URL gate the orchestrator
 * (`extract-from-html.ts`) uses to run this pass independently of the
 * escalation ladder (recon trap: building pages satisfy `hasKeyFields` via
 * JSON-LD alone, so the DOM layer that knows how to read this blob never
 * runs today).
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { extractZillowFloorPlans, isZillowBuildingUrl } from '../sites/zillow';
import { extractFromJsonLd } from '../json-ld';
import { extractListingFromHtml } from '../extract-from-html';
import { FLOOR_PLAN_MAX_COUNT } from '../floor-plan';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

const BUILDING = {
  fixture: 'zillow-madison-building.html',
  url: 'https://www.zillow.com/apartments/madison-wi/eo-madison-yards/ChRJJw/',
};
const SINGLE_UNIT = {
  fixture: 'zillow-madison-single-unit.html',
  url: 'https://www.zillow.com/homedetails/2306-Kendall-Ave-Madison-WI-53726/55402232_zpid/',
};

async function loadFixture(name: string): Promise<string> {
  return await readFile(join(FIXTURES_DIR, name), 'utf8');
}

function htmlWithNextData(data: unknown): string {
  return `<!doctype html><html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    data,
  )}</script></head><body></body></html>`;
}

function buildingPage(building: Record<string, unknown>): string {
  return htmlWithNextData({
    props: {
      pageProps: {
        componentProps: { initialReduxState: { gdp: { building } } },
      },
    },
  });
}

describe('isZillowBuildingUrl', () => {
  it('matches /apartments/<slug> building pages', () => {
    expect(isZillowBuildingUrl('https://www.zillow.com/apartments/madison-wi/eo-madison-yards/ChRJJw/')).toBe(true);
  });

  it('matches /b/<slug> building pages', () => {
    expect(isZillowBuildingUrl('https://www.zillow.com/b/some-building-ChRJJw/')).toBe(true);
  });

  it('does NOT match /homedetails/ single-unit pages', () => {
    expect(isZillowBuildingUrl('https://www.zillow.com/homedetails/123-main-st/12345_zpid/')).toBe(false);
  });

  it('never throws on an invalid URL', () => {
    expect(isZillowBuildingUrl('not a url')).toBe(false);
  });
});

describe('extractZillowFloorPlans — real EO Madison Yards fixture (24 plans)', () => {
  it('returns all 24 plans', async () => {
    const html = await loadFixture(BUILDING.fixture);
    const plans = extractZillowFloorPlans(html);
    expect(plans).toHaveLength(24);
  });

  it('sorts cheapest-first — min(rent_min) matches the pinned top-level "from" price (1819)', async () => {
    const html = await loadFixture(BUILDING.fixture);
    const plans = extractZillowFloorPlans(html);
    expect(plans[0]!.rent_min).toBe(1819);
    for (let i = 1; i < plans.length; i += 1) {
      const prev = plans[i - 1]!.rent_min ?? Number.POSITIVE_INFINITY;
      const cur = plans[i]!.rent_min ?? Number.POSITIVE_INFINITY;
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });

  it('spot-checks the cheapest plan (A11)', async () => {
    const html = await loadFixture(BUILDING.fixture);
    const plans = extractZillowFloorPlans(html);
    const cheapest = plans[0]!;
    expect(cheapest.name).toBe('A11');
    expect(cheapest.rent_min).toBe(1819);
    expect(cheapest.rent_max).toBe(2118);
    expect(cheapest.bedrooms).toBe(1);
    expect(cheapest.bathrooms).toBe(1);
    expect(cheapest.sqft).toBe(799);
  });

  it('spot-checks a second plan (S1 — a studio)', async () => {
    const html = await loadFixture(BUILDING.fixture);
    const plans = extractZillowFloorPlans(html);
    const s1 = plans.find((p) => p.name === 'S1');
    expect(s1).toBeDefined();
    expect(s1!.rent_min).toBe(1825);
    expect(s1!.rent_max).toBe(1825);
    expect(s1!.bedrooms).toBe(0);
    expect(s1!.bathrooms).toBe(1);
    expect(s1!.sqft).toBe(547);
  });

  it('never returns more than FLOOR_PLAN_MAX_COUNT plans', async () => {
    const html = await loadFixture(BUILDING.fixture);
    const plans = extractZillowFloorPlans(html);
    expect(plans.length).toBeLessThanOrEqual(FLOOR_PLAN_MAX_COUNT);
  });
});

describe('extractZillowFloorPlans — degrades gracefully', () => {
  it('returns [] for a single-unit /homedetails/ page (no building blob)', async () => {
    const html = await loadFixture(SINGLE_UNIT.fixture);
    expect(extractZillowFloorPlans(html)).toEqual([]);
  });

  it('returns [] when there is no __NEXT_DATA__ at all', () => {
    expect(extractZillowFloorPlans('<html><body>no data here</body></html>')).toEqual([]);
  });

  it('drops a plan with no name rather than throwing', () => {
    const html = buildingPage({
      buildingName: 'Nameless Towers',
      floorPlans: [
        { minPrice: 900, beds: 0, baths: 1, sqft: 400 }, // no `name`
        { name: 'A1', minPrice: 1200, beds: 1, baths: 1, sqft: 700 },
      ],
    });
    const plans = extractZillowFloorPlans(html);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.name).toBe('A1');
  });

  it('caps and cheapest-sorts a synthetic 41-plan building (array cap regression)', () => {
    const floorPlans = Array.from({ length: 41 }, (_, i) => ({
      name: `Plan ${i}`,
      minPrice: 2000 - i, // last plan (i=40) is CHEAPEST at 1960
      maxPrice: 2000 - i,
      beds: 1,
      baths: 1,
      sqft: 700,
    }));
    const html = buildingPage({ buildingName: 'Big Building', floorPlans });
    const plans = extractZillowFloorPlans(html);
    expect(plans).toHaveLength(FLOOR_PLAN_MAX_COUNT);
    expect(plans[0]!.name).toBe('Plan 40'); // cheapest survives truncation
    expect(plans[0]!.rent_min).toBe(1960);
  });

  it('sanitizes a plan name with quotes/newlines before returning it', () => {
    const html = buildingPage({
      buildingName: 'X',
      floorPlans: [{ name: '  "S1"\nlayout  ', minPrice: 1000, beds: 0, baths: 1, sqft: 400 }],
    });
    const plans = extractZillowFloorPlans(html);
    expect(plans[0]!.name).toBe('S1 layout');
  });
});

describe('TRAP guard — the building-page JSON-LD ItemList is a sibling-buildings carousel, never a listing source', () => {
  it('extractFromJsonLd does not resolve a bare ItemList block to a listing', () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Similar rentals nearby',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'ONE 09' },
        ],
      })}</script>
    </head><body></body></html>`;
    expect(extractFromJsonLd(html, 'https://www.zillow.com/apartments/x/')).toBeNull();
  });

  it('real building fixture: JSON-LD title is the building itself, never a sibling from the ItemList carousel', async () => {
    const html = await loadFixture(BUILDING.fixture);
    const jsonLd = extractFromJsonLd(html, BUILDING.url);
    expect(jsonLd!.title).toBe('EO Madison Yards');
    expect(jsonLd!.title).not.toBe('ONE 09');
  });
});

describe('orchestrator hook — escalation-gate independence (AIN-83)', () => {
  it('building page: floor_plans populate even though JSON-LD alone satisfies hasKeyFields (extraction_method stays json_ld)', async () => {
    const html = await loadFixture(BUILDING.fixture);
    const result = await extractListingFromHtml(html, BUILDING.url);

    // Pinned pre-existing behavior (must stay green): JSON-LD alone reaches
    // the gate, so no DOM/LLM contribution.
    expect(result.extraction_method).toBe('json_ld');
    expect(result.price).toBe(1819);

    // NEW (AIN-83): the floor-plan enrichment pass ran anyway.
    expect(result.floor_plans).toBeDefined();
    expect(result.floor_plans).toHaveLength(24);
    expect(result.floor_plans![0]!.rent_min).toBe(1819);
  });

  it('single-unit /homedetails/ page: floor_plans is never set (pays zero extra cost)', async () => {
    const html = await loadFixture(SINGLE_UNIT.fixture);
    const result = await extractListingFromHtml(html, SINGLE_UNIT.url);
    expect(result.floor_plans).toBeUndefined();
  });

  it('a non-Zillow domain never runs the Zillow floor-plan parse', async () => {
    const html = '<!doctype html><html><head><meta property="og:title" content="Some Listing"/><meta property="og:description" content="A nice place, $1200/mo"/></head><body></body></html>';
    const result = await extractListingFromHtml(html, 'https://www.apartments.com/apartments/some-building/');
    expect(result.floor_plans).toBeUndefined();
  });
});
