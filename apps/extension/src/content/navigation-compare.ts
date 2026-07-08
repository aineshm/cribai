/**
 * SPA-navigation identity comparison (AIN-98 spec addition).
 *
 * `content/index.ts`'s `checkNavigation()` polls `location.href` every
 * 1.5s and used to compare the FULL, fragment-inclusive string, unmounting
 * and remounting the save button on ANY diff. A Zillow BUILDING page's unit
 * anchor (`#udp-<zpid>`) changes `location.href` on every unit click without
 * changing the page's actual identity — the unconditional remount cancelled
 * the 7s post-save reset timer (`saved-reset-timer.ts`) and re-fired
 * CHECK_SAVED for no reason.
 *
 * `hrefIdentity` is the fragment-EXCLUDING identity string (origin +
 * pathname + search); `shouldRemount` compares two hrefs by that identity.
 * Pure — no DOM/`chrome.*` access — so it's unit-testable on its own, same
 * convention as `saved-reset-timer.ts` / `state-machine.ts`.
 */

/**
 * The fragment-excluding identity of a URL: `origin + pathname + search`.
 * Two URLs differing ONLY by hash resolve to the same identity.
 *
 * Never throws: an unparseable `href` falls back to the raw string itself
 * (still a valid, comparable identity — just not decomposed).
 */
export function hrefIdentity(href: string): string {
  try {
    const url = new URL(href);
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return href;
  }
}

/**
 * Whether `content/index.ts` should unmount+remount the save button when
 * `location.href` changes from `oldHref` to `newHref`.
 *
 * `true` only when the fragment-excluding identity actually changed (a real
 * navigation — new page, new query). `false` for a hash-only change (e.g. a
 * unit-anchor click on the same building page) or no change at all — the
 * caller should just update its tracked `currentHref` and otherwise do
 * nothing, letting the 7s saved-reset timer and current button state
 * survive.
 */
export function shouldRemount(oldHref: string, newHref: string): boolean {
  return hrefIdentity(oldHref) !== hrefIdentity(newHref);
}
