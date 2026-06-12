/**
 * URL capturability guard for the CribAI extension.
 *
 * `chrome.scripting.executeScript` only works on http:/https: pages.
 * Calling it on a chrome://, chrome-extension://, about:, file://, edge://,
 * view-source:, or Web Store URL throws a raw Chrome error that would leak
 * through to the user as "Cannot access a chrome:// URL".
 *
 * This module provides a single pure predicate so the SAVE_LISTING handler
 * can short-circuit with a friendly message before ever calling executeScript.
 */

/**
 * Returns true only when the extension can inject a content script into the
 * tab. Only `http:` and `https:` pages are capturable:
 *
 * - chrome://, chrome-extension://, about:, file://, edge://, view-source:
 *   all throw "Cannot access a <scheme>:// URL" from executeScript.
 * - The Chrome Web Store (chromewebstore.google.com) blocks injection even
 *   though it is https:, so it is explicitly excluded.
 * - undefined / empty string covers tabs that have not yet loaded a URL.
 */
export function isCapturableUrl(url: string | undefined): boolean {
  if (!url) return false;

  // Only http: and https: are injectable
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }

  // Chrome Web Store blocks content-script injection even though it is https:
  // Match both the old and new Web Store hostnames.
  if (
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('https://chromewebstore.google.com')
  ) {
    return false;
  }

  return true;
}

/**
 * User-facing message shown when the active tab is not capturable.
 * Kept as a named export so popup tests can assert the exact string.
 */
export const NON_CAPTURABLE_MESSAGE =
  "This page can't be saved. Open an apartment listing page and try again.";
