/**
 * Orchestration tests for the 4-layer escalation contract (AIN-47, Task 3).
 *
 * Verifies that `extractListing` walks JSON-LD → OG → DOM → LLM, escalating
 * only when the key-fields rule (`price && (bedrooms || address)`) is still
 * unsatisfied, fills gaps only (never overwrites a Pass-1 value), runs the
 * single final `normalizeFields`, and derives `extraction_method` /
 * `extraction_confidence` from which layers actually contributed.
 *
 * The DOM layer is exercised through the real per-site extractors (keyed off
 * `source_domain`); the LLM layer is injected via `opts.llmExtractor` so no
 * model call is ever made.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';

import { extractListing } from '../index';
import { deriveExtractionMethod, computeConfidence } from '../index';
import type { DnsLookupOption, ExtractedFields, LlmExtractor } from '../types';

/**
 * Stub DNS lookup — always a public IP so the SSRF guard passes offline.
 * Mirrors `extraction.test.ts`.
 */
const publicLookup: DnsLookupOption = (async () => [
  { address: '203.0.113.1', family: 4 as const },
]) as DnsLookupOption;

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

function makeFixtureFetcher(map: Record<string, { body: string; status?: number }>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const hit = map[url];
    if (!hit) throw new Error(`Test fetcher: unexpected URL ${url}`);
    return new Response(hit.body, { status: hit.status ?? 200 });
  }) as typeof fetch;
}

async function loadFixture(name: string): Promise<string> {
  return await readFile(join(FIXTURES_DIR, name), 'utf8');
}

/** A stub LLM extractor that returns a fixed partial and records its args. */
function makeLlm(result: Partial<ExtractedFields>): ReturnType<typeof vi.fn> & LlmExtractor {
  return vi.fn(async () => result) as ReturnType<typeof vi.fn> & LlmExtractor;
}

// ===========================================================================
// 1. Pass-1 stop: key fields present in JSON-LD → DOM + LLM never run
// ===========================================================================

describe('Pass 1 stop (key fields satisfied)', () => {
  it('does not call the LLM extractor and reports a structured-only method', async () => {
    const html = await loadFixture('zillow.html');
    const url =
      'https://www.zillow.com/homedetails/123-W-Gorham-St-APT-3-Madison-WI-53703/12345_zpid/';
    const llm = makeLlm({ price: 99 });
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
      lookup: publicLookup,
      llmExtractor: llm,
    });

    // zillow.html has price + bedrooms + address in JSON-LD → gate passes at
    // Pass 1, so neither DOM nor LLM should run. Method must be structured-only.
    expect(llm).not.toHaveBeenCalled();
    expect(['json_ld', 'json_ld_plus_og']).toContain(result.extraction_method);
    expect(result.extraction_method).not.toContain('dom');
    expect(result.extraction_method).not.toContain('llm');
    // Field values come from Pass 1, untouched by the (non-running) LLM.
    expect(result.price).toBe(1950);
  });
});

// ===========================================================================
// 2. Escalate to DOM: JSON-LD/OG miss key fields, DOM satisfies them
// ===========================================================================

describe('Escalate to DOM', () => {
  it('fills key fields from the per-site DOM extractor and never reaches the LLM', async () => {
    const html = await loadFixture('zillow-nextdata.html');
    const url =
      'https://www.zillow.com/homedetails/410-W-Dayton-St-Madison-WI-53703/67890_zpid/';
    const llm = makeLlm({ price: 1 });
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
      lookup: publicLookup,
      llmExtractor: llm,
    });

    // No JSON-LD, no OG price → Pass 1 + 2 fail the gate. The Zillow DOM
    // extractor supplies price + bedrooms + address → gate passes, LLM skipped.
    expect(result.extraction_method).toContain('dom');
    expect(result.extraction_method).not.toContain('llm');
    expect(llm).not.toHaveBeenCalled();
    expect(result.price).toBe(2100);
    expect(result.bedrooms).toBe(3);
    expect(result.address).toBe('410 W Dayton St');
  });
});

// ===========================================================================
// 3. Escalate to LLM: DOM can't satisfy the gate, LLM fills the rest
// ===========================================================================

describe('Escalate to LLM', () => {
  it('calls the injected LLM extractor once with pruned HTML and merges its fields', async () => {
    const html = await loadFixture('zillow-llm.html');
    const url = 'https://www.zillow.com/homedetails/sparse/0_zpid/';
    // DOM yields only { bedrooms: 1 } on this fixture → gate still fails (no
    // price). LLM supplies the missing price + address.
    const llm = makeLlm({ price: 1450, address: '99 Sparse Ln' });
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
      lookup: publicLookup,
      llmExtractor: llm,
    });

    expect(llm).toHaveBeenCalledTimes(1);
    // First arg is pruned HTML: <script>/<style>/comments stripped, whitespace
    // collapsed. The fixture's HTML comment must not survive pruning.
    const [prunedArg, urlArg] = llm.mock.calls[0]!;
    expect(typeof prunedArg).toBe('string');
    expect(prunedArg).not.toContain('<!--');
    expect(prunedArg).not.toContain('Sparse-DOM scenario'); // comment body gone
    expect(urlArg).toBe(url);

    expect(result.extraction_method).toContain('llm');
    expect(result.price).toBe(1450);
    expect(result.address).toBe('99 Sparse Ln');
    // DOM's contribution survives too.
    expect(result.bedrooms).toBe(1);
  });
});

// ===========================================================================
// 4. Gap-fill only: DOM/LLM never overwrite a field Pass 1 already set
// ===========================================================================

describe('Gap-fill only (no overwrite of Pass-1 values)', () => {
  it('keeps the Pass-1 price and fills only the missing address from DOM', async () => {
    // JSON-LD supplies price=1500 only (no address, no bedrooms) → Pass 1 fails
    // the gate. The same page carries a Zillow __NEXT_DATA__ blob offering a
    // DIFFERENT price (2100) plus an address. DOM must fill only the address;
    // the price stays the Pass-1 value.
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Apartment","name":"Gap Fill Test",
       "offers":{"@type":"Offer","price":1500,"priceCurrency":"USD"}}
      </script>
      <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"componentProps":{"property":{
        "price":2100,"streetAddress":"410 W Dayton St","city":"Madison","state":"WI","zipcode":"53703"
      }}}}}
      </script>
    </head><body></body></html>`;
    const url = 'https://www.zillow.com/homedetails/gap-fill/0_zpid/';
    const llm = makeLlm({ price: 999, address: 'WRONG' });
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
      lookup: publicLookup,
      llmExtractor: llm,
    });

    // Gate satisfied after DOM (price + address) → LLM never runs.
    expect(llm).not.toHaveBeenCalled();
    expect(result.price).toBe(1500); // Pass-1 value, NOT overwritten by DOM's 2100
    expect(result.address).toBe('410 W Dayton St'); // gap filled by DOM
    expect(result.extraction_method).toContain('json_ld');
    expect(result.extraction_method).toContain('dom');
  });
});

// ===========================================================================
// 4b. Negative structured price must NOT suppress the DOM rescue (regression)
// ===========================================================================

describe('Invalid structured number does not block escalation (regression)', () => {
  it('escalates past a negative JSON-LD price and takes the valid DOM price', async () => {
    // JSON-LD offers a NEGATIVE price (corrupt publisher data) plus a title.
    // Pre-fix, `-1500` is finite so it satisfied the gate at Pass 1, the DOM
    // rescue was skipped, and normalize then dropped it — yielding `json_ld`
    // with NO price. `dropInvalidNumerics` now scrubs the negative out of the
    // Pass-1 merge so the gate fails, DOM runs, and its valid price wins.
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Apartment","name":"Neg Price Listing",
       "offers":{"@type":"Offer","price":-1500,"priceCurrency":"USD"}}
      </script>
      <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"componentProps":{"property":{
        "price":2100,"bedrooms":3,"streetAddress":"410 W Dayton St","city":"Madison","state":"WI","zipcode":"53703"
      }}}}}
      </script>
    </head><body></body></html>`;
    const url = 'https://www.zillow.com/homedetails/neg-price/0_zpid/';
    const llm = makeLlm({ price: 1 });
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
      lookup: publicLookup,
      llmExtractor: llm,
    });

    expect(llm).not.toHaveBeenCalled();
    expect(result.price).toBe(2100); // valid DOM price, not the scrubbed -1500
    expect(result.bedrooms).toBe(3);
    expect(result.title).toBe('Neg Price Listing'); // json_ld's valid field survives
    expect(result.extraction_method).toContain('dom');
    expect(result.extraction_method).toContain('json_ld');
  });
});

// ===========================================================================
// 5. LLM output is normalized by the single final normalizeFields pass
// ===========================================================================

describe('LLM output normalization', () => {
  it('clamps over-long description, drops out-of-range geo, and drops non-http photos', async () => {
    // Sparse Pass 1 (og:title only) on an UNKNOWN domain so the DOM layer
    // returns {} and never sets description/geo/photos before the LLM does.
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Sparse Listing" />
    </head><body></body></html>`;
    const url = 'https://unknown-site.example/listing/1';
    const longDescription = 'x'.repeat(20_000);
    const llm = makeLlm({
      price: 1200,
      address: '1 Main St',
      description: longDescription,
      latitude: 999, // out of WGS84 range
      longitude: -999,
      photos: ['javascript:alert(1)', 'https://cdn.example/ok.jpg'],
    });
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
      lookup: publicLookup,
      llmExtractor: llm,
    });

    expect(llm).toHaveBeenCalledTimes(1);
    expect(result.extraction_method).toContain('llm');
    // normalize clamped the description to DESCRIPTION_MAX (10_000).
    expect(result.description!.length).toBe(10_000);
    // out-of-range geo dropped entirely.
    expect(result.latitude).toBeUndefined();
    expect(result.longitude).toBeUndefined();
    // javascript: photo dropped, https kept.
    expect(result.photos).toEqual(['https://cdn.example/ok.jpg']);
  });
});

// ===========================================================================
// 6. deriveExtractionMethod — table over contributor sets
// ===========================================================================

describe('deriveExtractionMethod', () => {
  it.each([
    [['json_ld'], 'json_ld'],
    [['og'], 'og'],
    [['dom'], 'dom'],
    [['llm'], 'llm'],
    [['json_ld', 'og'], 'json_ld_plus_og'],
    [['json_ld', 'dom'], 'json_ld_plus_dom'],
    [['og', 'dom'], 'og_plus_dom'],
    [['og', 'llm'], 'og_plus_llm'],
    [['dom', 'llm'], 'dom_plus_llm'],
    [['json_ld', 'og', 'dom'], 'json_ld_plus_og_plus_dom'],
    [['json_ld', 'dom', 'llm'], 'json_ld_plus_dom_plus_llm'],
    [['json_ld', 'og', 'dom', 'llm'], 'json_ld_plus_og_plus_dom_plus_llm'],
  ] as const)('joins %j in fixed order → %s', (contributors, expected) => {
    expect(deriveExtractionMethod(new Set(contributors))).toBe(expected);
  });

  it('orders by fixed precedence regardless of insertion order', () => {
    // Insert out of order; output must still be json_ld_plus_dom.
    const set = new Set<'json_ld' | 'og' | 'dom' | 'llm'>(['dom', 'json_ld']);
    expect(deriveExtractionMethod(set)).toBe('json_ld_plus_dom');
  });
});

// ===========================================================================
// 7. computeConfidence — table pinning each branch
// ===========================================================================

describe('computeConfidence', () => {
  it('high: all three key fields from JSON-LD', () => {
    expect(
      computeConfidence(
        { price: 1500, address: '1 Main', bedrooms: 2 },
        new Set(['json_ld']),
      ),
    ).toBe('high');
  });

  it('high: all three key fields from DOM (json_ld-only gate dropped)', () => {
    expect(
      computeConfidence(
        { price: 1500, address: '1 Main', bedrooms: 2 },
        new Set(['dom']),
      ),
    ).toBe('high');
  });

  it('medium: all three present but the LLM contributed (LLM cap)', () => {
    expect(
      computeConfidence(
        { price: 1500, address: '1 Main', bedrooms: 2 },
        new Set(['llm']),
      ),
    ).toBe('medium');
  });

  it('medium: OG-only with price + title (existing rule)', () => {
    expect(
      computeConfidence({ price: 1500, title: 'A Place' }, new Set(['og'])),
    ).toBe('medium');
  });

  it('medium: one key field from a non-LLM path', () => {
    expect(computeConfidence({ price: 1500 }, new Set(['json_ld']))).toBe('medium');
  });

  it('low: OG-only sparse (title only, no price)', () => {
    expect(computeConfidence({ title: 'A Place' }, new Set(['og']))).toBe('low');
  });

  it('low: LLM contributed but only a non-key field (no price)', () => {
    expect(computeConfidence({ title: 'A Place' }, new Set(['llm']))).toBe('low');
  });
});

// ===========================================================================
// 8. Full cascade json_ld → dom → llm, each layer contributing a distinct field
// ===========================================================================

describe('Full cascade (json_ld + dom + llm)', () => {
  it('escalates through all three layers when each only fills a non-key field until the LLM', async () => {
    // JSON-LD supplies a title ONLY (a non-key field) — gate fails (no price).
    // The Zillow __NEXT_DATA__ blob supplies a description ONLY (different
    // non-key field, so it survives gap-fill) — gate still fails. The body
    // carries NO "$X/mo" / "N beds" / data-testid="price" text, so the Zillow
    // labeled-DOM path adds no key field. Finally the LLM supplies the missing
    // price + address → gate satisfied, all three layers contributed.
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Apartment","name":"Cascade Title Only"}
      </script>
      <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"componentProps":{"property":{
        "description":"A roomy unit near campus."
      }}}}}
      </script>
    </head><body></body></html>`;
    const url = 'https://www.zillow.com/homedetails/cascade/0_zpid/';
    const llm = makeLlm({ price: 1750, address: '321 Cascade Ave' });
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
      lookup: publicLookup,
      llmExtractor: llm,
    });

    expect(llm).toHaveBeenCalledTimes(1);
    expect(result.extraction_method).toBe('json_ld_plus_dom_plus_llm');
    // Each layer's distinct field survives into the final record.
    expect(result.title).toBe('Cascade Title Only'); // json_ld
    expect(result.description).toBe('A roomy unit near campus.'); // dom
    expect(result.price).toBe(1750); // llm
    expect(result.address).toBe('321 Cascade Ave'); // llm
  });
});

// ===========================================================================
// 9. 'high' confidence via a DOM-only end-to-end run (no json_ld/og/llm)
// ===========================================================================

describe("'high' confidence via DOM-only end-to-end", () => {
  it('yields high confidence and a dom-only method when DOM supplies all three key fields', async () => {
    // Only a Zillow __NEXT_DATA__ blob — no JSON-LD, no OG meta, no LLM. The
    // blob carries price + bedrooms + address, so the gate passes at Pass 2
    // (DOM) and the LLM never runs. extraction_method must be exactly 'dom'
    // (pins out og/json_ld), and confidence 'high' (all three key fields from
    // a non-LLM structured layer).
    const html = `<!doctype html><html><head>
      <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"componentProps":{"property":{
        "price":2250,"bedrooms":2,"streetAddress":"77 Dom High St","city":"Madison","state":"WI","zipcode":"53703"
      }}}}}
      </script>
    </head><body></body></html>`;
    const url = 'https://www.zillow.com/homedetails/dom-high/0_zpid/';
    const llm = makeLlm({ price: 1 });
    const result = await extractListing(url, {
      fetcher: makeFixtureFetcher({ [url]: { body: html } }),
      lookup: publicLookup,
      llmExtractor: llm,
    });

    expect(llm).not.toHaveBeenCalled();
    expect(result.extraction_method).toBe('dom');
    expect(result.extraction_method).not.toContain('llm');
    expect(result.extraction_confidence).toBe('high');
    expect(result.price).toBe(2250);
    expect(result.bedrooms).toBe(2);
    expect(result.address).toBe('77 Dom High St');
  });
});
