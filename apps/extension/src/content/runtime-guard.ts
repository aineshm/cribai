/**
 * Extension-context-invalidated guard (AIN-98 spec addition).
 *
 * When the extension reloads, updates, or is uninstalled, every content
 * script already injected into an open tab keeps running with a dead
 * `chrome.runtime` — `chrome.runtime.id` reads `undefined`, and calling
 * `chrome.runtime.sendMessage` throws synchronously ("Extension context
 * invalidated."). Before this guard, `content/index.ts`'s 1.5s poll
 * interval and both its `sendMessage` call sites (CHECK_SAVED on mount,
 * CONTENT_SAVE_LISTING on click) had no such check — an old tab left open
 * across a reload spammed uncaught throws into the console forever, since
 * nothing ever stopped the interval.
 *
 * Pure, no real `chrome.*` types imported — `RuntimeLike` is the minimal
 * structural shape this module needs, keeping it chrome-free/DOM-free per
 * the extension's node-env test convention (mirrors `saved-reset-timer.ts`
 * / `navigation-compare.ts`).
 */

/** The minimal shape of `chrome.runtime` this module depends on. */
export interface RuntimeLike {
  readonly id?: string;
  readonly sendMessage: (message: unknown, callback?: (response: unknown) => void) => void;
}

/**
 * Whether the extension context is still alive. `chrome.runtime.id` reads
 * as a non-empty string while the extension is active, and becomes
 * `undefined` the instant it's reloaded/updated/uninstalled — Chrome's own
 * documented signal for "this content script is now orphaned."
 */
export function isExtensionContextAlive(runtime: RuntimeLike | undefined | null): boolean {
  return Boolean(runtime?.id);
}

/**
 * Send a message via `runtime.sendMessage`, but never let a dead extension
 * context throw uncaught into the console.
 *
 * Checks `isExtensionContextAlive` FIRST (skips the call entirely when
 * already dead — cheaper and avoids relying on the throw), and additionally
 * wraps the call in try/catch (Chrome can invalidate the context in the
 * gap between the check and the call). Either path calls `onDead()` instead
 * of `callback` — the caller is responsible for tearing down (stopping the
 * poll interval, unmounting the button) so this never fires repeatedly.
 */
export function safeSendMessage<TMessage, TResponse = unknown>(
  runtime: RuntimeLike | undefined | null,
  message: TMessage,
  callback: (response: TResponse) => void,
  onDead: () => void,
): void {
  if (!isExtensionContextAlive(runtime)) {
    onDead();
    return;
  }
  try {
    runtime!.sendMessage(message, callback as (response: unknown) => void);
  } catch {
    onDead();
  }
}
