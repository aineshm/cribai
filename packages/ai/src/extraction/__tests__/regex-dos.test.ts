/**
 * Regex-DoS hardening pins (AIN-62 review fix — security HIGH).
 *
 * Crafted hostile inputs that, pre-fix, drove quadratic regex backtracking
 * (measured on this branch before the fix):
 *
 *   - `SCRIPT_TAG_REGEX` (json-ld.ts): repeated `<script ` with no closing
 *     `>` rescanned O(n) per start position — 48.5s at 512KB, extrapolating
 *     to ~80min at the 5MB cap.
 *   - `MONEY_RANGE` / `COUNT_RANGE` (dom.ts, via sites/zillow.ts labeled-DOM
 *     regexes): a 100KB digit wall backtracked ~68s through the pipeline.
 *   - `prune-html.ts` strip + comment patterns: same `<tag[\s\S]*?</tag>`
 *     lazy shape — 6.6s / 12.1s at 512KB.
 *
 * All inputs are synthetic `.repeat()` strings — no fixtures.
 *
 * NOTE on the pin mechanism: vitest's `testTimeout` CANNOT interrupt
 * synchronously-blocking regex execution (the timer only fires once the sync
 * work yields), so each test asserts an explicit wall-clock budget instead.
 * Post-fix these complete in tens of milliseconds; the 2s budget leaves wide
 * CI headroom while sitting 20-50x below the pre-fix times.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { extractListingFromHtml, parseAllJsonLdBlocks, pruneHtml } from '../index';
import type { LlmExtractor } from '../types';

/** Wall-clock budget per hostile input. Pre-fix times were 6.6s-97s. */
const BUDGET_MS = 2_000;

function expectFast<T>(fn: () => T): T {
  const start = performance.now();
  const result = fn();
  expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  return result;
}

async function expectFastAsync<T>(fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  return result;
}

describe('regex DoS hardening (crafted hostile inputs)', () => {
  beforeEach(() => {
    // Deterministically disable the credentialed LLM rare path.
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parseAllJsonLdBlocks: 512KB of repeated unterminated "<script " yields [] within budget', () => {
    const wall = '<script '.repeat((512 * 1024) / 8);
    const blocks = expectFast(() => parseAllJsonLdBlocks(wall));
    expect(blocks).toEqual([]);
  });

  it('parseAllJsonLdBlocks: 512KB of terminated "<script >" openers (no closers) yields [] within budget', () => {
    const wall = '<script >'.repeat((512 * 1024) / 9);
    const blocks = expectFast(() => parseAllJsonLdBlocks(wall));
    expect(blocks).toEqual([]);
  });

  it('extractListingFromHtml: 512KB unterminated-script wall runs the full pipeline (incl. pruneHtml via injected LLM) within budget', async () => {
    const wall = '<script '.repeat((512 * 1024) / 8);
    // Injected stub forces the LLM branch so `pruneHtml` runs on the wall.
    const llmExtractor: LlmExtractor = async () => ({});
    await expectFastAsync(() =>
      expect(
        extractListingFromHtml(wall, 'https://listings.example.com/hostile', { llmExtractor }),
      ).rejects.toMatchObject({ name: 'ExtractionError', code: 'no_listing_data' }),
    );
  });

  it('extractListingFromHtml: 100KB digit wall through the Zillow labeled-DOM path within budget', async () => {
    const wall = '9'.repeat(100 * 1024);
    await expectFastAsync(() =>
      expect(
        extractListingFromHtml(wall, 'https://www.zillow.com/homedetails/hostile_zpid/'),
      ).rejects.toMatchObject({ name: 'ExtractionError', code: 'no_listing_data' }),
    );
  });

  it('pruneHtml: 512KB of "<script >" openers with no closing tags completes within budget', () => {
    const wall = '<script >'.repeat((512 * 1024) / 9);
    const pruned = expectFast(() => pruneHtml(wall));
    // Nothing strippable (no closing tags) — output is the byte-capped input.
    expect(pruned.startsWith('<script >')).toBe(true);
  });

  it('pruneHtml: 512KB of unterminated "<!-- " comment openers completes within budget', () => {
    const wall = '<!-- '.repeat((512 * 1024) / 5);
    const pruned = expectFast(() => pruneHtml(wall));
    expect(pruned.startsWith('<!--')).toBe(true);
  });
});
