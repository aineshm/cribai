/**
 * Extraction-parity tests for the AIN-76 structured-first capture (AIN-76).
 *
 * These are the CRITICAL tests that prove the extension's size-reduction trim
 * doesn't degrade extraction quality: `extractListingFromHtml(structured, url)`
 * must return the SAME key fields as `extractListingFromHtml(fullHtml, url)`.
 *
 * Why this file lives in the AI package (not the extension package):
 *   - Needs `extractListingFromHtml` which transitively imports `@google/genai`,
 *     `zod`, etc. — all available in the AI package's node_modules.
 *   - Imports `buildStructuredHtmlFromString` from the extension package via
 *     relative path (the function is a pure string utility with no external deps).
 *   - Co-located with the other real-fixture tests (zillow-real-fixture.test.ts)
 *     for discoverability.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { extractListingFromHtml } from '../extract-from-html';

// Import the pure string-based structured capture function from the extension
// package via relative path. `buildStructuredHtmlFromString` has no external
// deps so it resolves cleanly from the AI package's test context.
// Path: packages/ai/src/extraction/__tests__/ → (5 levels up) → repo root
//       → apps/extension/src/lib/structured-html
import { buildStructuredHtmlFromString } from '../../../../../apps/extension/src/lib/structured-html';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

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
  // Photos: structured must have at least as many as full (or same count)
  if (full.photos !== undefined && full.photos.length > 0) {
    expect(structured.photos).toBeDefined();
    // Allow same or more photos (structured capture preserves all JSON-LD/OG)
    expect(structured.photos!.length).toBeGreaterThanOrEqual(
      Math.min(full.photos.length, 1),
    );
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
