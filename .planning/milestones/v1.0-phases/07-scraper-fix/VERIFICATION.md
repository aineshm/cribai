# Phase 07 Verification

## Pre-Verification (before starting any plan)

- [ ] Apify account created (free, no credit card)
- [ ] `APIFY_API_TOKEN` env var set in `apps/web/.env.local`
- [ ] `apify-client` and `cheerio` installed: `pnpm --filter @campusnest/scraper add apify-client cheerio`
- [ ] Search fixture exists: `services/scraper/fixtures/apify-zillow-search.json` (5 listings)
- [ ] Detail fixture exists: `services/scraper/fixtures/apify-zillow-detail.json` (~22K lines, full building data)
- [ ] Craigslist fixtures exist: `craigslist-madison-apa.html` and `craigslist-madison-sub.html`
- [ ] Can read `services/scraper/scrapers/base.ts` — understand `BaseScraper` + `RawListing`
- [ ] Can read `services/scraper/normalizer.ts` — understand expected fields

## 07-01 Verification: Apify Client + Zillow Two-Pass Pipeline

### Apify Client
- [ ] `services/scraper/clients/apify.ts` exists and exports typed functions
- [ ] `runSearchScraper()` calls `maxcopell/zillow-scraper` (ID: `X46xKaa20oUA1fRiP`)
- [ ] `runDetailScraper()` calls `maxcopell/zillow-detail-scraper`
- [ ] Detail scraper input uses `extractBuildingUnits: "for_rent"` and `propertyStatus: "FOR_RENT"`
- [ ] Auth via `APIFY_API_TOKEN` env var

### Two-Pass Pipeline
- [ ] `zillow.ts` extends `BaseScraper`
- [ ] Step 1: calls search scraper, extracts `detailUrl` from results, prepends `https://www.zillow.com`
- [ ] Step 2: passes detail URLs to detail scraper
- [ ] Flattens `floorPlans[].units[]` into individual `RawListing` objects
- [ ] Each RawListing has unique `externalId` (e.g., `zpid_unitNumber`)
- [ ] Deduplicates by `zpid` (handles duplicate building entries)

### Image URLs
- [ ] Extracts up to 10 photos from `galleryPhotos` array
- [ ] Uses `mixedSources.jpeg[0].url` (800px variant) when available, falls back to `.url`
- [ ] Stores as `image_urls` field (text array)
- [ ] Ignores `galleryAmenityPhotos`, `photos`, `amenityPhotos` (duplicates)

### Field Mapping (verified against detail fixture)
- [ ] `zpid` → `externalId`
- [ ] `buildingName` → `name`
- [ ] `streetAddress` → `address`
- [ ] `address.city/state/zipcode` → `city`/`state`/`zipCode`
- [ ] `latitude`/`longitude` → coordinates
- [ ] `floorPlans[].beds/baths/minPrice/sqft` → `bedrooms`/`bathrooms`/`rent`/`sqft`
- [ ] `description` → `description`
- [ ] `bdpUrl` → `sourceUrl` (with zillow.com prefix)
- [ ] `walkScore.walkscore` → `walk_score`
- [ ] `buildingAttributes.petPolicies` → `pets_allowed`
- [ ] `specialOffers[0].description` → `special_offer`
- [ ] Source hardcoded to `"zillow"`

### Tests & Normalizer
- [ ] Search fixture loads and URL extraction works
- [ ] Detail fixture loads and floorPlan flattening produces correct count (2 units for McKenzie Place)
- [ ] Output passes through `normalizer.ts` without Zod errors
- [ ] `normalizer.ts` is UNMODIFIED: `git diff services/scraper/normalizer.ts` shows nothing
- [ ] All unit tests pass: `pnpm --filter @campusnest/scraper test`

## 07-02 Verification: Craigslist Scraper

- [ ] `craigslist.ts` uses `fetch` + `cheerio` (not RSS)
- [ ] Realistic User-Agent header set
- [ ] 2–3 second delays between page fetches
- [ ] Scrapes BOTH `/apa` (apartments) AND `/sub` (sublets)
- [ ] Returns valid `RawListing[]` with: address, rent, sourceUrl, externalId, source="craigslist"
- [ ] Handles CL blocks with retry + exponential backoff
- [ ] All outputs pass `normalizer.ts` without errors
- [ ] HTML fixture-based tests pass

## 07-03 Verification: Orchestrator + CLI

- [ ] `pnpm --filter @campusnest/scraper start` works WITHOUT manual `source apps/web/.env.local`
- [ ] `--source zillow --limit 10` runs only Zillow (both search + detail passes) with 10 result cap
- [ ] `--source craigslist` runs only Craigslist (both /apa and /sub)
- [ ] `--dry-run` parses + normalizes but does NOT upsert to DB
- [ ] Default run (no flags) hits both Zillow + Craigslist
- [ ] `APIFY_API_TOKEN` loaded from env automatically
- [ ] Metrics and diagnostics output correctly

## 07-04 Verification: GitHub Actions + Data Load

- [ ] `nightly-scrape.yml` has `workflow_dispatch` trigger
- [ ] `APIFY_API_TOKEN` referenced from GitHub secrets
- [ ] `--limit 500` set for Zillow search step (budget protection)
- [ ] Manual workflow run completes successfully
- [ ] `SELECT source, count(*) FROM listings WHERE status = 'active' GROUP BY source` → 200+ total
- [ ] `SELECT count(*) FROM listings WHERE rent IS NOT NULL AND status = 'active'` → all have rent
- [ ] `SELECT count(*) FROM listings WHERE image_urls IS NOT NULL AND array_length(image_urls, 1) > 0` → 50%+ have photos
- [ ] Listings span beyond campus — Fitchburg, Middleton, etc. visible
- [ ] Embeddings: `SELECT count(*) FROM listings WHERE embedding IS NOT NULL AND status = 'active'` matches active count
- [ ] CribAI: "find me a 2BR apartment near campus under $1200" → real listings with photos
- [ ] CribAI: "summer sublet near campus under $800" → Craigslist sublet results
- [ ] `diagnostics.ts` output renders in GH Actions job summary
- [ ] All tests pass: `pnpm --filter @campusnest/scraper test`

## Final Smoke Test

```bash
# 1. Full scrape
pnpm --filter @campusnest/scraper start

# 2. Embed
pnpm --filter @campusnest/ai embed

# 3. Dev server
pnpm --filter web dev

# 4. Login with .edu email
# 5. Go to CribAI chat
# 6. Ask: "what are some affordable 1BR apartments near state street for summer?"
# 7. Verify: real listings with prices, photos, addresses returned
# 8. Click a listing — verify photo gallery shows images from image_urls
```
