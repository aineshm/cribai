/**
 * Subpage discovery for crm_deep_extract mission (AIN-71).
 *
 * Pure functions — no network, no side effects. Linear scans only to avoid
 * regex-DoS on large inputs.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** URL-path patterns that indicate housing-related subpages. */
const HOUSING_PATH_PATTERN = /(floor[-_ ]?plans?|pricing|rates|availability|units|apply)/i;

/** Maximum number of subpages returned. */
const MAX_SUBPAGES = 4;

/** Signal classes for isHousingRelated. Must match at least 2 to pass. */
const PRICE_PATTERN = /\$\s?\d{3,}/;
const BED_BATH_PATTERN = /\b(bed|bedroom|bath|studio)\b/i;
const HOUSING_NOUN_PATTERN = /\b(apartment|unit|floor\s?plan|lease|rent|sq\.?\s?ft|square\s?feet|availability|move[- ]in)\b/i;

/** Max text length processed by isHousingRelated (20k chars). */
const MAX_HOUSING_CHECK_CHARS = 20_000;

// ---------------------------------------------------------------------------
// discoverSubpages
// ---------------------------------------------------------------------------

/**
 * Extract same-registrable-domain links from HTML that look like housing
 * subpages (floor plans, pricing, rates, availability, units, apply).
 *
 * Algorithm: linear href scan — no unbounded regex quantifiers.
 * - Parse all `href` attributes
 * - Resolve against `baseUrl`
 * - Keep only same registrable-domain links (eTLD+1 approximation: same hostname)
 * - Filter by housing path pattern
 * - Strip fragments, dedupe
 * - Cap at MAX_SUBPAGES
 *
 * @param html     Page HTML to scan.
 * @param baseUrl  Base URL for resolving relative hrefs.
 * @returns Array of absolute URLs (no fragments), deduplicated, capped at 4.
 */
export function discoverSubpages(html: string, baseUrl: string): readonly string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const baseHost = stripCommonSubdomains(base.hostname.toLowerCase());
  const seen = new Set<string>();
  const results: string[] = [];

  // Linear scan for href="..." or href='...'
  let i = 0;
  while (i < html.length && results.length < MAX_SUBPAGES) {
    const hrefIdx = html.indexOf('href=', i);
    if (hrefIdx === -1) break;

    const quoteStart = hrefIdx + 5;
    const quote = html[quoteStart];
    if (quote !== '"' && quote !== "'") {
      i = quoteStart;
      continue;
    }

    const valueStart = quoteStart + 1;
    const valueEnd = html.indexOf(quote, valueStart);
    if (valueEnd === -1) {
      i = valueStart;
      continue;
    }

    const href = html.slice(valueStart, valueEnd);
    i = valueEnd + 1;

    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('#')) {
      continue;
    }

    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }

    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;

    // Same registrable domain check
    const resolvedHost = stripCommonSubdomains(resolved.hostname.toLowerCase());
    if (resolvedHost !== baseHost) continue;

    // Housing path filter
    if (!HOUSING_PATH_PATTERN.test(resolved.pathname)) continue;

    // Strip fragment, dedupe
    resolved.hash = '';
    const clean = resolved.href;
    if (seen.has(clean)) continue;
    seen.add(clean);
    results.push(clean);
  }

  return results;
}

/**
 * Strip one level of common subdomain prefixes to get a simplified host for
 * same-domain matching. Not a full eTLD+1 collapse — good enough for the
 * housing-site patterns we care about.
 */
function stripCommonSubdomains(host: string): string {
  const prefixes = ['www.', 'm.', 'cdn.', 'static.', 'assets.'];
  for (const prefix of prefixes) {
    if (host.startsWith(prefix)) {
      const candidate = host.slice(prefix.length);
      if (candidate.includes('.')) return candidate;
    }
  }
  return host;
}

// ---------------------------------------------------------------------------
// isHousingRelated
// ---------------------------------------------------------------------------

/**
 * Determine whether a page is housing-related.
 *
 * Returns true when:
 * - The extracted fields already contain a key field (rent/price, bedrooms, address), OR
 * - The text matches ≥2 distinct signal classes from: price pattern, bed/bath terms,
 *   housing nouns.
 *
 * Linear scans only; input pre-capped at 20k chars.
 *
 * @param text      Visible page text (innerText or text content).
 * @param fields    Partial extracted fields (checked for key fields first).
 */
export function isHousingRelated(
  text: string,
  fields: Partial<{ rent: number; price: number; bedrooms: number; address: string }>,
): boolean {
  // Key field shortcut — if we already extracted housing data, it's housing
  if (
    typeof fields.rent === 'number' ||
    typeof fields.price === 'number' ||
    typeof fields.bedrooms === 'number' ||
    (typeof fields.address === 'string' && fields.address.length > 0)
  ) {
    return true;
  }

  const capped = text.slice(0, MAX_HOUSING_CHECK_CHARS);
  if (!capped.trim()) return false;

  let signalClasses = 0;
  if (PRICE_PATTERN.test(capped)) signalClasses++;
  if (BED_BATH_PATTERN.test(capped)) signalClasses++;
  if (HOUSING_NOUN_PATTERN.test(capped)) signalClasses++;

  return signalClasses >= 2;
}
