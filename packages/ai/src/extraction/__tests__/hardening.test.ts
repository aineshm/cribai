/**
 * End-to-end hardening tests for AIN-38.
 *
 * These tests exercise the FULL `extractListing` path — they confirm that the
 * SSRF guard, scheme allowlist, body cap, proto-pollution guard, and the
 * normalize caps are wired into the entry point (not just into the helper
 * modules covered by `ssrf-guard.test.ts` and `normalize.test.ts`).
 */

import { describe, it, expect } from 'vitest';

import { extractListing, parseAllJsonLdBlocks } from '../index';
import type { DnsLookupOption } from '../types';

const PUBLIC_IP: DnsLookupOption = (async () => [
  { address: '203.0.113.1', family: 4 as const },
]) as DnsLookupOption;

const privateLookup = (address: string, family: 4 | 6 = 4): DnsLookupOption =>
  (async () => [{ address, family }]) as DnsLookupOption;

function fetcherFor(url: string, body: string, status = 200, extraHeaders?: Record<string, string>): typeof fetch {
  return (async () => {
    const res = new Response(body, { status, headers: extraHeaders });
    Object.defineProperty(res, 'url', { value: url });
    return res;
  }) as typeof fetch;
}

// ===========================================================================
// SSRF — DNS rebinding via injected lookup
// ===========================================================================

describe('SSRF (DNS rebinding)', () => {
  it.each([
    ['10.0.0.1', 4 as const],
    ['127.0.0.1', 4 as const],
    ['169.254.169.254', 4 as const],
    ['192.168.0.1', 4 as const],
  ])('rejects a public-looking host that resolves to %s', async (ip, family) => {
    await expect(
      extractListing('https://attacker.example/listing', {
        fetcher: fetcherFor('https://attacker.example/listing', '<html></html>'),
        lookup: privateLookup(ip, family),
      }),
    ).rejects.toMatchObject({ code: 'fetch_blocked' });
  });

  it.each([
    ['::1', 6 as const],
    ['fc00::1', 6 as const],
    ['fe80::1', 6 as const],
  ])('rejects when host resolves to IPv6 %s', async (ip, family) => {
    await expect(
      extractListing('https://attacker.example/listing', {
        fetcher: fetcherFor('https://attacker.example/listing', '<html></html>'),
        lookup: privateLookup(ip, family),
      }),
    ).rejects.toMatchObject({ code: 'fetch_blocked' });
  });

  it('rejects direct private IPv4 literal URL', async () => {
    await expect(
      extractListing('http://169.254.169.254/latest/meta-data/', {
        fetcher: fetcherFor('http://169.254.169.254/', '<html></html>'),
        lookup: PUBLIC_IP,
      }),
    ).rejects.toMatchObject({ code: 'fetch_blocked' });
  });

  it('allows a public host that resolves to a public IP (happy path)', async () => {
    const url = 'https://www.example.com/listing';
    const html = `<!doctype html><meta property="og:title" content="OK" />`;
    const result = await extractListing(url, {
      fetcher: fetcherFor(url, html),
      lookup: PUBLIC_IP,
    });
    expect(result.title).toBe('OK');
  });
});

// ===========================================================================
// SSRF — Redirect chain re-validation
// ===========================================================================

describe('SSRF (redirect chain)', () => {
  it('rejects a 302 to http://169.254.169.254/', async () => {
    const fetcher = (async (input: string | URL | Request) => {
      const requested =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (requested === 'https://innocent.example/listing') {
        return new Response('', {
          status: 302,
          headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
        });
      }
      throw new Error(`Unexpected URL ${requested}`);
    }) as typeof fetch;

    await expect(
      extractListing('https://innocent.example/listing', {
        fetcher,
        lookup: PUBLIC_IP,
      }),
    ).rejects.toMatchObject({ code: 'fetch_blocked' });
  });

  it('rejects when redirect chain exceeds the cap', async () => {
    let hop = 0;
    const fetcher = (async () => {
      hop += 1;
      // Always 302 to "next.example/<n>"; the cap will trip first.
      return new Response('', {
        status: 302,
        headers: { Location: `https://next${hop}.example/page` },
      });
    }) as typeof fetch;
    await expect(
      extractListing('https://first.example/page', {
        fetcher,
        lookup: PUBLIC_IP,
      }),
    ).rejects.toMatchObject({ code: 'fetch_failed' });
  });

  it('rejects 3xx without a Location header', async () => {
    const fetcher = (async () => new Response('', { status: 302 })) as typeof fetch;
    await expect(
      extractListing('https://noloc.example/page', {
        fetcher,
        lookup: PUBLIC_IP,
      }),
    ).rejects.toMatchObject({ code: 'fetch_failed' });
  });

  it('uses the post-redirect host for source_domain (codex P2)', async () => {
    const html = `<!doctype html><meta property="og:title" content="Real Listing" />`;
    const fetcher = (async (input: string | URL | Request) => {
      const requested =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (requested === 'https://shortener.example/r/xyz') {
        return new Response('', {
          status: 302,
          headers: { Location: 'https://www.publisher.example/listing/abc' },
        });
      }
      if (requested === 'https://www.publisher.example/listing/abc') {
        return new Response(html, { status: 200 });
      }
      throw new Error(`Unexpected URL ${requested}`);
    }) as typeof fetch;
    const result = await extractListing('https://shortener.example/r/xyz', {
      fetcher,
      lookup: PUBLIC_IP,
    });
    expect(result.source_url).toBe('https://shortener.example/r/xyz');
    // source_domain should be the real publisher (no www prefix), not the
    // shortener — otherwise downstream per-site logic fragments.
    expect(result.source_domain).toBe('publisher.example');
  });

  it('re-validates response.url after a fetcher-followed redirect (codex P2)', async () => {
    // A caller that supplies a custom `fetcher` is free to ignore the
    // `redirect: 'manual'` option and follow 3xx itself. In that case the
    // returned Response's `.url` reflects a host the SSRF guard never saw.
    // The entry point must re-validate it before resolving relative URLs
    // against it (or returning source_domain).
    const url = 'https://innocent.example/redirect';
    const fetcher = (async () => {
      const res = new Response('<html><meta property="og:title" content="X" /></html>', {
        status: 200,
      });
      // Pretend the caller's fetch silently followed a 302 to metadata.
      Object.defineProperty(res, 'url', {
        value: 'http://169.254.169.254/latest/meta-data/',
      });
      return res;
    }) as typeof fetch;
    await expect(
      extractListing(url, { fetcher, lookup: PUBLIC_IP }),
    ).rejects.toMatchObject({ code: 'fetch_blocked' });
  });

  it('follows a single legitimate redirect within the cap', async () => {
    const html = `<!doctype html><meta property="og:title" content="Final" />`;
    const fetcher = (async (input: string | URL | Request) => {
      const requested =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (requested === 'https://short.example/abc') {
        return new Response('', {
          status: 302,
          headers: { Location: 'https://canonical.example/listing/123' },
        });
      }
      if (requested === 'https://canonical.example/listing/123') {
        return new Response(html, { status: 200 });
      }
      throw new Error(`Unexpected URL ${requested}`);
    }) as typeof fetch;
    const result = await extractListing('https://short.example/abc', {
      fetcher,
      lookup: PUBLIC_IP,
    });
    expect(result.title).toBe('Final');
  });
});

// ===========================================================================
// Scheme allowlist on photo URLs
// ===========================================================================

describe('photo URL scheme allowlist', () => {
  it('drops javascript:, data:, and file: URLs from JSON-LD image arrays', async () => {
    const url = 'https://www.example.com/listing';
    // Note: we URL-encode the data: payload so the inline `</script>` doesn't
    // terminate the surrounding <script> tag the regex parser is scanning.
    // The attack vector is the resolved scheme of the photo URL, not whether
    // the source happens to embed an HTML-looking string.
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Apartment","name":"Bad Photos",
       "offers":{"@type":"Offer","price":1000},
       "image":[
         "javascript:alert(1)",
         "data:text/plain,hi",
         "file:///etc/passwd",
         "https://ok.example.com/a.jpg"
       ]}
      </script>
    </head></html>`;
    const result = await extractListing(url, {
      fetcher: fetcherFor(url, html),
      lookup: PUBLIC_IP,
    });
    expect(result.photos).toEqual(['https://ok.example.com/a.jpg']);
  });

  it('drops javascript: from OG photos', async () => {
    const url = 'https://www.example.com/listing';
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="OG Bad Photos" />
      <meta property="og:image" content="javascript:alert(1)" />
      <meta property="og:image" content="https://ok.example.com/og.jpg" />
    </head></html>`;
    const result = await extractListing(url, {
      fetcher: fetcherFor(url, html),
      lookup: PUBLIC_IP,
    });
    expect(result.photos).toEqual(['https://ok.example.com/og.jpg']);
  });

  it('drops data: from OG photos (twitter:image fallback)', async () => {
    const url = 'https://www.example.com/listing';
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Twitter Bad Photos" />
      <meta name="twitter:image" content="data:text/plain,hi" />
    </head></html>`;
    const result = await extractListing(url, {
      fetcher: fetcherFor(url, html),
      lookup: PUBLIC_IP,
    });
    expect(result.photos).toBeUndefined();
  });
});

// ===========================================================================
// Body size cap
// ===========================================================================

describe('body size cap', () => {
  it('aborts when streamed body exceeds 5 MB', async () => {
    // Build a ReadableStream that emits 6 × 1 MB chunks. The reader-based
    // cap must trip on or before the 6th chunk and abort the controller.
    const url = 'https://www.example.com/bloat';
    const oneMb = new Uint8Array(1024 * 1024);
    oneMb.fill('A'.charCodeAt(0));
    const fetcher = (async () => {
      const stream = new ReadableStream({
        start(controller) {
          for (let i = 0; i < 6; i += 1) controller.enqueue(oneMb);
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;
    await expect(
      extractListing(url, { fetcher, lookup: PUBLIC_IP }),
    ).rejects.toMatchObject({ code: 'fetch_failed' });
  });

  it('counts BYTES, not code units, in the non-stream fallback (codex P3)', async () => {
    // Build a Response whose `body` is absent so `readBodyWithCap` takes
    // the fallback branch. The text is 3-byte glyphs ("\u{1F600}" + variants
    // would also work) so `text.length` < MAX_BODY_BYTES while
    // Buffer.byteLength('utf8') > MAX_BODY_BYTES.
    const url = 'https://www.example.com/multibyte';
    // 2.5M chars of a 3-byte UTF-8 char (≈ 7.5 MB). Stays under length=5MB.
    const big = '你'.repeat(2_500_000);
    const fetcher = (async () => {
      const res = {
        status: 200,
        ok: true,
        // No `body` property → readBodyWithCap falls back to response.text().
        text: async () => big,
        headers: new Headers(),
        url,
      } as unknown as Response;
      return res;
    }) as typeof fetch;
    await expect(
      extractListing(url, { fetcher, lookup: PUBLIC_IP }),
    ).rejects.toMatchObject({ code: 'fetch_failed' });
  });

  it('accepts a body just under the cap', async () => {
    const url = 'https://www.example.com/under';
    const small = `<!doctype html><meta property="og:title" content="Tiny" />` +
      'X'.repeat(100);
    const fetcher = (async () => {
      const enc = new TextEncoder().encode(small);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(enc);
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;
    const result = await extractListing(url, { fetcher, lookup: PUBLIC_IP });
    expect(result.title).toBe('Tiny');
  });
});

// ===========================================================================
// Prototype pollution guard
// ===========================================================================

describe('proto pollution guard', () => {
  it('drops __proto__ keys at JSON.parse time', () => {
    const html = `<script type="application/ld+json">
      {"__proto__":{"polluted":"yes"},"@type":"Apartment","name":"X","constructor":{"prototype":{"x":1}}}
    </script>`;
    const blocks = parseAllJsonLdBlocks(html);
    expect(blocks).toHaveLength(1);
    const block = blocks[0] as Record<string, unknown>;
    // The OWN property `__proto__` is gone — that's the dangerous shape.
    expect(Object.hasOwn(block, '__proto__')).toBe(false);
    expect(Object.hasOwn(block, 'constructor')).toBe(false);
    // Global prototype must remain clean (already true for JSON.parse, but
    // assert anyway as belt-and-braces).
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('preserves normal keys alongside dropped __proto__', () => {
    const html = `<script type="application/ld+json">
      {"@type":"Apartment","name":"Safe","__proto__":{"x":1}}
    </script>`;
    const blocks = parseAllJsonLdBlocks(html);
    const block = blocks[0] as Record<string, unknown>;
    expect(block['@type']).toBe('Apartment');
    expect(block.name).toBe('Safe');
    expect(Object.hasOwn(block, '__proto__')).toBe(false);
  });

  it('extracts the listing cleanly even with __proto__ payload', async () => {
    const url = 'https://www.example.com/listing';
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"__proto__":{"polluted":"yes"},"@type":"Apartment","name":"Clean",
       "address":{"@type":"PostalAddress","streetAddress":"1 Main","addressLocality":"Madison","addressRegion":"WI","postalCode":"53703"},
       "numberOfBedrooms":1,"offers":{"@type":"Offer","price":1100}}
      </script>
    </head></html>`;
    const result = await extractListing(url, {
      fetcher: fetcherFor(url, html),
      lookup: PUBLIC_IP,
    });
    expect(result.title).toBe('Clean');
    // raw_json_ld must not carry the __proto__ property either — the
    // reviver strips it before assembly.
    expect(Object.hasOwn(result.raw_json_ld!, '__proto__')).toBe(false);
  });
});

// ===========================================================================
// Length / array caps reach extractListing
// ===========================================================================

describe('output caps wired into extractListing', () => {
  it('truncates title at 500 chars when JSON-LD overflows', async () => {
    const url = 'https://www.example.com/long';
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@type":"Apartment","name":"${'T'.repeat(1000)}","offers":{"@type":"Offer","price":1}}
      </script>
    </head></html>`;
    const result = await extractListing(url, {
      fetcher: fetcherFor(url, html),
      lookup: PUBLIC_IP,
    });
    expect(result.title).toHaveLength(500);
  });

  it('caps photos at 30 even when JSON-LD lists 100', async () => {
    const url = 'https://www.example.com/manyphotos';
    const photos = Array.from(
      { length: 100 },
      (_, i) => `https://cdn.example.com/p${i}.jpg`,
    );
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      ${JSON.stringify({
        '@type': 'Apartment',
        name: 'Lots of Photos',
        offers: { '@type': 'Offer', price: 1 },
        image: photos,
      })}
      </script>
    </head></html>`;
    const result = await extractListing(url, {
      fetcher: fetcherFor(url, html),
      lookup: PUBLIC_IP,
    });
    expect(result.photos).toHaveLength(30);
  });

  it('drops out-of-range latitude (lat 12345 → no geo)', async () => {
    const url = 'https://www.example.com/badgeo';
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@type":"Apartment","name":"Bad Geo","offers":{"@type":"Offer","price":1},
       "geo":{"latitude":12345,"longitude":-89}}
      </script>
    </head></html>`;
    const result = await extractListing(url, {
      fetcher: fetcherFor(url, html),
      lookup: PUBLIC_IP,
    });
    expect(result.latitude).toBeUndefined();
    expect(result.longitude).toBeUndefined();
  });

  it('drops garbage available_from', async () => {
    const url = 'https://www.example.com/baddate';
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@type":"Apartment","name":"Bad Date","offers":{"@type":"Offer","price":1},
       "availabilityStarts":"garbage"}
      </script>
    </head></html>`;
    const result = await extractListing(url, {
      fetcher: fetcherFor(url, html),
      lookup: PUBLIC_IP,
    });
    expect(result.available_from).toBeUndefined();
  });
});
