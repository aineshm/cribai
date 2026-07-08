/**
 * Tests for the `selected_unit` extraction wiring (AIN-98 Task 3).
 *
 * `extractListingFromHtml` (the extension ingest seam) receives the raw,
 * fragment-inclusive URL — `#udp-<zpid>` on a Zillow BUILDING page identifies
 * which unit the user was viewing. This pins that the orchestrator threads
 * the fragment through `parseUnitFragment` + `resolveZillowUnit` and attaches
 * the result as `selected_unit`, WITHOUT disturbing any existing extracted
 * field for fixtures that carry no fragment (byte-identical regression guard
 * — see zillow-real-fixture.test.ts / zillow-floor-plans.test.ts, which
 * exercise the same fixtures with no fragment on the URL).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { extractListingFromHtml } from '../extract-from-html';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

const BUILDING_FIXTURE = 'zillow-madison-building.html';
const SINGLE_UNIT_FIXTURE = 'zillow-madison-single-unit.html';
const BUILDING_URL = 'https://www.zillow.com/apartments/madison-wi/eo-madison-yards/ChRJJw/';
const REAL_ZPID = '2056051402';

async function loadFixture(name: string): Promise<string> {
  return await readFile(join(FIXTURES_DIR, name), 'utf8');
}

describe('extractListingFromHtml — selected_unit wiring (AIN-98)', () => {
  it('resolves selected_unit when the building URL carries a matching #udp-<zpid> fragment', async () => {
    const html = await loadFixture(BUILDING_FIXTURE);
    const urlWithFragment = `${BUILDING_URL}#udp-${REAL_ZPID}`;

    const result = await extractListingFromHtml(html, urlWithFragment);

    expect(result.selected_unit).toBeDefined();
    expect(result.selected_unit!.zpid).toBe(REAL_ZPID);
    expect(result.selected_unit!.unit_number).toBe('Unit 1405');
    expect(result.selected_unit!.plan_name).toBe('S1');
  });

  it('reports source_url with the fragment intact (fragment stripping is addListing/normalization work, not extraction)', async () => {
    const html = await loadFixture(BUILDING_FIXTURE);
    const urlWithFragment = `${BUILDING_URL}#udp-${REAL_ZPID}`;

    const result = await extractListingFromHtml(html, urlWithFragment);

    expect(result.source_url).toBe(urlWithFragment);
  });

  it('does not set selected_unit when the fragment zpid matches no unit', async () => {
    const html = await loadFixture(BUILDING_FIXTURE);
    const result = await extractListingFromHtml(html, `${BUILDING_URL}#udp-999999999`);

    expect(result.selected_unit).toBeUndefined();
  });

  it('does not set selected_unit for a non-Zillow-udp fragment (apartments.com-style)', async () => {
    const html = await loadFixture(BUILDING_FIXTURE);
    const result = await extractListingFromHtml(html, `${BUILDING_URL}#cjzhjxg-2-unit`);

    expect(result.selected_unit).toBeUndefined();
  });

  it('byte-identical regression guard: building page WITHOUT a fragment is unchanged (no selected_unit key)', async () => {
    const html = await loadFixture(BUILDING_FIXTURE);
    const result = await extractListingFromHtml(html, BUILDING_URL);

    expect(result.selected_unit).toBeUndefined();
    // Existing AIN-83 behavior stays intact alongside the new field.
    expect(result.floor_plans).toHaveLength(24);
    expect(result.price).toBe(1819);
  });

  it('byte-identical regression guard: single-unit page never sets selected_unit even with a udp fragment', async () => {
    const html = await loadFixture(SINGLE_UNIT_FIXTURE);
    const singleUnitUrl = 'https://www.zillow.com/homedetails/2306-Kendall-Ave-Madison-WI-53726/55402232_zpid/';
    const result = await extractListingFromHtml(html, `${singleUnitUrl}#udp-55402232`);

    expect(result.selected_unit).toBeUndefined();
    expect(result.floor_plans).toBeUndefined();
  });

  it('byte-identical regression guard: a non-Zillow domain never attempts unit resolution', async () => {
    const html = '<!doctype html><html><head><meta property="og:title" content="Some Listing"/><meta property="og:description" content="A nice place, $1200/mo"/></head><body></body></html>';
    const result = await extractListingFromHtml(html, 'https://www.apartments.com/apartments/some-building/#udp-123');

    expect(result.selected_unit).toBeUndefined();
  });
});
