/**
 * Page capture for the content script (AIN-72).
 *
 * The content script runs in the page context — it has direct access to
 * `document` and `location` without needing `executeScript`. This module
 * exports `capturePage`, a pure function that collects the page snapshot
 * and is independently unit-testable.
 *
 * DUPLICATION NOTE: The body of captureAndSendInline in background/index.ts
 * uses the same logic (hardcoded literals) because `executeScript` functions
 * must be self-contained with no closure references. That function is
 * intentionally NOT refactored to share this code — the duplication is safe
 * and documented in both places.
 */

import { MAX_INNER_TEXT_CHARS, MAX_IFRAMES, MAX_IFRAME_HTML_CHARS } from '../config/constants';
import type { CapturedIframe } from '../lib/messages';

export interface PageCapture {
  readonly html: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly innerText: string;
  readonly iframes: readonly CapturedIframe[];
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
    html: doc.documentElement.outerHTML,
    sourceUrl: loc.href,
    title: doc.title,
    innerText: (doc.body?.innerText ?? '').slice(0, MAX_INNER_TEXT_CHARS),
    iframes,
  };
}
