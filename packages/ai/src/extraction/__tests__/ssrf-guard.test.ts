/**
 * Tests for the SSRF guard (AIN-38).
 *
 * The guard runs at two seams:
 *   1. `assertPublicHost(url)` — DNS-resolves the host (or evaluates a literal
 *      IP) and rejects anything in the private/loopback/link-local blocklist.
 *   2. `assertHttpScheme(url)` — gates URLs to `http:` / `https:` only.
 *
 * DNS rebinding TOCTOU is intentionally out of scope (documented in the
 * helper); these tests confirm static "public host resolves to private IP"
 * rejection.
 */

import { describe, it, expect } from 'vitest';

import {
  SsrfBlockedError,
  assertHttpScheme,
  assertPublicHost,
  ipBlocked,
  type DnsLookupFn,
} from '../ssrf-guard';

function lookup(addresses: { address: string; family: 4 | 6 }[]): DnsLookupFn {
  return (async () => addresses) as DnsLookupFn;
}

describe('ipBlocked', () => {
  it.each([
    ['10.0.0.1', 'RFC1918'],
    ['10.255.255.255', 'RFC1918'],
    ['172.16.0.1', 'RFC1918'],
    ['172.31.255.255', 'RFC1918'],
    ['192.168.1.1', 'RFC1918'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.255', 'loopback'],
    ['169.254.169.254', 'link-local'],
    ['0.0.0.0', 'unspecified'],
    // codex P2 follow-up: CGNAT + benchmarking.
    ['100.64.0.0', 'CGNAT'],
    ['100.127.255.255', 'CGNAT'],
    ['198.18.0.1', 'benchmarking'],
    ['198.19.255.255', 'benchmarking'],
  ])('flags %s as %s', (ip, label) => {
    const hit = ipBlocked(ip);
    expect(hit).not.toBeNull();
    expect(hit).toContain(label);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '142.250.190.46',
    '172.15.255.255',
    '172.32.0.1',
    // Just outside the expanded CGNAT + benchmarking blocks — must pass.
    '100.63.255.255',
    '100.128.0.0',
    '198.17.255.255',
    '198.20.0.0',
  ])('leaves %s alone (publicly routable)', (ip) => {
    expect(ipBlocked(ip)).toBeNull();
  });

  it.each([
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fc00::1', 'ULA'],
    ['fd12:3456::1', 'ULA'],
    ['fe80::1', 'link-local'],
  ])('flags IPv6 %s as %s', (ip, label) => {
    const hit = ipBlocked(ip);
    expect(hit).not.toBeNull();
    expect(hit).toContain(label);
  });

  it('flags IPv4-mapped IPv6 of loopback', () => {
    const hit = ipBlocked('::ffff:127.0.0.1');
    expect(hit).not.toBeNull();
    expect(hit).toContain('loopback');
  });

  it('flags IPv4-mapped IPv6 of cloud metadata', () => {
    const hit = ipBlocked('::ffff:169.254.169.254');
    expect(hit).not.toBeNull();
    expect(hit).toContain('link-local');
  });

  it('leaves publicly-routable IPv6 alone', () => {
    expect(ipBlocked('2001:4860:4860::8888')).toBeNull();
  });

  it('rejects octal-style IPv4 (010.0.0.1) as malformed → null', () => {
    // We don't accept non-canonical IPv4. Return null (caller decides) — the
    // direct-IP path in `assertPublicHost` will treat it as malformed.
    expect(ipBlocked('010.0.0.1')).toBeNull();
  });
});

describe('assertHttpScheme', () => {
  it.each(['http://example.com', 'https://example.com/path?q=1'])(
    'accepts %s',
    (url) => {
      expect(() => assertHttpScheme(url)).not.toThrow();
    },
  );

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'gopher://example.com/',
  ])('rejects %s', (url) => {
    expect(() => assertHttpScheme(url)).toThrow(SsrfBlockedError);
  });

  it('rejects unparseable URLs', () => {
    expect(() => assertHttpScheme('not a url')).toThrow(SsrfBlockedError);
  });
});

describe('assertPublicHost — DNS-resolved hosts', () => {
  it('accepts a public IP in the lookup result', async () => {
    await expect(
      assertPublicHost('https://example.com/foo', lookup([{ address: '142.250.190.46', family: 4 }])),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['10.0.0.1', 4 as const],
    ['172.16.0.1', 4 as const],
    ['192.168.1.1', 4 as const],
    ['127.0.0.1', 4 as const],
    ['169.254.169.254', 4 as const],
    ['0.0.0.0', 4 as const],
  ])('blocks DNS rebinding to private %s', async (address, family) => {
    await expect(
      assertPublicHost('https://attacker.example/', lookup([{ address, family }])),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it.each([
    ['::1', 6 as const],
    ['fc00::1', 6 as const],
    ['fe80::1', 6 as const],
  ])('blocks DNS rebinding to private IPv6 %s', async (address, family) => {
    await expect(
      assertPublicHost('https://attacker.example/', lookup([{ address, family }])),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('blocks when ANY resolved address is private (mixed answer set)', async () => {
    // Hostile DNS sometimes returns the real public IP first then a private
    // one — a permissive checker that only looks at the first record would
    // miss this. We require every record to be public.
    await expect(
      assertPublicHost(
        'https://mixed.example/',
        lookup([
          { address: '8.8.8.8', family: 4 },
          { address: '10.0.0.1', family: 4 },
        ]),
      ),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('blocks IPv4-mapped private IPv6 returned in the answer', async () => {
    await expect(
      assertPublicHost('https://attacker.example/', lookup([{ address: '::ffff:127.0.0.1', family: 6 }])),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('rejects when DNS returns no addresses', async () => {
    await expect(
      assertPublicHost('https://nothing.example/', lookup([])),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('rejects when DNS lookup throws', async () => {
    const failingLookup: DnsLookupFn = (async () => {
      throw new Error('ENOTFOUND');
    }) as DnsLookupFn;
    await expect(assertPublicHost('https://nothing.example/', failingLookup)).rejects.toMatchObject({
      name: 'SsrfBlockedError',
    });
  });
});

describe('assertPublicHost — default lookup', () => {
  it('uses the real DNS resolver when no lookup is injected (smoke test)', async () => {
    // The default lookup hits node:dns. We don't assert on the resolved IP
    // (it changes), only that the call completes without throwing for a
    // host that is guaranteed to resolve to a public address. The function
    // would already raise `SsrfBlockedError` if anything went wrong, so a
    // bare `.resolves` is sufficient signal.
    //
    // localhost resolves to 127.0.0.1 — assert the failure path.
    await expect(assertPublicHost('http://localhost/')).rejects.toBeInstanceOf(SsrfBlockedError);
  });
});

describe('assertPublicHost — direct IP literals', () => {
  it.each([
    'http://10.0.0.1/',
    'http://127.0.0.1:8080/',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.1.1/',
    'http://0.0.0.0/',
  ])('blocks direct private IPv4 literal %s', async (url) => {
    await expect(assertPublicHost(url, lookup([]))).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it.each(['http://[::1]/', 'http://[fc00::1]/', 'http://[fe80::1]/'])(
    'blocks direct private IPv6 literal %s',
    async (url) => {
      await expect(assertPublicHost(url, lookup([]))).rejects.toBeInstanceOf(SsrfBlockedError);
    },
  );

  it('normalises octal-form IPv4 via URL (010.0.0.1 → 8.0.0.1 = public)', async () => {
    // `new URL('http://010.0.0.1/').hostname` already canonicalises 010 to 8,
    // so the SSRF guard sees 8.0.0.1 which is public. The dangerous
    // alternative — bypassing the blocklist via octal — is impossible because
    // URL is the only entrypoint that produces `host`. Documented here so a
    // future refactor doesn't accidentally route a raw hostname around URL.
    await expect(assertPublicHost('http://010.0.0.1/', lookup([]))).resolves.toBeUndefined();
  });

  it('blocks malformed IPv4 literal (999.0.0.0)', async () => {
    await expect(assertPublicHost('http://999.0.0.0/', lookup([]))).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('accepts a public IPv4 literal directly (no DNS needed)', async () => {
    // We pass an empty-lookup that throws if invoked — proves the direct
    // path doesn't hit DNS.
    const noLookup: DnsLookupFn = (async () => {
      throw new Error('lookup must not be called for IP literals');
    }) as DnsLookupFn;
    await expect(assertPublicHost('http://8.8.8.8/', noLookup)).resolves.toBeUndefined();
  });

  it('rejects empty hostname', async () => {
    // `http:///path` parses but has an empty hostname — reject defensively.
    await expect(assertPublicHost('http:///', lookup([]))).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('rejects unparseable URL', async () => {
    await expect(assertPublicHost('not a url', lookup([]))).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });
});
