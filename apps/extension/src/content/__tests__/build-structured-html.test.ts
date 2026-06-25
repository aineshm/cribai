/**
 * Unit tests for buildStructuredHtml (AIN-76).
 *
 * These tests verify that the structured-first capture function:
 *   1. Reduces page size significantly (fixing the 4 MiB extension guard problem)
 *   2. Preserves the signals the server extraction pipeline needs
 *   3. Keeps body content that labeled-DOM extractors rely on (no-regression)
 *
 * Extraction parity (the critical test proving trim doesn't degrade extraction
 * quality) lives alongside this file at
 * apps/extension/src/content/__tests__/structured-capture-parity.test.ts —
 * it imports extractListingFromHtml from @campusnest/ai (test-only devDep) and
 * runs it on both full and structured HTML to assert field-for-field parity.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildStructuredHtml } from '../capture-page';
import { MAX_HTML_BYTES, MAX_BODY_CAPTURE_CHARS } from '../../config/constants';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
// Path from apps/extension/src/content/__tests__/ up to repo root,
// then down to the AI package's real browser-captured fixtures.
const AI_FIXTURES_DIR = join(
  TESTS_DIR,
  '../../../../../packages/ai/src/extraction/__fixtures__',
);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Minimal Document stub — only provides `documentElement.outerHTML`.
 * `buildStructuredHtml` accesses exactly this property to get the full HTML
 * string, then operates on the string. This stub is sufficient for all tests
 * in this file without requiring a real DOM environment.
 */
function makeDocFromHtml(html: string): Document {
  return {
    documentElement: { outerHTML: html },
    title: '',
    body: null,
    querySelectorAll: () => [],
  } as unknown as Document;
}

// ---------------------------------------------------------------------------
// Size reduction tests (AIN-76 success criterion)
// ---------------------------------------------------------------------------

describe('buildStructuredHtml — size reduction', () => {
  it('zillow.html: output is a valid structured document under MAX_HTML_BYTES', () => {
    const html = readFileSync(join(AI_FIXTURES_DIR, 'zillow.html'), 'utf-8');
    const structured = buildStructuredHtml(makeDocFromHtml(html));
    const structuredBytes = Buffer.byteLength(structured, 'utf-8');

    expect(structuredBytes).toBeGreaterThan(0);
    expect(structuredBytes).toBeLessThan(MAX_HTML_BYTES);
    // Structured output must be valid HTML
    expect(structured).toMatch(/<!doctype html>/i);
    expect(structured).toContain('<head>');
    expect(structured).toContain('<body>');
  });

  it('zillow-madison-building.html: 3.5 MB → well under MAX_HTML_BYTES', () => {
    const html = readFileSync(
      join(AI_FIXTURES_DIR, 'zillow-madison-building.html'),
      'utf-8',
    );
    const originalBytes = Buffer.byteLength(html, 'utf-8');
    const structured = buildStructuredHtml(makeDocFromHtml(html));
    const structuredBytes = Buffer.byteLength(structured, 'utf-8');

    // Original is ~3.5 MB — must be reduced
    expect(originalBytes).toBeGreaterThan(3 * 1024 * 1024);
    // Structured output must be under MAX_HTML_BYTES (4 MiB)
    expect(structuredBytes).toBeLessThan(MAX_HTML_BYTES);
    // Structured is materially smaller than the original
    expect(structuredBytes).toBeLessThan(originalBytes);
  });

  it('body content is capped at MAX_BODY_CAPTURE_CHARS', () => {
    // Construct an HTML with a very large body
    const bigBody = 'x'.repeat(MAX_BODY_CAPTURE_CHARS + 100_000);
    const html = `<!doctype html><html><head><title>Test</title></head><body>${bigBody}</body></html>`;
    const structured = buildStructuredHtml(makeDocFromHtml(html));

    // The body content should be capped, not grow unbounded
    expect(Buffer.byteLength(structured, 'utf-8')).toBeLessThan(
      MAX_BODY_CAPTURE_CHARS + 50_000, // head overhead + capped body
    );
  });
});

// ---------------------------------------------------------------------------
// Signal-preserved tests (server extraction pipeline needs these signals)
// ---------------------------------------------------------------------------

describe('buildStructuredHtml — signal preserved', () => {
  it('zillow.html: preserves application/ld+json scripts verbatim', () => {
    const html = readFileSync(join(AI_FIXTURES_DIR, 'zillow.html'), 'utf-8');
    const structured = buildStructuredHtml(makeDocFromHtml(html));
    expect(structured).toContain('application/ld+json');
    // The type attribute form the server regex matches must be present
    expect(structured).toContain('"application/ld+json"');
  });

  it('zillow.html: preserves OpenGraph meta tags', () => {
    const html = readFileSync(join(AI_FIXTURES_DIR, 'zillow.html'), 'utf-8');
    const structured = buildStructuredHtml(makeDocFromHtml(html));
    // OG data is in meta tags
    expect(structured).toContain('og:');
  });

  it('zillow.html: preserves <title> from head', () => {
    const html = readFileSync(join(AI_FIXTURES_DIR, 'zillow.html'), 'utf-8');
    const structured = buildStructuredHtml(makeDocFromHtml(html));
    expect(structured).toContain('<title>');
  });

  it('zillow-madison-building.html: preserves __NEXT_DATA__ script block', () => {
    const html = readFileSync(
      join(AI_FIXTURES_DIR, 'zillow-madison-building.html'),
      'utf-8',
    );
    const structured = buildStructuredHtml(makeDocFromHtml(html));
    expect(structured).toContain('__NEXT_DATA__');
    // The JSON content must also be present (confirming the full block was captured)
    expect(structured).toContain('"initialReduxState"');
  });

  it('zillow-madison-building.html: preserves application/ld+json', () => {
    const html = readFileSync(
      join(AI_FIXTURES_DIR, 'zillow-madison-building.html'),
      'utf-8',
    );
    const structured = buildStructuredHtml(makeDocFromHtml(html));
    expect(structured).toContain('application/ld+json');
  });

  it('structured output contains well-formed head and body sections', () => {
    const html = '<html><head><title>T</title><meta property="og:type" content="x"/></head><body><div>hello</div></body></html>';
    const structured = buildStructuredHtml(makeDocFromHtml(html));
    expect(structured).toContain('<title>T</title>');
    expect(structured).toContain('og:type');
    expect(structured).toContain('<div>hello</div>');
  });
});

// ---------------------------------------------------------------------------
// Body-content no-regression (labeled-DOM extractor relies on body patterns)
// ---------------------------------------------------------------------------

describe('buildStructuredHtml — body content no-regression', () => {
  it('zillow-sparse.html: preserves labeled-DOM price and beds patterns in body', () => {
    const html = readFileSync(join(AI_FIXTURES_DIR, 'zillow-sparse.html'), 'utf-8');
    const structured = buildStructuredHtml(makeDocFromHtml(html));

    // Zillow labeled-DOM extractor reads: data-testid="price", "N beds"
    expect(structured).toContain('data-testid="price"');
    expect(structured).toContain('$1,750');
    expect(structured).toContain('2 beds');
  });

  it('body scripts are stripped (reducing noise for DOM extractors and LLM)', () => {
    const html =
      '<html><head></head><body>' +
      '<div data-testid="price">$1,200/mo</div>' +
      '<script>var x = "should be stripped";</script>' +
      '<span>3 beds</span>' +
      '</body></html>';
    const structured = buildStructuredHtml(makeDocFromHtml(html));
    expect(structured).toContain('$1,200');
    expect(structured).toContain('3 beds');
    expect(structured).not.toContain('should be stripped');
  });

  it('body style blocks are stripped', () => {
    const html =
      '<html><head></head><body>' +
      '<style>.big-style { color: red; }</style>' +
      '<p>keep this text</p>' +
      '</body></html>';
    const structured = buildStructuredHtml(makeDocFromHtml(html));
    expect(structured).toContain('keep this text');
    expect(structured).not.toContain('.big-style');
  });

  it('JSON-LD in body (non-Next.js pages) is still extracted to head', () => {
    const jsonLdBlock =
      '<script type="application/ld+json">{"@type":"Apartment","name":"Test Apt","offers":{"price":1500}}</script>';
    const html = `<html><head><title>Test</title></head><body>${jsonLdBlock}<p>content</p></body></html>`;
    const structured = buildStructuredHtml(makeDocFromHtml(html));
    // JSON-LD should appear in the structured output regardless of where it was
    expect(structured).toContain('application/ld+json');
    expect(structured).toContain('"price":1500');
    // Body content also preserved
    expect(structured).toContain('content');
  });
});

// ---------------------------------------------------------------------------
// Constant: MAX_BODY_CAPTURE_CHARS must exist and be a positive number
// ---------------------------------------------------------------------------

describe('MAX_BODY_CAPTURE_CHARS constant', () => {
  it('is exported from constants.ts and is a positive number', () => {
    expect(typeof MAX_BODY_CAPTURE_CHARS).toBe('number');
    expect(MAX_BODY_CAPTURE_CHARS).toBeGreaterThan(0);
    // Should be large enough to hold meaningful body content
    expect(MAX_BODY_CAPTURE_CHARS).toBeGreaterThanOrEqual(100_000);
  });
});

// ---------------------------------------------------------------------------
// Malformed-page edge case (AIN-76 review M-1 / LOW-2)
// ---------------------------------------------------------------------------

describe('buildStructuredHtml — malformed pages', () => {
  it('still captures title/meta when the </head> tag is missing', () => {
    // No </head> close tag — extractHeadContent must fall back to the rest of
    // the document rather than dropping all head metadata (review M-1).
    const html =
      '<html><head>' +
      '<title>Studio S1</title>' +
      '<meta property="og:title" content="Chapter at Madison">' +
      '<body><p>body content</p></body></html>';
    const structured = buildStructuredHtml(makeDocFromHtml(html));
    expect(structured).toContain('<title>Studio S1</title>');
    expect(structured).toContain('og:title');
  });
});

// ---------------------------------------------------------------------------
// Adversarial wall-clock guard (AIN-76 review LOW-4; pins the WS3a no-ReDoS
// contract on the new string-processing code so a future quadratic regression
// is caught automatically).
// ---------------------------------------------------------------------------

describe('buildStructuredHtml — adversarial input is linear-time', () => {
  it('completes well under 5s on 4 MB of unterminated <script floods', () => {
    // The exact flood pattern stripTagBlocks was written to defend: ~440k
    // `<script ` open tags with no matching close tags, ~3.9 MB total.
    const hostile =
      '<html><head></head><body>' +
      '<script '.repeat(440_000) +
      '</body></html>';
    const start = Date.now();
    const out = buildStructuredHtml(makeDocFromHtml(hostile));
    const elapsedMs = Date.now() - start;
    expect(typeof out).toBe('string');
    expect(elapsedMs).toBeLessThan(5_000);
  });
});
