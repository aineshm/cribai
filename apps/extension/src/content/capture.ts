/**
 * Content script — injected on demand via chrome.scripting.executeScript.
 *
 * NOT declared in the manifest. The service worker injects this script into
 * the active tab only when the user clicks "Save to CribAI".
 *
 * Captures: outerHTML, current URL, and document title.
 * Sends the result back to the service worker via chrome.runtime.sendMessage.
 *
 * This file must be self-contained (no imports) because it is injected as a
 * function body by executeScript({ func: captureAndSend }).
 */

export function captureAndSend(): void {
  try {
    const html = document.documentElement.outerHTML;
    const sourceUrl = location.href;
    const title = document.title;

    chrome.runtime.sendMessage({
      type: 'PAGE_CAPTURED',
      html,
      sourceUrl,
      title,
    });
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      message: err instanceof Error ? err.message : 'Unknown capture error',
    });
  }
}
