# Phase 2: Data Pipeline - Research

**Researched:** 2026-03-05
**Domain:** Web scraping (Crawlee/Playwright), GitHub Actions automation, Supabase data management
**Confidence:** HIGH

## Summary

Phase 2 extends an existing, well-structured scraper codebase. The `ApartmentsComScraper` already handles search/detail page routing, listing extraction, coordinate parsing, and amenity normalization. The `run.ts` orchestrator already upserts to Supabase and marks 7-day stale listings. The GitHub Actions workflow already runs nightly at 2am CT. The work is primarily additive: photo extraction on detail pages, metrics/alerting in the workflow, archive-before-delete for stale listings, and freshness UX on the frontend.

The biggest technical risk is photo URL reliability -- Apartments.com may use hotlink protection or CDN-scoped referrer checks that break images when displayed on CampusNest. The recommendation is to start URL-only (store photo URLs in a `text[]` column) and add Supabase Storage download as a fallback only if hotlinking fails. This avoids premature complexity and storage costs.

**Primary recommendation:** Extend the existing scraper with photo extraction via JSON-LD + CSS selectors, add `GITHUB_STEP_SUMMARY` reporting with exit-on-zero-listings, create a `listing_history` archive table, and build freshness UI components for listing cards/detail pages.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Scrape up to 5 photos per listing (hero + key interior shots)
- Hero image displays on listing cards in search results
- Multiple photos display on listing detail pages
- If a listing has few/no photos, show what's available + link to the source listing URL for more
- Keep it simple -- no placeholder image complexity
- Use GitHub Actions built-in email notifications for scrape failures (zero extra infra)
- Add GitHub Actions job summary with formatted report card (listings upserted, stale marked, errors)
- 0 listings scraped = treat as failure (exit non-zero) -- likely means blocked or selectors broke
- Threshold: any listings > 0 is success, no configurable minimum per campus
- 7-day threshold for marking listings as stale (keep current)
- Stale listings shown in a separate "possibly outdated" collapsible section, not mixed with active results
- All listings (active and stale) show freshness indicator: "Last verified: X days ago"
- Archive price metadata (address, rent, dates, campus) to a lightweight history table before deletion
- Delete full listing rows after 30 days stale -- keeps DB lean
- Price history metadata preserved for future predictive analytics
- Basic stealth: random delays, realistic user-agent, headless with stealth plugin (Crawlee handles most)
- No proxy rotation for Phase 2 -- add if blocked
- Save partial listings: address is required minimum, rent is optional (flag as incomplete data)
- Single bounding-box search strategy for now -- expand strategies in Phase 5
- Current retry config (2 retries, 20 req/min) kept unless research suggests changes

### Claude's Discretion
- Photo storage mechanism (URL-only vs Supabase Storage -- research and recommend)
- Stealth plugin choice and configuration details
- Incomplete listing display treatment
- Archive table schema design
- Job summary formatting

### Deferred Ideas (OUT OF SCOPE)
- CribAI on-demand listing verification tool
- Relative rent pricing
- Multiple Apartments.com search strategies (zip code, city name) -- Phase 5
- Proxy rotation and advanced anti-bot
- Configurable staleness threshold per campus
- Predictive pricing analytics using archived price data
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | Apartments.com scraper runs reliably against UW Madison area listings | Existing scraper works; add stealth plugin, photo extraction, optional rent, metrics tracking |
| DATA-02 | Scraper collects listing photos and stores/references them | Photo extraction via JSON-LD + carousel selectors; URL-only storage in `text[]` column; Next.js Image config for apartments.com domain |
| DATA-05 | Nightly scrape automation runs via GitHub Actions with monitoring/alerting on failures | Existing workflow extended with `GITHUB_STEP_SUMMARY`, exit-on-zero, built-in email notifications |
| DATA-06 | Stale listings are detected and marked inactive with freshness tracking | Existing 7-day stale marking + new 30-day deletion with archive; freshness indicator UI components |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| crawlee | ^3.12.0 | Web scraping framework | Already in use; handles retries, rate limiting, request queuing |
| playwright | ^1.49.0 | Browser automation | Already in use; renders JS-heavy pages like Apartments.com |
| playwright-extra | ^4.3.6 | Stealth plugin host | Required for stealth plugin integration with Crawlee |
| puppeteer-extra-plugin-stealth | ^2.11.2 | Anti-bot evasion | Works with playwright-extra; evasion techniques for headless detection |
| @supabase/supabase-js | ^2.47.0 | Database client | Already in use for upsert/stale operations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next/image | (built-in) | Image optimization | Display listing photos with lazy loading and CDN optimization |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| URL-only photo storage | Supabase Storage download | Adds storage costs (1GB free tier limit), bandwidth costs, upload complexity; only needed if hotlinking is blocked |
| playwright-extra stealth | Crawlee built-in fingerprints | Crawlee v3 has some built-in stealth; explicit stealth plugin provides stronger evasion |

**Installation:**
```bash
cd services/scraper && pnpm add playwright-extra puppeteer-extra-plugin-stealth
```

## Architecture Patterns

### Photo Storage Recommendation: URL-Only (Claude's Discretion)

**Recommendation: Store photo URLs directly in a `text[]` column on the listings table.**

Rationale:
1. **Simplicity**: No upload pipeline, no storage bucket management, no cleanup on listing deletion
2. **Cost**: Free tier gives 1GB Supabase Storage with 5GB bandwidth -- photos would consume this quickly (5 photos x ~200KB x hundreds of listings = 100MB+ per scrape cycle)
3. **Speed**: No download/upload step during scraping -- just extract URLs
4. **Risk mitigation**: If Apartments.com blocks hotlinking (returns 403 or placeholder), add a `<noscript>` fallback link to source URL, or upgrade to Supabase Storage download in a future iteration

**Fallback plan**: If images break due to hotlink protection, add a download step that fetches images during scraping and uploads to a public Supabase Storage bucket. This can be added without schema changes (URLs would point to Supabase Storage instead of Apartments.com CDN).

**Next.js Image configuration required:**
```typescript
// next.config.ts
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.apartments.com',
      },
      {
        protocol: 'https',
        hostname: 'images1.apartments.com',
      },
      {
        protocol: 'https',
        hostname: 'cdngeneral.rentcafe.com',
      },
    ],
  },
};
```
Note: Apartments.com CDN hostnames may vary. Check actual image URLs during first scrape run and update patterns accordingly.

### Photo Extraction Strategy

Apartments.com listing pages typically embed photo data in multiple places:

1. **JSON-LD structured data** (most reliable): `<script type="application/ld+json">` often contains an `image` array
2. **Carousel/gallery elements**: `.carouselInner img`, `.aspectRatioImage img`, or similar selectors
3. **Meta tags**: `<meta property="og:image">` for the hero image

**Extraction order**: JSON-LD first (structured, reliable) -> OG meta tag (hero fallback) -> carousel DOM selectors (last resort).

```typescript
// Photo extraction pattern
async function extractPhotos(page: Page, maxPhotos: number = 5): Promise<string[]> {
  const photos: string[] = [];

  // 1. Try JSON-LD
  const jsonLd = await page.locator('script[type="application/ld+json"]')
    .first().textContent({ timeout: 2_000 }).catch(() => null);
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd);
      const images = Array.isArray(data.image) ? data.image
        : data.photo?.map((p: { contentUrl?: string }) => p.contentUrl).filter(Boolean)
        : data.image ? [data.image] : [];
      photos.push(...images.slice(0, maxPhotos));
    } catch { /* ignore */ }
  }

  // 2. If not enough, try OG image
  if (photos.length < maxPhotos) {
    const ogImage = await page.locator('meta[property="og:image"]')
      .first().getAttribute('content', { timeout: 1_000 }).catch(() => null);
    if (ogImage && !photos.includes(ogImage)) {
      photos.push(ogImage);
    }
  }

  // 3. If still not enough, try carousel images
  if (photos.length < maxPhotos) {
    const imgEls = page.locator('.carouselInner img, [data-testid="photo-carousel"] img, .aspectRatioImage img');
    const count = await imgEls.count();
    for (let i = 0; i < Math.min(count, maxPhotos - photos.length); i++) {
      const src = await imgEls.nth(i).getAttribute('src').catch(() => null)
        ?? await imgEls.nth(i).getAttribute('data-src').catch(() => null);
      if (src && !photos.includes(src) && src.startsWith('http')) {
        photos.push(src);
      }
    }
  }

  return photos.slice(0, maxPhotos);
}
```

### Database Migration: Photos + Nullable Rent + Archive Table

```sql
-- Migration 003: Phase 2 - Photos, optional rent, listing history

-- 1. Add photo_urls column to listings
ALTER TABLE listings ADD COLUMN photo_urls text[] DEFAULT '{}';

-- 2. Make rent_monthly nullable (partial listings with no rent)
ALTER TABLE listings ALTER COLUMN rent_monthly DROP NOT NULL;

-- 3. Add source_url column for linking back to original listing
ALTER TABLE listings ADD COLUMN source_url text;

-- 4. Create listing_history table for price archive
CREATE TABLE listing_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id       uuid REFERENCES campus_configs(id) NOT NULL,
  external_id     text NOT NULL,
  source          text NOT NULL,
  address         text NOT NULL,
  rent_monthly    numeric,
  first_seen_at   timestamptz,
  last_seen_at    timestamptz,
  archived_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_listing_history_campus ON listing_history (campus_id, archived_at DESC);
CREATE INDEX idx_listing_history_address ON listing_history (address);

-- RLS: listing_history readable by authenticated users (for future analytics)
ALTER TABLE listing_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listing_history_select" ON listing_history
  FOR SELECT USING (
    campus_id = (SELECT campus_id FROM profiles WHERE id = auth.uid())
  );
```

### Incomplete Listing Display Treatment (Claude's Discretion)

**Recommendation:** Show incomplete listings (no rent) with a "Contact for pricing" label where rent would normally display. Add a subtle "Incomplete data" badge. Do NOT hide these listings -- they still have valuable address/location/amenity data.

```typescript
// In listing card component
const rentDisplay = listing.rent_monthly
  ? `$${listing.rent_monthly.toLocaleString()}/mo`
  : 'Contact for pricing';
```

### Stealth Configuration (Claude's Discretion)

Use `playwright-extra` with the stealth plugin. Crawlee v3 has some built-in fingerprint rotation, but the explicit stealth plugin provides stronger evasion for Apartments.com.

```typescript
import { PlaywrightCrawler } from 'crawlee';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(stealthPlugin());

const crawler = new PlaywrightCrawler({
  launchContext: {
    launcher: chromium,
    launchOptions: { headless: true },
  },
  maxRequestsPerMinute: 20,
  navigationTimeoutSecs: 30,
  maxRequestRetries: 2,
  // ... existing config
});
```

### Archive Table Schema (Claude's Discretion)

The `listing_history` table above is intentionally lightweight -- only the fields needed for future price analytics. Full `raw_data` JSON is NOT archived (too large, not needed for pricing trends). Fields: `campus_id`, `external_id`, `source`, `address`, `rent_monthly`, `first_seen_at`, `last_seen_at`, `archived_at`.

### Job Summary Formatting (Claude's Discretion)

Write a markdown report card to `$GITHUB_STEP_SUMMARY`:

```bash
echo "## Scrape Report Card" >> $GITHUB_STEP_SUMMARY
echo "| Metric | Value |" >> $GITHUB_STEP_SUMMARY
echo "|--------|-------|" >> $GITHUB_STEP_SUMMARY
echo "| Listings Upserted | ${UPSERTED} |" >> $GITHUB_STEP_SUMMARY
echo "| Stale Marked | ${STALE} |" >> $GITHUB_STEP_SUMMARY
echo "| Archived | ${ARCHIVED} |" >> $GITHUB_STEP_SUMMARY
echo "| Errors | ${ERRORS} |" >> $GITHUB_STEP_SUMMARY
```

Better approach: have `run.ts` output structured JSON metrics to stdout, then parse in the workflow step.

```typescript
// run.ts outputs metrics as last line
const metrics = { upserted: 42, staleMarked: 3, archived: 1, errors: 0 };
console.log(`::metrics::${JSON.stringify(metrics)}`);

// Exit non-zero if 0 listings scraped
if (metrics.upserted === 0) {
  console.error('FAILURE: 0 listings scraped -- likely blocked or selectors broken');
  process.exit(1);
}
```

### Scraper Run Flow (Updated)

```
1. Fetch campus configs from Supabase
2. For each campus:
   a. Build search URL with bounding box
   b. Crawl search pages, enqueue detail pages
   c. On each detail page: extract listing data + photos (up to 5)
   d. Normalize listings (including photo URLs)
   e. Upsert to DB (including photo_urls, source_url)
   f. Mark 7-day stale listings as inactive
   g. Archive 30-day stale listings to listing_history
   h. Delete archived listings from listings table
3. Output metrics JSON
4. Exit non-zero if total upserted = 0
```

### Frontend Freshness Components

```
apps/web/components/
  freshness-badge.tsx      # "Last verified: X days ago" for all listings
  stale-section.tsx        # Collapsible "Possibly outdated" section
  listing-photo-gallery.tsx # Photo carousel for detail page
```

**Freshness badge logic:**
- < 1 day: "Verified today" (green)
- 1-3 days: "Verified X days ago" (green)
- 4-6 days: "Verified X days ago" (yellow)
- 7+ days: "Possibly outdated" (red, shown in stale section)

### Recommended Project Structure Changes

```
services/scraper/
  scrapers/
    base-scraper.ts          # Add photoUrls + sourceUrl to RawListing
    apartments-com.ts        # Add extractPhotos(), make rent optional
  normalizer.ts              # Add photo normalization
  run.ts                     # Add metrics, archive, exit-on-zero

supabase/migrations/
  003_phase2_photos_history.sql  # New migration

apps/web/
  next.config.ts             # Add image remote patterns
  components/
    listing-card.tsx          # Add hero photo, freshness badge
    listing-grid.tsx          # Split active/stale sections
    freshness-badge.tsx       # New
    stale-section.tsx         # New
    listing-photo-gallery.tsx # New
  app/(campus)/[campusSlug]/
    listings/page.tsx         # Fetch stale listings separately
    listings/[id]/page.tsx    # Add photo gallery, freshness

.github/workflows/
  nightly-scrape.yml         # Add job summary, failure handling

packages/types/src/
  listing.ts                 # Add photoUrls, sourceUrl, make rentMonthly nullable
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser stealth/anti-bot | Custom user-agent rotation | `playwright-extra` + stealth plugin | Handles canvas, WebGL, navigator fingerprints, timezone, language -- dozens of detection vectors |
| Image lazy loading handling | Manual scroll/click simulation | Playwright's built-in `waitForSelector` + `data-src` fallback | Standard lazy-load patterns are well-handled by selector-based extraction |
| Date relative formatting | Custom "X days ago" logic | `Intl.RelativeTimeFormat` or a small helper | Browser-native, locale-aware |
| Job summary rendering | Custom HTML in workflow logs | `$GITHUB_STEP_SUMMARY` with markdown | Built-in GitHub Actions feature, renders on run summary page |

## Common Pitfalls

### Pitfall 1: Apartments.com Selector Breakage
**What goes wrong:** Apartments.com updates their HTML structure, breaking CSS selectors
**Why it happens:** They redesign periodically; no stable API
**How to avoid:** Use multiple fallback selectors (already done in existing code). Extract from JSON-LD first (structured data changes less often than HTML). Test with a manual scrape before deploying selector changes.
**Warning signs:** 0 listings scraped, or listings with all-null fields

### Pitfall 2: Photo URL Hotlink Blocking
**What goes wrong:** Photos display in scraper context but return 403/placeholder when loaded from CampusNest domain
**Why it happens:** CDN referrer checking blocks third-party domains
**How to avoid:** Start URL-only, test immediately. If blocked, fall back to downloading photos to Supabase Storage.
**Warning signs:** Broken image icons on listing pages, 403 errors in browser console

### Pitfall 3: Race Condition in Archive-Then-Delete
**What goes wrong:** Listing gets re-scraped between archive and delete, losing the freshly upserted data
**Why it happens:** Archive and delete run as separate queries
**How to avoid:** Use a single transaction or add a WHERE condition: only delete listings where `is_active = false AND last_seen_at < 30_days_ago`. The 30-day window makes race conditions practically impossible since re-scraped listings get `is_active = true` and updated `last_seen_at`.
**Warning signs:** Listings disappearing immediately after being scraped

### Pitfall 4: Next.js Image Domain Not Configured
**What goes wrong:** `next/image` refuses to load external images, throwing a hostname error
**Why it happens:** Next.js requires explicit `remotePatterns` for external image domains
**How to avoid:** Configure `remotePatterns` in `next.config.ts` before implementing photo display. Use wildcard `**.apartments.com` to cover subdomains.
**Warning signs:** Runtime error: "Invalid src prop on next/image, hostname not configured"

### Pitfall 5: Nullable Rent Breaking Existing Code
**What goes wrong:** Making `rent_monthly` nullable breaks existing queries, sort logic, and UI components that assume non-null rent
**Why it happens:** The column is currently `NOT NULL` and all code assumes a number
**How to avoid:** Search for all `rent_monthly` references across the codebase. Update queries to handle null (COALESCE or filter). Update UI to show "Contact for pricing" fallback.
**Warning signs:** TypeScript errors after migration, runtime null reference errors

### Pitfall 6: GitHub Actions Playwright Installation
**What goes wrong:** Playwright browsers not installed in CI, scraper fails to launch
**Why it happens:** `pnpm install` installs the npm package but not browser binaries
**How to avoid:** Add `npx playwright install chromium --with-deps` step before running scraper in GitHub Actions
**Warning signs:** "Browser closed" or "Executable not found" errors in CI logs

## Code Examples

### Extracting Photos from Apartments.com Detail Page
```typescript
// Source: Research analysis of Apartments.com page structure
private async extractPhotos(page: Page, log: Log): Promise<string[]> {
  const photos: string[] = [];
  const MAX_PHOTOS = 5;

  // Strategy 1: JSON-LD (most reliable)
  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .first()
    .textContent({ timeout: 2_000 })
    .catch(() => null);

  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd);
      const images = Array.isArray(data.image)
        ? data.image
        : data.photo?.map((p: { contentUrl?: string }) => p.contentUrl).filter(Boolean)
          ?? (data.image ? [data.image] : []);
      for (const img of images) {
        if (typeof img === 'string' && img.startsWith('http') && photos.length < MAX_PHOTOS) {
          photos.push(img);
        }
      }
    } catch {
      log.debug('Failed to parse JSON-LD for photos');
    }
  }

  // Strategy 2: OG image (hero fallback)
  if (photos.length === 0) {
    const ogImage = await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute('content', { timeout: 1_000 })
      .catch(() => null);
    if (ogImage && ogImage.startsWith('http')) {
      photos.push(ogImage);
    }
  }

  // Strategy 3: Carousel DOM elements
  if (photos.length < MAX_PHOTOS) {
    const imgEls = page.locator(
      '.carouselInner img, [data-tag_section="hero"] img, .heroImageContainer img, picture source'
    );
    const count = await imgEls.count();
    for (let i = 0; i < Math.min(count, MAX_PHOTOS * 2); i++) {
      if (photos.length >= MAX_PHOTOS) break;
      const src = await imgEls.nth(i).getAttribute('src').catch(() => null)
        ?? await imgEls.nth(i).getAttribute('data-src').catch(() => null)
        ?? await imgEls.nth(i).getAttribute('srcset')?.then(s => s?.split(' ')[0]).catch(() => null);
      if (src && src.startsWith('http') && !photos.includes(src)) {
        photos.push(src);
      }
    }
  }

  return photos;
}
```

### Metrics Output and Exit-on-Zero Pattern
```typescript
// Source: Design pattern for CI-friendly scraper output
interface ScrapeMetrics {
  readonly upserted: number;
  readonly staleMarked: number;
  readonly archived: number;
  readonly deleted: number;
  readonly errors: number;
}

function outputMetrics(metrics: ScrapeMetrics): void {
  // Structured output for GitHub Actions parsing
  console.log(`\n::set-output name=metrics::${JSON.stringify(metrics)}`);

  // Human-readable summary
  console.log('\n=== Scrape Summary ===');
  console.log(`Upserted: ${metrics.upserted}`);
  console.log(`Stale Marked: ${metrics.staleMarked}`);
  console.log(`Archived: ${metrics.archived}`);
  console.log(`Deleted: ${metrics.deleted}`);
  console.log(`Errors: ${metrics.errors}`);

  if (metrics.upserted === 0) {
    console.error('FAILURE: 0 listings scraped');
    process.exit(1);
  }
}
```

### GitHub Actions Job Summary Step
```yaml
# Source: GitHub Actions docs - GITHUB_STEP_SUMMARY
- name: Run scraper
  id: scrape
  run: pnpm --filter @campusnest/scraper start
  env:
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}

- name: Write job summary
  if: always()
  run: |
    echo "## Nightly Scrape Report" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    if [ "${{ steps.scrape.outcome }}" = "failure" ]; then
      echo "> **FAILED** - Check logs for details" >> $GITHUB_STEP_SUMMARY
    else
      echo "> **SUCCESS**" >> $GITHUB_STEP_SUMMARY
    fi
```

### Freshness Badge Component
```typescript
// Source: Design pattern
interface FreshnessBadgeProps {
  readonly lastSeenAt: string;
}

function getFreshnessLevel(lastSeenAt: string): 'fresh' | 'aging' | 'stale' {
  const days = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 3) return 'fresh';
  if (days <= 6) return 'aging';
  return 'stale';
}

function getFreshnessLabel(lastSeenAt: string): string {
  const days = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Verified today';
  if (days === 1) return 'Verified yesterday';
  return `Verified ${days} days ago`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Crawlee stealth option flag | `playwright-extra` + stealth plugin integration | Crawlee v3 | Must install separate packages; built-in fingerprints are lighter alternative |
| `::set-output` for action outputs | `$GITHUB_OUTPUT` file | GitHub Actions 2022 | Old `set-output` deprecated; write to `$GITHUB_OUTPUT` file instead |
| Next.js `domains` in image config | `remotePatterns` with glob support | Next.js 13+ | `remotePatterns` supports wildcards, more flexible |

**Deprecated/outdated:**
- `::set-output name=X::value` -- deprecated GitHub Actions command; use `echo "X=value" >> $GITHUB_OUTPUT` instead
- Next.js `images.domains` config -- replaced by `images.remotePatterns` for better security

## Open Questions

1. **Apartments.com CDN hostnames**
   - What we know: Images are served from CDN subdomains, likely `images1.apartments.com` or similar
   - What's unclear: Exact hostnames vary; may include `cdngeneral.rentcafe.com` for RentCafe-managed properties
   - Recommendation: Run initial scrape, log all photo URLs, and configure `remotePatterns` based on actual data

2. **Hotlink protection**
   - What we know: Many real estate sites use CDN-level referrer checking
   - What's unclear: Whether Apartments.com specifically blocks cross-origin image requests
   - Recommendation: Test URL-only approach first; have Supabase Storage fallback plan ready but don't build it preemptively

3. **Photo carousel selectors**
   - What we know: Apartments.com uses React-based carousel components; selectors change
   - What's unclear: Current exact selectors for photo carousel images
   - Recommendation: Prioritize JSON-LD extraction (stable); use DOM selectors as fallback with multiple selector candidates

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1 |
| Config file | `services/scraper/vitest.config.ts` |
| Quick run command | `pnpm --filter @campusnest/scraper test` |
| Full suite command | `pnpm --filter @campusnest/scraper test && pnpm --filter @campusnest/web test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | Scraper extracts listings with address (rent optional) | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/apartments-com.test.ts` | No -- Wave 0 |
| DATA-02 | Photo URLs extracted from JSON-LD, OG tags, carousel | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/photo-extraction.test.ts` | No -- Wave 0 |
| DATA-02 | Photo URLs stored in DB and normalized | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/normalizer.test.ts` | Yes (extend) |
| DATA-05 | Metrics output correctly, exit-on-zero works | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/metrics.test.ts` | No -- Wave 0 |
| DATA-06 | Stale marking at 7 days, archive at 30 days | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/staleness.test.ts` | No -- Wave 0 |
| DATA-06 | Freshness badge displays correct label and color | unit | `pnpm --filter @campusnest/web test -- --run __tests__/freshness-badge.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @campusnest/scraper test`
- **Per wave merge:** `pnpm --filter @campusnest/scraper test && pnpm --filter @campusnest/web test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `services/scraper/__tests__/photo-extraction.test.ts` -- covers DATA-02 photo extraction logic
- [ ] `services/scraper/__tests__/metrics.test.ts` -- covers DATA-05 metrics output and exit-on-zero
- [ ] `services/scraper/__tests__/staleness.test.ts` -- covers DATA-06 archive and delete logic
- [ ] `apps/web/__tests__/freshness-badge.test.ts` -- covers DATA-06 freshness display logic
- [ ] Extend `services/scraper/__tests__/normalizer.test.ts` -- add photo normalization tests

## Sources

### Primary (HIGH confidence)
- Existing codebase: `services/scraper/` -- full scraper implementation reviewed
- Existing codebase: `supabase/migrations/001_initial_schema.sql` -- listings table schema
- Existing codebase: `.github/workflows/nightly-scrape.yml` -- current workflow
- [Crawlee stealth plugin docs](https://crawlee.dev/js/docs/examples/crawler-plugins) -- playwright-extra integration pattern

### Secondary (MEDIUM confidence)
- [GitHub Actions Job Summaries](https://github.blog/news-insights/product-news/supercharging-github-actions-with-job-summaries/) -- GITHUB_STEP_SUMMARY usage
- [Supabase Storage limits](https://supabase.com/pricing) -- free tier: 1GB storage, 5GB bandwidth

### Tertiary (LOW confidence)
- Apartments.com photo selectors -- selectors may have changed; needs live validation during first scrape
- CDN hotlink behavior -- unknown; needs empirical testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use or well-documented integrations
- Architecture: HIGH - extending existing patterns, not building new architecture
- Photo extraction: MEDIUM - JSON-LD approach is sound but selectors need live validation
- Pitfalls: HIGH - based on common web scraping patterns and existing codebase analysis

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable domain; selectors may change sooner)
