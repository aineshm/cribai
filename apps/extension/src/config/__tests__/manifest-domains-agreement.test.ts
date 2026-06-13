/**
 * Asserts that the manifest.json content_scripts matches list covers every
 * host suffix in CURATED_DOMAINS, and vice versa. This is a compile-time
 * guardrail: adding a domain to one place but not the other breaks the
 * extension silently (button never mounts or manifest has dead entries).
 *
 * We parse the manifest directly so the test fails immediately when the two
 * fall out of sync, regardless of whether the build was run.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CURATED_DOMAINS } from '../curated-domains';

// ---------------------------------------------------------------------------
// Load manifest
// ---------------------------------------------------------------------------

interface ManifestContentScript {
  matches: string[];
  js: string[];
  run_at: string;
}
interface ManifestJson {
  content_scripts?: ManifestContentScript[];
}

const MANIFEST_PATH = resolve(__dirname, '../../manifest.json');

function loadManifest(): ManifestJson {
  const raw = readFileSync(MANIFEST_PATH, 'utf-8');
  return JSON.parse(raw) as ManifestJson;
}

/**
 * Extract the unique hostname suffixes from a manifest match pattern array.
 * Patterns look like `*://*.zillow.com/*` or `*://x01oncampus.com/*`.
 *
 * Extracts the hostname portion (strip leading `*.` for wildcards).
 */
function extractHostSuffixesFromMatches(matches: string[]): Set<string> {
  const suffixes = new Set<string>();
  for (const pattern of matches) {
    // Pattern: *://<host>/* or *://*.<host>/*
    const hostMatch = /^\*:\/\/(\*\.)?([^/]+)\//.exec(pattern);
    if (hostMatch?.[2]) {
      suffixes.add(hostMatch[2].toLowerCase());
    }
  }
  return suffixes;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('manifest.json content_scripts ↔ CURATED_DOMAINS agreement', () => {
  it('manifest has at least one content_scripts entry', () => {
    const manifest = loadManifest();
    expect(manifest.content_scripts).toBeDefined();
    expect(manifest.content_scripts!.length).toBeGreaterThan(0);
  });

  it('every CURATED_DOMAINS hostSuffix is covered by a manifest match pattern', () => {
    const manifest = loadManifest();
    const allMatches = (manifest.content_scripts ?? []).flatMap((cs) => cs.matches);
    const manifestSuffixes = extractHostSuffixesFromMatches(allMatches);

    for (const domain of CURATED_DOMAINS) {
      // A manifest entry covers a curated domain if it equals the hostSuffix
      // exactly (for bare domains like x01oncampus.com) OR if the manifest
      // has the wildcard form `*.zillow.com` (extracted as `zillow.com`).
      const covered = manifestSuffixes.has(domain.hostSuffix);
      expect(
        covered,
        `CURATED_DOMAINS has "${domain.hostSuffix}" but manifest has no matching pattern. ` +
          `Add "*://*.${domain.hostSuffix}/*" (or "*://${domain.hostSuffix}/*" for bare domains) to manifest.json content_scripts.`,
      ).toBe(true);
    }
  });

  it('every manifest match pattern corresponds to a CURATED_DOMAINS entry', () => {
    const manifest = loadManifest();
    const allMatches = (manifest.content_scripts ?? []).flatMap((cs) => cs.matches);
    const manifestSuffixes = extractHostSuffixesFromMatches(allMatches);
    const curatedSuffixes = new Set(CURATED_DOMAINS.map((d) => d.hostSuffix));

    for (const manifestSuffix of manifestSuffixes) {
      // Allow `www.` subdomains — they're companion entries for bare domains.
      const bare = manifestSuffix.replace(/^www\./, '');
      const covered = curatedSuffixes.has(manifestSuffix) || curatedSuffixes.has(bare);
      expect(
        covered,
        `manifest has pattern for "${manifestSuffix}" but CURATED_DOMAINS has no entry with that suffix. ` +
          `Add the domain to CURATED_DOMAINS in curated-domains.ts.`,
      ).toBe(true);
    }
  });

  it('content.js is the declared script in every content_scripts entry', () => {
    const manifest = loadManifest();
    for (const entry of manifest.content_scripts ?? []) {
      expect(entry.js).toContain('content.js');
    }
  });
});
