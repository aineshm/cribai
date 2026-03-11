# Claude Code Kickoff — Phase 07: Scraper Fix (Apify Two-Pass + Cheerio)

## Manual Steps BEFORE Running Claude Code

Do all of these first. Claude Code cannot do them for you.

### 1. Apify Account + Token
```bash
# Create free account at apify.com (no credit card)
# Get API token: Settings → Integrations → API token
echo "APIFY_API_TOKEN=apify_api_YOUR_TOKEN_HERE" >> apps/web/.env.local
```

### 2. Install Dependencies
```bash
pnpm --filter @campusnest/scraper add apify-client cheerio
```

### 3. Save Fixture Files
Both fixtures were created from real Apify runs. Save them to:
```
services/scraper/fixtures/apify-zillow-search.json    ← 5-listing search output (small)
services/scraper/fixtures/apify-zillow-detail.json    ← full detail output (~22K lines)
```
The search fixture is the 5-listing JSON you ran earlier. The detail fixture is the uploaded `dataset_zillow-detail-scraper_2026-03-08_19-58-53-450.json` file — copy it as-is.

### 4. Get Craigslist HTML Fixtures
Run these from your terminal and verify each file contains listing HTML (not CAPTCHA):
```bash
mkdir -p services/scraper/fixtures

curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" \
  "https://madison.craigslist.org/search/apa#search=1~gallery~0~0" \
  -o services/scraper/fixtures/craigslist-madison-apa.html

curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" \
  "https://madison.craigslist.org/search/sub#search=1~gallery~0~0" \
  -o services/scraper/fixtures/craigslist-madison-sub.html

# Check they're real HTML with listings, not a block page:
head -20 services/scraper/fixtures/craigslist-madison-apa.html
head -20 services/scraper/fixtures/craigslist-madison-sub.html
```

### 5. Copy Planning Docs
```bash
cp -r ~/Downloads/07-SCRAPER-FIX-FINAL .planning/phases/07-SCRAPER-FIX
```

### 6. Verify Everything Is in Place
```bash
# All 4 fixtures exist
ls -la services/scraper/fixtures/apify-zillow-search.json
ls -la services/scraper/fixtures/apify-zillow-detail.json
ls -la services/scraper/fixtures/craigslist-madison-apa.html
ls -la services/scraper/fixtures/craigslist-madison-sub.html

# Dependencies installed
grep "apify-client" services/scraper/package.json
grep "cheerio" services/scraper/package.json

# Env var set
grep "APIFY_API_TOKEN" apps/web/.env.local

# Planning docs in place
ls .planning/phases/07-SCRAPER-FIX/
```

---

## Option 1: Full Phase (`/gsd:quick`)

```
/gsd:quick

Phase 07: Data Pipeline Fix — Apify Two-Pass + Cheerio

Read .planning/phases/07-SCRAPER-FIX/PLAN.md for the full plan. 4 sub-plans (07-01 through 07-04). Start with 07-01.

CRITICAL CONSTRAINTS:
- normalizer.ts MUST NOT be modified. Verify: git diff services/scraper/normalizer.ts
- TWO Apify actors are used: Search Scraper (discovers URLs) → Detail Scraper (enriches with full data)
- Build field mappings from the REAL fixtures at services/scraper/fixtures/ — not guessed field names
- The detail fixture is ~22K lines — the useful fields are documented in PLAN.md's field mapping table
- Each building's floorPlans[].units[] must be flattened into individual RawListings
- Extract up to 10 image_urls per listing from galleryPhotos (800px JPEG variant)
- Deduplicate by zpid

Before writing ANY code, read these files:
1. services/scraper/scrapers/base.ts (BaseScraper + RawListing interface)
2. services/scraper/normalizer.ts (what normalizer expects — DO NOT MODIFY)
3. services/scraper/run.ts (orchestrator)
4. services/scraper/scrapers/zillow.ts (broken scraper — understand its shape)
5. services/scraper/fixtures/apify-zillow-search.json (search output — minimal fields)
6. services/scraper/fixtures/apify-zillow-detail.json (detail output — full building data, ground truth)

Start with Plan 07-01.
```

---

## Option 2: Per-Plan Prompts

### 07-01: Apify Client + Zillow Two-Pass
```
/gsd:quick

Plan 07-01: Apify Client + Zillow Two-Pass Scraper Rewrite

Context: All scrapers broken. Replacing Zillow with a two-pass Apify pipeline. apify-client already installed. Two fixture files already exist.

READ FIRST (do not skip):
- services/scraper/scrapers/base.ts → BaseScraper + RawListing interface
- services/scraper/normalizer.ts → DO NOT MODIFY
- services/scraper/scrapers/zillow.ts → broken scraper, understand its shape
- services/scraper/fixtures/apify-zillow-search.json → search output (5 listings, minimal fields)
- services/scraper/fixtures/apify-zillow-detail.json → detail output (~22K lines, full building data)

BUILD:

1. services/scraper/clients/apify.ts
   - Thin wrapper around apify-client npm package
   - TWO functions:
     a) runSearchScraper(token, searchUrl, maxItems?)
        - Actor: "maxcopell/zillow-scraper" (ID: X46xKaa20oUA1fRiP)
        - Input: { searchUrls: [{ url }], maxItems }
        - Returns: array of { address, price, imgSrc, detailUrl, statusType }
     b) runDetailScraper(token, detailUrls)
        - Actor: "maxcopell/zillow-detail-scraper"
        - Input: { startUrls: urls.map(url => ({ url })), extractBuildingUnits: "for_rent", propertyStatus: "FOR_RENT" }
        - Returns: full building data array
   - Auth via APIFY_API_TOKEN env var

2. services/scraper/scrapers/zillow.ts — REWRITE as two-pass:
   - Extends BaseScraper, scrape() returns RawListing[]
   - Step 1: Search scraper with "https://www.zillow.com/madison-wi/rentals/"
     → Extract detailUrl from each result, prepend "https://www.zillow.com" to relative URLs
   - Step 2: Detail scraper with collected URLs
     → For each building: flatten floorPlans[].units[] into individual RawListings
     → Each unit gets: beds, baths, price (minPrice), sqft from its floorPlan
     → All units share: address, coords, description, photos, amenities from parent building
     → externalId = zpid + "_" + unitNumber (or zpid + "_" + index if no unitNumber)
   - image_urls: galleryPhotos[0..9].mixedSources.jpeg[0].url (800px variant)
   - Deduplicate by zpid before flattening
   - Source = "zillow"

3. Tests (Vitest, match existing patterns):
   - services/scraper/tests/apify-client.test.ts — mock ApifyClient, test both actors
   - services/scraper/tests/zillow-apify.test.ts:
     - Load search fixture → verify URL extraction
     - Load detail fixture → verify floorPlan flattening (McKenzie Place = 2 units → 2 RawListings)
     - Verify image_urls has up to 10 entries
     - Verify dedup handles duplicate zpid entries
     - Verify normalizer accepts output

VERIFY:
- normalizer.ts unchanged: git diff services/scraper/normalizer.ts
- All tests pass
```

### 07-02: Craigslist Scraper
```
/gsd:quick

Plan 07-02: Craigslist Scraper (fetch + cheerio, free)

Context: Zillow two-pass pipeline done (07-01). Need Craigslist for summer sublets — the launch market. cheerio already installed.

READ FIRST:
- services/scraper/scrapers/base.ts → BaseScraper + RawListing
- services/scraper/normalizer.ts → DO NOT MODIFY
- services/scraper/scrapers/craigslist.ts → broken RSS scraper
- services/scraper/fixtures/craigslist-madison-apa.html → real search HTML
- services/scraper/fixtures/craigslist-madison-sub.html → real sublets HTML

BUILD:

1. Rewrite services/scraper/scrapers/craigslist.ts:
   - Use fetch with realistic headers + 2-3s delays between requests
   - Parse with cheerio (import * as cheerio from 'cheerio')
   - Target BOTH URLs:
     - https://madison.craigslist.org/search/apa (apartments)
     - https://madison.craigslist.org/search/sub (sublets — CRITICAL)
   - Parse search results for: title, price, link, date, location
   - Optionally fetch detail pages for top results to get: images, coordinates, full description
   - Map to RawListing: address from title, rent from price, externalId from posting ID, source = "craigslist"
   - Retry with exponential backoff on CL blocks

2. Tests:
   - Load HTML fixture → verify parsing produces RawListing[]
   - Verify normalizer accepts output
   - Test retry logic

VERIFY:
- normalizer.ts unchanged
- Both /apa and /sub results included
- All tests pass
```

### 07-03: Orchestrator Fixes
```
/gsd:quick

Plan 07-03: Orchestrator Fixes + CLI

Context: Zillow (07-01) and Craigslist (07-02) scrapers done. Need to wire them up and fix env loading.

FIX services/scraper/run.ts:

1. Auto-load env vars at top of file:
   import { config } from 'dotenv';
   import { resolve } from 'path';
   config({ path: resolve(__dirname, '../../apps/web/.env.local') });
   config({ path: resolve(__dirname, '../../.env') });

2. Parse CLI flags from process.argv (or use commander):
   --source zillow|craigslist|all  (default: all)
   --limit N                       (default: 500 for Zillow search step)
   --dry-run                       (parse + normalize, don't upsert)

3. Wire up new scrapers:
   - Zillow: new two-pass pipeline (clients/apify.ts → scrapers/zillow.ts)
   - Craigslist: new fetch+cheerio (scrapers/craigslist.ts) — runs BOTH /apa and /sub
   - Keep existing downstream: normalizer → upsert → price-change-detector → metrics → diagnostics

VERIFY:
- pnpm --filter @campusnest/scraper start works WITHOUT manual source
- --source zillow --limit 10 runs only Zillow
- --source craigslist runs only CL
- Default hits both
```

### 07-04: GitHub Actions + Data Load
```
/gsd:quick

Plan 07-04: GitHub Actions Update + Initial Data Load

1. Update .github/workflows/nightly-scrape.yml:
   - Add APIFY_API_TOKEN from GitHub secrets
   - Add workflow_dispatch trigger for manual runs
   - Set --limit 500 for Zillow (budget: 500 search + 500 detail = $2, within $5 free tier)
   - Keep existing: scrape → embed → fairness recalc
   - Ensure diagnostics.ts summary tables still render

2. Run initial data load:
   pnpm --filter @campusnest/scraper start --limit 500
   pnpm --filter @campusnest/ai embed

3. Verify:
   - 200+ active listings with rent, address, beds, coords, image_urls
   - Listings span full Madison metro (not just campus)
   - Embeddings generated
   - CribAI: "find me a 2BR near campus under $1200" → real results with photos
   - CribAI: "summer sublet near campus under $800" → CL results
```
