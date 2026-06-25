/**
 * Page capture for the content script (AIN-72, updated AIN-76).
 *
 * The content script runs in the page context — it has direct access to
 * `document` and `location` without needing `executeScript`. This module
 * exports `capturePage` and `buildStructuredHtml`, both pure functions that
 * collect/transform the page snapshot and are independently unit-testable.
 *
 * DUPLICATION NOTE (AIN-76): The body of captureAndSendInline in
 * background/index.ts uses the same structured-capture logic (hardcoded
 * literals + inlined helpers) because `executeScript` functions must be
 * self-contained with no closure references. That function is intentionally
 * NOT refactored to share this code — the duplication is safe and documented
 * in both places. Constants to keep in sync with background/index.ts:
 *
 *   MAX_INNER_TEXT_CHARS  → 200_000
 *   MAX_IFRAMES           → 10
 *   MAX_IFRAME_HTML_CHARS → 524_288
 *   MAX_BODY_CAPTURE_CHARS → 500_000   ← NEW (AIN-76)
 *
 * If you change a constant, update BOTH constants.ts AND the literal in
 * captureAndSendInline.
 */

import {
  MAX_INNER_TEXT_CHARS,
  MAX_IFRAMES,
  MAX_IFRAME_HTML_CHARS,
  MAX_BODY_CAPTURE_CHARS,
} from '../config/constants';
import { buildStructuredHtmlFromString } from '../lib/structured-html';
import type { CapturedIframe } from '../lib/messages';

export interface PageCapture {
  readonly html: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly innerText: string;
  readonly iframes: readonly CapturedIframe[];
}

/**
 * Build a compact structured HTML document from the page's `document` object.
 *
 * Delegates to `buildStructuredHtmlFromString` (lib/structured-html.ts) with
 * `doc.documentElement.outerHTML` as input. The result contains only the
 * signals the server extraction pipeline reads:
 *   - <meta>, <title>, <link rel="canonical"> from <head>
 *   - All <script type="application/ld+json"> blocks verbatim
 *   - <script id="__NEXT_DATA__"> verbatim (Next.js pages incl. Zillow)
 *   - Stripped <body> (scripts/styles/svgs removed) capped at MAX_BODY_CAPTURE_CHARS
 *
 * This reduces a 3.9 MB Zillow page to ~1.5 MB, resolving the 4 MiB
 * extension guard false-positives that blocked real listings (AIN-76).
 *
 * @param doc  The page `document` object (injectable for testing).
 */
export function buildStructuredHtml(doc: Document): string {
  return buildStructuredHtmlFromString(
    doc.documentElement?.outerHTML ?? '',
    MAX_BODY_CAPTURE_CHARS,
  );
}

/**
 * Capture the current page state.
 *
 * @param doc  The page `document` object (injectable for testing).
 * @param loc  The page `location` object (injectable for testing).
 */
export function capturePage(doc: Document, loc: Location): PageCapture {
  const iframes: CapturedIframe[] = [];
  const frames = doc.querySelectorAll('iframe');

  for (let i = 0; i < frames.length && iframes.length < MAX_IFRAMES; i++) {
    try {
      const root = frames[i]?.contentDocument?.documentElement;
      if (root) {
        iframes.push({
          src: frames[i]?.src ?? '',
          html: root.outerHTML.slice(0, MAX_IFRAME_HTML_CHARS),
        });
      }
    } catch {
      // cross-origin iframe — invisible to us by design;
      // the deep-extract mission covers it
    }
  }

  return {
    // AIN-76: structured-first capture — sends only the signals the server
    // reads (JSON-LD, OG meta, __NEXT_DATA__, stripped body) instead of
    // the full raw outerHTML. This resolves the 4 MiB guard false-positive
    // on large Zillow pages while preserving full extraction quality.
    html: buildStructuredHtml(doc),
    sourceUrl: loc.href,
    title: doc.title,
    innerText: (doc.body?.innerText ?? '').slice(0, MAX_INNER_TEXT_CHARS),
    iframes,
  };
}
