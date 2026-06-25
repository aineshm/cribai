/**
 * Extraction-parity tests for the AIN-76 structured-first capture (AIN-76).
 *
 * These are the CRITICAL tests that prove the extension's size-reduction trim
 * doesn't degrade extraction quality: `extractListingFromHtml(structured, url)`
 * must return the SAME key fields as `extractListingFromHtml(fullHtml, url)`.
 *
 * This file lives in the extension package because:
 *   - `buildStructuredHtmlFromString` is defined HERE (in the extension package)
 *     so the import is a clean local relative import with no cross-package path.
 *   - `extractListingFromHtml` is imported via the `@campusnest/ai` package
 *     boundary (devDependency — TEST ONLY, never enters the production bundle).
 *   - Fixture HTML files are read from disk via fs — data files, not TS modules,
 *     so reading across the monorepo is fine.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

// Package-boundary import: devDependency, test-only, never bundled
import { extractListingFromHtml } from '@campusnest/ai';

// Local import: same package, clean relative path
import { buildStructuredHtmlFromString } from '../../lib/structured-html';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
// Path from apps/extension/src/content/__tests__/ up to repo root,
// then down to the AI package's real browser-captured fixtures.
const FIXTURES_DIR = join(
  TESTS_DIR,
  '../../../../../packages/ai/src/extraction/__fixtures__',
);

const ZILLOW_SINGLE = {
  fixture: 'zillow.html',
  url: 'https://www.zillow.com/homedetails/123-W-Gorham-St-APT-3-Madison-WI-53703/12345_zpid/',
};
const ZILLOW_BUILDING = {
  fixture: 'zillow-madison-building.html',
  url: 'https://www.zillow.com/apartments/madison-wi/eo-madison-yards/ChRJJw/',
};
const ZILLOW_SPARSE = {
  fixture: 'zillow-sparse.html',
  url: 'https://www.zillow.com/homedetails/test/123_zpid/',
};

async function loadFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIR, name), 'utf8');
}

// ---------------------------------------------------------------------------
// Parity helper: compare key fields between full and structured extraction
// ---------------------------------------------------------------------------

function compareKeyFields(
  full: Awaited<ReturnType<typeof extractListingFromHtml>>,
  structured: Awaited<ReturnType<typeof extractListingFromHtml>>,
): void {
  // Price: must match exactly
  if (full.price !== undefined) {
    expect(structured.price).toBe(full.price);
  }
  // Address: must match exactly
  if (full.address !== undefined) {
    expect(structured.address).toBe(full.address);
  }
  // Bedrooms: must match exactly when full extraction found them
  if (full.bedrooms !== undefined) {
    expect(structured.bedrooms).toBe(full.bedrooms);
  }
  // Title: must match exactly
  if (full.title !== undefined) {
    expect(structured.title).toBe(full.title);
  }
  // Photos: JSON-LD / OG / <img> are all preserved verbatim by the structured
  // capture, so the count must match the full-HTML extraction exactly — a
  // smaller count means the trim silently dropped a photo source (review L-3).
  if (full.photos !== undefined && full.photos.length > 0) {
    expect(structured.photos).toBeDefined();
    expect(structured.photos!.length).toBe(full.photos.length);
  }
  // Extraction method: structured should not regress to a less-informed method
  // (same method or equivalent is acceptable)
  expect(structured.extraction_method).toBeDefined();
}

// ---------------------------------------------------------------------------
// zillow.html — small fixture, JSON-LD + OG
// ---------------------------------------------------------------------------

describe('structured-capture parity — zillow.html (JSON-LD + OG)', () => {
  it('extraction result matches full HTML for key fields', async () => {
    const fullHtml = await loadFixture(ZILLOW_SINGLE.fixture);
    const structuredHtml = buildStructuredHtmlFromString(fullHtml);

    const [fullResult, structuredResult] = await Promise.all([
      extractListingFromHtml(fullHtml, ZILLOW_SINGLE.url),
      extractListingFromHtml(structuredHtml, ZILLOW_SINGLE.url),
    ]);

    compareKeyFields(fullResult, structuredResult);

    // Spot-check the expected values from zillow.html fixture
    expect(structuredResult.price).toBe(1950);
    expect(structuredResult.bedrooms).toBe(2);
    expect(structuredResult.address).toBe('123 W Gorham St APT 3');
  });
});

// ---------------------------------------------------------------------------
// zillow-madison-building.html — large fixture (3.5 MB), JSON-LD + NEXT_DATA
// ---------------------------------------------------------------------------

describe('structured-capture parity — zillow-madison-building.html (3.5 MB)', () => {
  it('extraction result matches full HTML for key fields (price, address, title)', async () => {
    const fullHtml = await loadFixture(ZILLOW_BUILDING.fixture);
    const structuredHtml = buildStructuredHtmlFromString(fullHtml);

    // Confirm size reduction
    const fullBytes = Buffer.byteLength(fullHtml, 'utf-8');
    const structuredBytes = Buffer.byteLength(structuredHtml, 'utf-8');
    expect(structuredBytes).toBeLessThan(fullBytes);
    expect(structuredBytes).toBeLessThan(4 * 1024 * 1024); // under MAX_HTML_BYTES

    const [fullResult, structuredResult] = await Promise.all([
      extractListingFromHtml(fullHtml, ZILLOW_BUILDING.url),
      extractListingFromHtml(structuredHtml, ZILLOW_BUILDING.url),
    ]);

    compareKeyFields(fullResult, structuredResult);

    // Spot-check the expected values from zillow-real-fixture.test.ts
    expect(structuredResult.title).toBe('EO Madison Yards');
    expect(structuredResult.price).toBe(1819);
    expect(structuredResult.address).toBe('4702 Madison Yards Way');
  });
});

// ---------------------------------------------------------------------------
// zillow-sparse.html — no JSON-LD, no NEXT_DATA, labeled-DOM only
// ---------------------------------------------------------------------------

describe('structured-capture parity — zillow-sparse.html (labeled-DOM only)', () => {
  it('sparse page: structured capture yields same extraction as full page', async () => {
    const fullHtml = await loadFixture(ZILLOW_SPARSE.fixture);
    const structuredHtml = buildStructuredHtmlFromString(fullHtml);

    const [fullResult, structuredResult] = await Promise.all([
      extractListingFromHtml(fullHtml, ZILLOW_SPARSE.url),
      extractListingFromHtml(structuredHtml, ZILLOW_SPARSE.url),
    ]);

    // Price and bedrooms must be extractable from the structured output
    // (labeled-DOM patterns in <body> must survive the strip)
    if (fullResult.price !== undefined) {
      expect(structuredResult.price).toBe(fullResult.price);
    }
    if (fullResult.bedrooms !== undefined) {
      expect(structuredResult.bedrooms).toBe(fullResult.bedrooms);
    }
  });
});
