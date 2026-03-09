---
phase: 07-scraper-fix
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - services/scraper/clients/apify.ts
  - services/scraper/scrapers/zillow.ts
  - services/scraper/scrapers/craigslist.ts
  - services/scraper/run.ts
  - services/scraper/package.json
  - services/scraper/__tests__/apify-client.test.ts
  - services/scraper/__tests__/zillow.test.ts
  - services/scraper/__tests__/craigslist.test.ts
  - .github/workflows/nightly-scrape.yml
autonomous: true
requirements: [DATA-08, DATA-09, DATA-10, DATA-11, DATA-12, DATA-13, DATA-14, DATA-15, DATA-16]
must_haves:
  truths:
    - "Zillow two-pass pipeline produces RawListing[] with beds, baths, price, sqft, coords, photos from Apify detail data"
    - "Craigslist scraper parses real HTML (not RSS) for both /apa and /sub categories"
    - "Orchestrator auto-loads env vars and accepts --source, --limit, --dry-run CLI flags"
    - "normalizer.ts is completely unmodified"
  artifacts:
    - path: "services/scraper/clients/apify.ts"
      provides: "Apify client wrapper for search + detail scrapers"
      exports: ["runSearchScraper", "runDetailScraper"]
    - path: "services/scraper/scrapers/zillow.ts"
      provides: "Two-pass Zillow scraper extending BaseScraper"
      exports: ["ZillowScraper"]
    - path: "services/scraper/scrapers/craigslist.ts"
      provides: "Cheerio-based CL scraper for /apa and /sub"
      exports: ["CraigslistScraper"]
    - path: "services/scraper/run.ts"
      provides: "Orchestrator with CLI flags and auto env loading"
  key_links:
    - from: "services/scraper/scrapers/zillow.ts"
      to: "services/scraper/clients/apify.ts"
      via: "import { runSearchScraper, runDetailScraper }"
      pattern: "runSearchScraper|runDetailScraper"
    - from: "services/scraper/run.ts"
      to: "services/scraper/scrapers/zillow.ts"
      via: "new ZillowScraper(config)"
      pattern: "ZillowScraper"
    - from: "services/scraper/scrapers/zillow.ts"
      to: "services/scraper/scrapers/base-scraper.ts"
      via: "extends BaseScraper, returns RawListing[]"
      pattern: "BaseScraper"
---

<objective>
Rewrite all broken scrapers (Zillow + Craigslist), fix the orchestrator CLI, and update GitHub Actions.

Purpose: Scrapers are the #1 product blocker -- DB has zero usable rental data. This replaces broken direct-scraping with Apify two-pass (Zillow) and cheerio HTML parsing (Craigslist).
Output: Working scraper pipeline that produces RawListing[] from both sources, with CLI control and GH Actions integration.
</objective>

<context>
@.planning/phases/07-scraper-fix/PLAN.md
@.planning/phases/07-scraper-fix/REQUIREMENTS.md
@services/scraper/scrapers/base-scraper.ts
@services/scraper/normalizer.ts (READ ONLY -- DO NOT MODIFY)
@services/scraper/fixtures/apify-zillow-search.json
@services/scraper/fixtures/apify-zillow-detail.json (22K lines -- field mapping table in PLAN.md is the reference)
@services/scraper/fixtures/craigslist-madison-apa.html
@services/scraper/fixtures/craigslist-madison-sub.html

<interfaces>
<!-- From services/scraper/scrapers/base-scraper.ts -->
```typescript
export interface RawListing {
  readonly externalId: string;
  readonly source: string;
  readonly address: string;
  readonly rentMonthly: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly amenities: readonly string[];
  readonly availableDate: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly rawData: Record<string, unknown>;
  readonly photoUrls: readonly string[];
  readonly sourceUrl: string;
}

export interface ScraperConfig {
  readonly campusId: string;
  readonly campusSlug: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusKm: number;
  readonly searchSlug?: string;
}

export abstract class BaseScraper {
  protected readonly config: ScraperConfig;
  constructor(config: ScraperConfig);
  abstract readonly source: string;
  abstract scrape(): Promise<readonly RawListing[]>;
}
```

<!-- From services/scraper/normalizer.ts — DO NOT MODIFY this file -->
```typescript
export function normalizeListing(raw: RawListing): NormalizedListing;
// Simply passes through fields with amenity normalization and rent rounding.
// No validation -- expects valid RawListing shape.
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Apify client + Zillow two-pass scraper rewrite + tests</name>
  <files>
    services/scraper/clients/apify.ts
    services/scraper/scrapers/zillow.ts
    services/scraper/__tests__/apify-client.test.ts
    services/scraper/__tests__/zillow.test.ts
  </files>
  <action>
**CRITICAL: Before writing ANY code, read these files in order:**
1. `services/scraper/scrapers/base-scraper.ts` -- RawListing interface + BaseScraper class
2. `services/scraper/normalizer.ts` -- understand expected fields (DO NOT MODIFY)
3. `services/scraper/fixtures/apify-zillow-search.json` -- 5 search results, note `detailUrl` field (already absolute URLs in fixture, but may be relative in production -- handle both)
4. `services/scraper/fixtures/apify-zillow-detail.json` -- ~22K lines. Focus on lines 4462-4570 for field mapping: `zpid`, `buildingName`, `streetAddress`, `address.city/state/zipcode`, `latitude`, `longitude`, `floorPlans[]` (each has `beds`, `baths`, `minPrice`, `sqft`, `leaseTerm`, `units[]` with `unitNumber`, `price`, `sqft`), `galleryPhotos[]` (use `mixedSources.jpeg[0].url` for 800px), `description`, `walkScore.walkscore`, `transitScore.transit_score`, `bikeScore.bikescore`, `buildingAttributes.appliances`, `bdpUrl`, `buildingPhoneNumber`, `specialOffers[0].description`

**1. Create `services/scraper/clients/apify.ts`:**
```typescript
import { ApifyClient } from 'apify-client';

export interface ZillowSearchResult {
  readonly address: string;
  readonly price: string;
  readonly imgSrc: string;
  readonly detailUrl: string;
  readonly statusType: string;
  readonly buildingName?: string;
  readonly latLong?: { latitude: number; longitude: number };
}

export interface ZillowDetailResult {
  readonly zpid: string;
  readonly buildingName: string;
  readonly streetAddress: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly address: { city: string; state: string; zipcode: string };
  readonly floorPlans: readonly FloorPlan[];
  readonly galleryPhotos: readonly GalleryPhoto[];
  readonly description: string;
  readonly bdpUrl: string;
  readonly buildingPhoneNumber?: string;
  readonly walkScore?: { walkscore: number };
  readonly transitScore?: { transit_score: number };
  readonly bikeScore?: { bikescore: number };
  readonly buildingAttributes?: { appliances?: string[]; petPolicies?: string[] };
  readonly specialOffers?: readonly { description: string }[];
  readonly isStudentHousing?: boolean;
}
// Define FloorPlan, FloorPlanUnit, GalleryPhoto interfaces matching the fixture

export async function runSearchScraper(token: string, searchUrl: string, maxItems?: number): Promise<readonly ZillowSearchResult[]>;
export async function runDetailScraper(token: string, detailUrls: string[]): Promise<readonly ZillowDetailResult[]>;
```

- Search scraper actor: `"maxcopell/zillow-scraper"` -- input: `{ searchUrls: [{ url: searchUrl }], maxItems }`
- Detail scraper actor: `"maxcopell/zillow-detail-scraper"` -- input: `{ startUrls: detailUrls.map(url => ({ url })), extractBuildingUnits: "for_rent", propertyStatus: "FOR_RENT" }`
- Both use `client.actor(actorId).call(input)` then `client.dataset(run.defaultDatasetId).listItems()` to get results
- Token from `APIFY_API_TOKEN` env var (caller passes it)

**2. Rewrite `services/scraper/scrapers/zillow.ts`:**
- Keep `extends BaseScraper`, `source = 'zillow'`
- `scrape()` method implements two-pass:
  - Step 1: `runSearchScraper(token, "https://www.zillow.com/madison-wi/rentals/", this.limit)`
    - Extract `detailUrl` from each result. If relative, prepend `"https://www.zillow.com"`. The search fixture shows absolute URLs -- handle both.
  - Step 2: `runDetailScraper(token, detailUrls)`
    - Deduplicate results by `zpid` (the fixture has 2 identical objects for zpid 452652518)
    - For each unique building, flatten `floorPlans[].units[]` into individual `RawListing` objects:
      - `externalId`: `"${zpid}_${unit.unitNumber || index}"` (e.g., "452652518_Unit MP-108")
      - `source`: `"zillow"`
      - `address`: `"${streetAddress}, ${address.city}, ${address.state} ${address.zipcode}"`
      - `rentMonthly`: `unit.price || floorPlan.minPrice` (unit price is on `units[].price`, e.g., 1750, 2410)
      - `bedrooms`: `floorPlan.beds`
      - `bathrooms`: `floorPlan.baths`
      - `sqft`: `unit.sqft || floorPlan.sqft`
      - `amenities`: from `buildingAttributes.appliances` (e.g., ["Dishwasher", "GarbageDisposal", "Washer", "Dryer"]) + petPolicies
      - `availableDate`: from `unit.availableFrom` (convert "0" to null -- means "available now" or unknown)
      - `latitude`, `longitude`: from building top-level
      - `photoUrls`: first 10 entries from `galleryPhotos[].mixedSources.jpeg[0].url` (800px JPEG variant). The fixture confirms structure: `galleryPhotos[N].mixedSources.jpeg[0].url` gives the 800px URL.
      - `sourceUrl`: `"https://www.zillow.com" + bdpUrl`
      - `rawData`: include `buildingName`, `walkScore`, `transitScore`, `bikeScore`, `specialOffers`, `buildingPhoneNumber`, `isStudentHousing`, `leaseTerm`, `scrapedAt`
- Accept optional `limit` via constructor or config (for `--limit` CLI flag). Store as `private readonly maxItems?: number`.
- Get `APIFY_API_TOKEN` from `process.env.APIFY_API_TOKEN` -- throw clear error if missing.
- Log progress: `[zillow] Search found N listings`, `[zillow] Enriching N detail URLs`, `[zillow] Produced N unit listings from M buildings`

**3. Rewrite tests:**

`__tests__/apify-client.test.ts`:
- Mock `ApifyClient` class (vi.mock('apify-client'))
- Test `runSearchScraper`: verify it calls correct actor ID, passes searchUrls input, returns parsed items
- Test `runDetailScraper`: verify it calls correct actor ID, passes startUrls with extractBuildingUnits

`__tests__/zillow.test.ts` -- COMPLETE REWRITE:
- Load REAL fixtures: `import searchFixture from '../fixtures/apify-zillow-search.json'` and `import detailFixture from '../fixtures/apify-zillow-detail.json'`
- Mock `../clients/apify.ts` (vi.mock) -- `runSearchScraper` returns search fixture, `runDetailScraper` returns detail fixture
- Set `process.env.APIFY_API_TOKEN = 'test-token'`
- Test: "extracts detail URLs from search results" -- verify 5 URLs extracted, all absolute
- Test: "flattens floorPlans into individual RawListings" -- McKenzie Place has 2 floorPlans with 1 unit each = 2 RawListings. But fixture has 2 DUPLICATE building objects (same zpid 452652518) -- after dedup, still 1 building with 2 floorPlans = 2 units
- Test: "maps fields correctly" -- first listing has beds=1, baths=1, rentMonthly=1750, sqft=772, address contains "2221 Sherman Ave"
- Test: "extracts up to 10 image URLs from galleryPhotos" -- verify photoUrls array has entries, each is a JPEG URL ending in `-d_d.jpg` (800px variant)
- Test: "includes amenities from buildingAttributes" -- verify amenities includes "Dishwasher", "Washer", etc.
- Test: "handles deduplication of same zpid" -- detail fixture has 2 identical objects, should produce same count as 1
- Test: "output passes normalizer without errors" -- import `normalizeListing`, call on each result, no throws
- Test: "handles building with no floorPlans" -- mock detail result with empty floorPlans array, should produce 0 listings (not crash)
- Test: "throws when APIFY_API_TOKEN missing" -- delete env var, verify scrape() throws

**CONSTRAINT: `services/scraper/normalizer.ts` MUST NOT be modified. Verify: `git diff services/scraper/normalizer.ts` should be empty.**
  </action>
  <verify>
    <automated>cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm --filter @campusnest/scraper test -- --run __tests__/apify-client.test.ts __tests__/zillow.test.ts && git diff services/scraper/normalizer.ts</automated>
  </verify>
  <done>
    - clients/apify.ts exports runSearchScraper + runDetailScraper
    - zillow.ts extends BaseScraper, implements two-pass via Apify
    - FloorPlan flattening produces 2 RawListings from McKenzie Place fixture (1BR@$1750 + 2BR@$2410)
    - photoUrls populated with up to 10 JPEG URLs per listing
    - Deduplication by zpid works (2 identical fixture objects produce same output as 1)
    - All RawListings pass normalizeListing() without error
    - normalizer.ts unmodified
    - All tests pass
  </done>
</task>

<task type="auto">
  <name>Task 2: Craigslist cheerio rewrite + orchestrator CLI fixes + tests</name>
  <files>
    services/scraper/scrapers/craigslist.ts
    services/scraper/run.ts
    services/scraper/package.json
    services/scraper/__tests__/craigslist.test.ts
  </files>
  <action>
**READ FIRST:**
1. `services/scraper/fixtures/craigslist-madison-apa.html` -- real CL search HTML. Structure is `<li class="cl-static-search-result">` containing `<a href="...URL...">` with child divs: `<div class="title">`, `<div class="price">$1,499</div>`, `<div class="location">4717 Eastpark Blvd, Madison, WI</div>`. Posting ID is in the URL path: `/7917794434.html`.
2. `services/scraper/fixtures/craigslist-madison-sub.html` -- same structure for sublets
3. `services/scraper/run.ts` -- current orchestrator

**1. Rewrite `services/scraper/scrapers/craigslist.ts`:**
- Keep `extends BaseScraper`, `source = 'craigslist'`
- Replace RSS parsing with fetch + cheerio HTML parsing
- Target URLs (scrape BOTH in a single `scrape()` call):
  - `https://madison.craigslist.org/search/apa` (apartments)
  - `https://madison.craigslist.org/search/sub` (sublets -- CRITICAL for summer launch)
- Use `CAMPUS_TO_CL` map (already exists) to get subdomain from campusSlug
- Fetch with realistic User-Agent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`
- Add 2-3 second delay between requests (between /apa and /sub fetches)
- Parse HTML with cheerio:
  ```typescript
  import * as cheerio from 'cheerio';
  const $ = cheerio.load(html);
  $('li.cl-static-search-result').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a').attr('href') ?? '';
    const title = $el.find('.title').text().trim();
    const priceText = $el.find('.price').text().trim();  // "$1,499"
    const location = $el.find('.location').text().trim(); // "4717 Eastpark Blvd, Madison, WI"
    const postingId = link.match(/\/(\d+)\.html/)?.[1] ?? '';
    const rent = priceText ? parseInt(priceText.replace(/[$,]/g, ''), 10) : null;
    // Parse bedrooms from title: /(\d+)\s*(?:br|bed)/i
    // Parse sqft from title: /([\d,]+)\s*ft2?/i
  });
  ```
- Map to RawListing:
  - `externalId`: `"cl_${postingId}"` (prefix with cl_ for namespace)
  - `source`: `"craigslist"`
  - `address`: from `.location` div text (the fixture shows full addresses like "4717 Eastpark Blvd, Madison, WI")
  - `rentMonthly`: parsed from `.price` div
  - `bedrooms`: parsed from title text (regex)
  - `bathrooms`: null (CL search doesn't include this)
  - `sqft`: parsed from title text (regex)
  - `amenities`: empty array (search page doesn't have amenities)
  - `availableDate`: null (not in search results)
  - `latitude`/`longitude`: null (not in search HTML -- would need detail page)
  - `photoUrls`: empty array (search page has no images in this format)
  - `sourceUrl`: the `href` from the `<a>` tag
  - `rawData`: `{ title, scrapedAt, category: 'apa'|'sub' }`
- Combine results from both /apa and /sub into a single RawListing array
- Retry logic: if fetch returns non-200, retry up to 2 times with exponential backoff (2s, 4s)
- Handle empty results gracefully (log warning, return [])

**2. Fix `services/scraper/run.ts`:**
- Add at the TOP of file (before any other imports):
  ```typescript
  import { config as dotenvConfig } from 'dotenv';
  import { resolve } from 'path';
  import { fileURLToPath } from 'url';
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  dotenvConfig({ path: resolve(__dirname, '../apps/web/.env.local') });
  dotenvConfig({ path: resolve(__dirname, '../.env') });
  ```
  Note: scraper is ESM (`"type": "module"` in package.json), so use `import.meta.url` for __dirname.
  The path from `services/scraper/` to `apps/web/.env.local` is `../../apps/web/.env.local`.
- Parse CLI flags from `process.argv`:
  ```typescript
  function parseArgs(): { source: 'zillow' | 'craigslist' | 'all'; limit: number; dryRun: boolean } {
    const args = process.argv.slice(2);
    let source: 'zillow' | 'craigslist' | 'all' = 'all';
    let limit = 500;
    let dryRun = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--source' && args[i + 1]) { source = args[i + 1] as any; i++; }
      if (args[i] === '--limit' && args[i + 1]) { limit = parseInt(args[i + 1], 10); i++; }
      if (args[i] === '--dry-run') { dryRun = true; }
    }
    return { source, limit, dryRun };
  }
  ```
- Update `buildScrapers` to accept `source` and `limit` params:
  - If `source === 'zillow'` or `'all'`: include ZillowScraper (pass `limit` to constructor)
  - If `source === 'craigslist'` or `'all'`: include CraigslistScraper
  - Keep ApartmentsComScraper gated on `ENABLE_APARTMENTS_COM`
- Pass `limit` to ZillowScraper constructor (add to constructor: `constructor(config: ScraperConfig, maxItems?: number)`)
- When `dryRun` is true: run scrapers + normalize, log results, but SKIP the Supabase upsert step. Log `[dry-run] Would upsert N listings` instead.
- Add `dotenv` to package.json dependencies: `"dotenv": "^16.4.0"`

**3. Rewrite `__tests__/craigslist.test.ts`:**
- Load REAL HTML fixtures: `import { readFileSync } from 'fs'` + `readFileSync('fixtures/craigslist-madison-apa.html', 'utf-8')`
- Mock `fetch` to return fixture HTML
- Test: "parses apartments from real HTML" -- verify produces RawListing[] with correct count (count `cl-static-search-result` in fixture)
- Test: "extracts price from .price div" -- first listing has $1,499
- Test: "extracts address from .location div" -- first listing has "4717 Eastpark Blvd, Madison, WI"
- Test: "extracts posting ID from URL" -- first listing ID is "7917794434", externalId is "cl_7917794434"
- Test: "scrapes both /apa and /sub categories" -- mock fetch to return different HTML per URL, verify combined results
- Test: "handles fetch failure with retry" -- mock fetch to fail twice then succeed
- Test: "output passes normalizer" -- import normalizeListing, verify no throws
- Test: "handles empty results page" -- mock fetch returning HTML with no cl-static-search-result elements

**CONSTRAINT: `services/scraper/normalizer.ts` MUST NOT be modified. Verify: `git diff services/scraper/normalizer.ts` should be empty.**
  </action>
  <verify>
    <automated>cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm --filter @campusnest/scraper test -- --run __tests__/craigslist.test.ts && git diff services/scraper/normalizer.ts</automated>
  </verify>
  <done>
    - Craigslist scraper uses cheerio to parse real HTML fixtures correctly
    - Both /apa and /sub categories scraped in a single scrape() call
    - Orchestrator auto-loads env from apps/web/.env.local without manual source
    - CLI flags --source, --limit, --dry-run work correctly
    - All RawListings pass normalizeListing() without error
    - normalizer.ts unmodified
    - All tests pass
  </done>
</task>

<task type="auto">
  <name>Task 3: GitHub Actions update + full test suite pass</name>
  <files>
    .github/workflows/nightly-scrape.yml
  </files>
  <action>
**Update `.github/workflows/nightly-scrape.yml`:**

1. Add `APIFY_API_TOKEN` to the "Run scraper" step env vars:
   ```yaml
   APIFY_API_TOKEN: ${{ secrets.APIFY_API_TOKEN }}
   ```

2. The `workflow_dispatch` trigger already exists (line 6). Verify it's present.

3. Update the scraper run command to include `--limit 500`:
   ```yaml
   - name: Run scraper
     id: scrape
     run: |
       OUTPUT=$(pnpm --filter @campusnest/scraper start -- --limit 500 2>&1) || EXIT_CODE=$?
       # ... rest stays the same
   ```
   Note the `--` separator so pnpm passes flags through to the script.

4. Since Zillow now uses Apify (no Playwright needed for Zillow), the Playwright install step is already conditional on `ENABLE_APARTMENTS_COM` -- leave that as-is.

5. Keep all existing downstream steps unchanged: job summary, fairness recalculation, embedding generation.

**Run full test suite to verify nothing is broken:**
```bash
pnpm --filter @campusnest/scraper test -- --run
```

**Final normalizer check:**
```bash
git diff services/scraper/normalizer.ts
```
  </action>
  <verify>
    <automated>cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm --filter @campusnest/scraper test -- --run && pnpm --filter @campusnest/scraper typecheck && git diff services/scraper/normalizer.ts</automated>
  </verify>
  <done>
    - nightly-scrape.yml has APIFY_API_TOKEN in env
    - Scraper command includes --limit 500
    - workflow_dispatch trigger present
    - Full test suite passes (all __tests__/*.test.ts)
    - TypeScript compiles without errors
    - normalizer.ts unmodified (git diff empty)
  </done>
</task>

</tasks>

<verification>
1. `pnpm --filter @campusnest/scraper test -- --run` -- all tests pass
2. `pnpm --filter @campusnest/scraper typecheck` -- no type errors
3. `git diff services/scraper/normalizer.ts` -- empty (UNMODIFIED)
4. Zillow tests load real fixtures and verify floorPlan flattening produces correct RawListing count
5. Craigslist tests load real HTML fixtures and verify cheerio parsing extracts correct fields
6. All RawListing outputs pass through normalizeListing() without errors
</verification>

<success_criteria>
- Zillow two-pass pipeline: search fixture produces detail URLs, detail fixture flattens to 2 RawListings (1BR + 2BR) with photos, coords, amenities
- Craigslist cheerio: parses real HTML for /apa and /sub, extracts price/address/posting ID
- Orchestrator: auto-loads env, supports --source/--limit/--dry-run flags
- GitHub Actions: APIFY_API_TOKEN added, --limit 500 in command
- normalizer.ts completely unmodified
- All tests pass, typecheck clean
</success_criteria>

<output>
After completion, verify with a dry run if APIFY_API_TOKEN is available:
```bash
pnpm --filter @campusnest/scraper start -- --dry-run --source zillow --limit 5
```
This confirms the full pipeline works end-to-end without writing to the database.
</output>
