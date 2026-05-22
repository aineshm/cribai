/**
 * SSRF defense for the listing extractor (AIN-38).
 *
 * The extractor is library-only today but is about to be wired into the
 * `addListing` LLM tool (Track C). The moment that happens, every URL the
 * LLM hands us becomes user-controlled — which means a prompt-injection or
 * a malicious listing page could direct the bot at internal services
 * (cloud metadata, local databases, RFC1918 ranges, etc).
 *
 * Defense in this module:
 *   1. Hostname → DNS resolve via `dns.promises.lookup(host, {all:true})`.
 *   2. Every resolved A/AAAA is checked against a static blocklist of
 *      loopback / RFC1918 / link-local / IPv6 ULA / IPv6 link-local ranges.
 *   3. Direct numeric IPs (`http://10.0.0.1/`) skip DNS and run the same
 *      CIDR check directly on the URL host.
 *   4. The caller is expected to use `redirect: 'manual'` and re-invoke
 *      `assertPublicHost` for each redirect's Location header.
 *
 * Out of scope (documented so reviewers don't flag it):
 *   - DNS-rebinding TOCTOU: `dns.lookup` here is decoupled from the kernel's
 *     resolve at connect time. We resolve once, validate the IPs, then
 *     `fetch` re-resolves — a hostile DNS server could return a different
 *     answer the second time. Mitigating that requires a custom dispatcher
 *     that pins the resolved IP, which is a larger refactor than this
 *     ticket's scope. AIN-38 fixes the static "resolves to private IP"
 *     case; full TOCTOU defense is a follow-up.
 *
 * No external CIDR library — the blocklist is small and static, and rolling
 * the match in-tree keeps `@campusnest/ai` free of a new prod dep.
 */

import { promises as dnsPromises } from 'node:dns';

export class SsrfBlockedError extends Error {
  readonly url: string;
  readonly reason: string;

  constructor(url: string, reason: string) {
    super(`SSRF blocked: ${reason} (${url})`);
    this.name = 'SsrfBlockedError';
    this.url = url;
    this.reason = reason;
  }
}

/**
 * Lookup function injectable by tests. Mirrors the subset of
 * `dnsPromises.lookup` we use (`{all: true}` returns `LookupAddress[]`).
 */
export type DnsLookupFn = (
  host: string,
  options: { all: true },
) => Promise<{ address: string; family: 4 | 6 }[]>;

const DEFAULT_LOOKUP: DnsLookupFn = ((host, options) =>
  dnsPromises.lookup(host, options)) as DnsLookupFn;

/**
 * Parse an IPv4 dotted-quad into a 32-bit integer. Returns `null` on any
 * malformed input. We intentionally reject non-canonical forms like
 * `010.0.0.1` (octal) and `0x7f.0.0.1` (hex) — those are valid POSIX inet_aton
 * but a vector for blocklist bypass. `dns.lookup` normalises to canonical
 * decimal already, but direct-URL paths must also be canonical.
 */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (part.length === 0 || part.length > 3) return null;
    if (!/^\d+$/.test(part)) return null;
    // Reject leading zeros (octal-style), except for the single digit '0'.
    if (part.length > 1 && part.startsWith('0')) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    result = result * 256 + n;
  }
  // Wrap into unsigned 32-bit range.
  return result >>> 0;
}

interface Cidr4 {
  base: number;
  mask: number;
  label: string;
}

function cidr4(base: string, prefix: number, label: string): Cidr4 {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) {
    throw new Error(`Invariant: invalid IPv4 base in blocklist: ${base}`);
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { base: baseInt & mask, mask, label };
}

const IPV4_BLOCKLIST: readonly Cidr4[] = [
  cidr4('0.0.0.0', 8, 'unspecified/0.0.0.0'),
  cidr4('10.0.0.0', 8, 'RFC1918 10.0.0.0/8'),
  // Carrier-grade NAT — IANA reserved (RFC 6598). Real-world ISP-owned
  // ranges that some networks use internally; a listing URL pointing here
  // can't be a public publisher (codex P2 follow-up).
  cidr4('100.64.0.0', 10, 'CGNAT 100.64.0.0/10'),
  cidr4('127.0.0.0', 8, 'loopback 127.0.0.0/8'),
  cidr4('169.254.0.0', 16, 'link-local / cloud metadata 169.254.0.0/16'),
  cidr4('172.16.0.0', 12, 'RFC1918 172.16.0.0/12'),
  // Benchmarking (RFC 2544). Not routable on the public Internet; some
  // internal lab networks reuse the range, so block defensively.
  cidr4('198.18.0.0', 15, 'benchmarking 198.18.0.0/15'),
  cidr4('192.168.0.0', 16, 'RFC1918 192.168.0.0/16'),
];

function ipv4Blocked(ip: string): string | null {
  const value = ipv4ToInt(ip);
  if (value === null) return null;
  for (const cidr of IPV4_BLOCKLIST) {
    if ((value & cidr.mask) === cidr.base) return cidr.label;
  }
  return null;
}

/**
 * Expand an IPv6 address to its 8 16-bit groups as numbers. Returns `null`
 * if the address is not parseable. Handles `::` compression and IPv4-mapped
 * suffixes like `::ffff:127.0.0.1`.
 */
function ipv6ToGroups(raw: string): number[] | null {
  let ip = raw.toLowerCase();
  // Strip zone-id suffix (`%eth0`).
  const zoneIdx = ip.indexOf('%');
  if (zoneIdx >= 0) ip = ip.slice(0, zoneIdx);

  // Handle IPv4-mapped tail, e.g. ::ffff:1.2.3.4
  const lastColon = ip.lastIndexOf(':');
  if (lastColon !== -1 && ip.slice(lastColon + 1).includes('.')) {
    const v4 = ip.slice(lastColon + 1);
    const v4int = ipv4ToInt(v4);
    if (v4int === null) return null;
    const hi = (v4int >>> 16) & 0xffff;
    const lo = v4int & 0xffff;
    ip = `${ip.slice(0, lastColon + 1)}${hi.toString(16)}:${lo.toString(16)}`;
  }

  const doubleColon = ip.indexOf('::');
  let head: string[] = [];
  let tail: string[] = [];
  if (doubleColon === -1) {
    head = ip.split(':');
  } else {
    const headPart = ip.slice(0, doubleColon);
    const tailPart = ip.slice(doubleColon + 2);
    head = headPart === '' ? [] : headPart.split(':');
    tail = tailPart === '' ? [] : tailPart.split(':');
  }

  const groups: number[] = [];
  for (const g of head) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    groups.push(parseInt(g, 16));
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  for (let i = 0; i < missing; i += 1) groups.push(0);
  for (const g of tail) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    groups.push(parseInt(g, 16));
  }

  if (groups.length !== 8) return null;
  return groups;
}

interface Cidr6 {
  prefix: number;
  base: number[];
  label: string;
  ipv4Mapped?: { mask: number; base: number };
}

function cidr6(baseStr: string, prefix: number, label: string): Cidr6 {
  const base = ipv6ToGroups(baseStr);
  if (!base) throw new Error(`Invariant: invalid IPv6 base in blocklist: ${baseStr}`);
  return { prefix, base, label };
}

const IPV6_BLOCKLIST: readonly Cidr6[] = [
  cidr6('::1', 128, 'IPv6 loopback ::1'),
  cidr6('::', 128, 'IPv6 unspecified ::'),
  cidr6('fc00::', 7, 'IPv6 ULA fc00::/7'),
  cidr6('fe80::', 10, 'IPv6 link-local fe80::/10'),
];

function ipv6Blocked(ip: string): string | null {
  const groups = ipv6ToGroups(ip);
  if (!groups) return null;

  // IPv4-mapped (::ffff:0:0/96) — extract the embedded v4 and re-check.
  // `groups[5] === 0xffff` and the upper 80 bits zero implies v4-mapped.
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    const v4 = `${(groups[6]! >>> 8) & 0xff}.${groups[6]! & 0xff}.${(groups[7]! >>> 8) & 0xff}.${groups[7]! & 0xff}`;
    const v4Hit = ipv4Blocked(v4);
    if (v4Hit) return `IPv4-mapped IPv6 → ${v4Hit}`;
  }

  for (const cidr of IPV6_BLOCKLIST) {
    if (matchesIpv6Cidr(groups, cidr)) return cidr.label;
  }
  return null;
}

function matchesIpv6Cidr(groups: number[], cidr: Cidr6): boolean {
  let bitsRemaining = cidr.prefix;
  for (let i = 0; i < 8; i += 1) {
    if (bitsRemaining <= 0) return true;
    const groupBits = Math.min(16, bitsRemaining);
    const mask = groupBits === 16 ? 0xffff : (0xffff << (16 - groupBits)) & 0xffff;
    if ((groups[i]! & mask) !== (cidr.base[i]! & mask)) return false;
    bitsRemaining -= groupBits;
  }
  return true;
}

/**
 * True when the URL's host is a bracketed IPv6 literal (`[::1]`) — needed
 * because `URL.hostname` strips the brackets.
 */
function isIpv6Literal(hostname: string): boolean {
  return hostname.includes(':');
}

/**
 * Check a single IP literal (v4 or v6 — caller doesn't need to know which)
 * against the full blocklist. Returns the blocklist label on hit, `null`
 * when the IP is publicly routable.
 */
export function ipBlocked(ip: string): string | null {
  if (ip.includes(':')) return ipv6Blocked(ip);
  return ipv4Blocked(ip);
}

/**
 * Assert that the given URL's host resolves to publicly-routable IP(s) only.
 * Throws `SsrfBlockedError` when the host (or any resolved address) hits the
 * private/loopback/link-local blocklist.
 *
 * Direct IP literals skip DNS and check the literal directly. Hostnames are
 * resolved with `{all: true}` so ALL returned A/AAAA records are validated —
 * a single private IP in the answer set is sufficient to reject.
 *
 * Empty hostnames (which can occur for unusual URL shapes) are rejected.
 */
export async function assertPublicHost(
  url: string,
  lookup: DnsLookupFn = DEFAULT_LOOKUP,
): Promise<void> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new SsrfBlockedError(url, 'unparseable URL');
  }

  if (host === '') {
    throw new SsrfBlockedError(url, 'empty hostname');
  }

  // Direct IPv6 literal — URL.hostname returns it WITH surrounding brackets,
  // e.g. `[::1]`. Strip them before CIDR matching.
  if (isIpv6Literal(host)) {
    const stripped = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    const hit = ipv6Blocked(stripped);
    if (hit) throw new SsrfBlockedError(url, `IPv6 literal in blocklist: ${hit}`);
    return;
  }

  // Direct IPv4 literal — looks like four dotted decimal groups. Note that
  // `new URL('http://010.0.0.1/').hostname` already normalises octal-style
  // input to canonical decimal (010 → 8), so by the time we see `host` here
  // every dotted-decimal is canonical.
  if (/^\d+(\.\d+){3}$/.test(host)) {
    if (ipv4ToInt(host) === null) {
      throw new SsrfBlockedError(url, `malformed IPv4 literal: ${host}`);
    }
    const hit = ipv4Blocked(host);
    if (hit) throw new SsrfBlockedError(url, `IPv4 literal in blocklist: ${hit}`);
    return;
  }

  let resolved: { address: string; family: 4 | 6 }[];
  try {
    resolved = await lookup(host, { all: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SsrfBlockedError(url, `DNS lookup failed: ${message}`);
  }

  if (resolved.length === 0) {
    throw new SsrfBlockedError(url, 'DNS returned no addresses');
  }

  for (const record of resolved) {
    const hit = record.family === 6 ? ipv6Blocked(record.address) : ipv4Blocked(record.address);
    if (hit) {
      throw new SsrfBlockedError(
        url,
        `host ${host} resolves to blocked address ${record.address} (${hit})`,
      );
    }
  }
}

/**
 * Assert that a URL string uses an allowed scheme. Returns the parsed URL on
 * success; throws `SsrfBlockedError` for anything outside `http:` / `https:`.
 *
 * Note: `new URL('javascript:alert(1)', base)` parses successfully and yields
 * `protocol === 'javascript:'`. The caller MUST gate on `.protocol`, not on
 * parse failure alone.
 */
export function assertHttpScheme(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfBlockedError(url, 'unparseable URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(url, `disallowed scheme ${parsed.protocol}`);
  }
  return parsed;
}
