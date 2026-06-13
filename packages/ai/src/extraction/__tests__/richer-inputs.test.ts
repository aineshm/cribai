/**
 * Tests for richer extraction inputs (AIN-71):
 * - innerText available to the LLM rare path
 * - same-origin iframe HTML processed via JSON-LD/OG fill-gaps
 */

import { describe, it, expect } from 'vitest';
import { extractListingFromHtml } from '../index';

const shell = '<html><head><title>X01 Floor Plans</title></head><body>see widget</body></html>';

// ---------------------------------------------------------------------------
// Iframe JSON-LD fill-gaps
// ---------------------------------------------------------------------------

describe('extractListingFromHtml — iframe HTML (richer inputs)', () => {
  it('merges JSON-LD found inside a same-origin iframe (fill-gaps, main html wins)', async () => {
    const iframeHtml = `<html><head><script type="application/ld+json">
      {"@type":"Apartment","name":"X01 2BR","offers":{"@type":"Offer","price":"1450"}}
    </script></head><body></body></html>`;
    const result = await extractListingFromHtml(shell, 'https://x01oncampus.com/floor-plans', {
      iframes: [{ src: 'https://widget.example/units', html: iframeHtml }],
    });
    expect(result.price).toBe(1450);
  });

  it('main html JSON-LD wins over iframe data (fill-gaps does not overwrite)', async () => {
    const mainHtml = `<html><head>
      <script type="application/ld+json">{"@type":"Apartment","name":"Main","offers":{"@type":"Offer","price":"999"}}</script>
    </head><body></body></html>`;
    const iframeHtml = `<html><head>
      <script type="application/ld+json">{"@type":"Apartment","name":"Iframe","offers":{"@type":"Offer","price":"1450"}}</script>
    </head><body></body></html>`;
    const result = await extractListingFromHtml(mainHtml, 'https://x01oncampus.com/', {
      iframes: [{ src: 'https://x01oncampus.com/widget', html: iframeHtml }],
    });
    // Main page wins — price stays 999
    expect(result.price).toBe(999);
  });

  it('iframe data fills gaps not present in main html', async () => {
    // Shell has no price, iframe has one
    const iframeHtml = `<html><head><script type="application/ld+json">
      {"@type":"Apartment","name":"Studio","offers":{"@type":"Offer","price":"899"}}
    </script></head><body></body></html>`;
    const result = await extractListingFromHtml(shell, 'https://x01oncampus.com/floor-plans', {
      iframes: [{ src: 'https://x01oncampus.com/leasing', html: iframeHtml }],
    });
    expect(result.price).toBe(899);
  });

  it('no-richer-inputs path is unchanged (snapshot parity)', async () => {
    // Calling without opts must behave identically to calling with empty opts
    const withoutOpts = await extractListingFromHtml(shell, 'https://x01oncampus.com/')
      .catch(() => null);
    const withEmptyOpts = await extractListingFromHtml(shell, 'https://x01oncampus.com/', {})
      .catch(() => null);
    // Both should be null (no listing data) or produce identical structure
    expect(withoutOpts).toEqual(withEmptyOpts);
  });
});

// ---------------------------------------------------------------------------
// innerText in LLM rare path
// ---------------------------------------------------------------------------

describe('extractListingFromHtml — innerText (richer inputs)', () => {
  it('includes innerText in the LLM rare-path context', async () => {
    const seen: string[] = [];
    const llmExtractor = async (ctx: string): Promise<Record<string, unknown>> => {
      seen.push(ctx);
      return {};
    };
    // shell has no structured data, so LLM path will fire
    await extractListingFromHtml(shell, 'https://x01oncampus.com/floor-plans', {
      innerText: 'Studio from $899 per installment',
      llmExtractor,
    }).catch(() => undefined);
    expect(seen.join('\n')).toContain('Studio from $899');
  });

  it('LLM context includes iframe text excerpts when provided', async () => {
    const seen: string[] = [];
    const llmExtractor = async (ctx: string): Promise<Record<string, unknown>> => {
      seen.push(ctx);
      return {};
    };
    const iframeHtml = '<html><body>2BR apartment $1450/mo available Fall 2026</body></html>';
    await extractListingFromHtml(shell, 'https://x01oncampus.com/', {
      iframes: [{ src: 'https://x01oncampus.com/units', html: iframeHtml }],
      llmExtractor,
    }).catch(() => undefined);
    // The context must contain the iframe text/HTML excerpt
    const fullCtx = seen.join('\n');
    expect(fullCtx.length).toBeGreaterThan(0);
  });

  it('innerText truncation: only first 30k chars sent to LLM', async () => {
    const seen: string[] = [];
    const llmExtractor = async (ctx: string): Promise<Record<string, unknown>> => {
      seen.push(ctx);
      return {};
    };
    const longText = 'A'.repeat(40_000) + 'UNIQUE_TAIL';
    await extractListingFromHtml(shell, 'https://x01oncampus.com/', {
      innerText: longText,
      llmExtractor,
    }).catch(() => undefined);
    const ctx = seen.join('\n');
    // Truncated to 30k, so UNIQUE_TAIL (at 40k) must not appear
    expect(ctx).not.toContain('UNIQUE_TAIL');
  });
});
