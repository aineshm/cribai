# Phase 07: Data Pipeline Fix (Apify Two-Pass + Cheerio)

## Context

All scrapers are broken — Zillow blocks `__NEXT_DATA__` parsing, Craigslist blocks RSS feeds, Apartments.com disabled due to bot detection. DB has only stale Google Places addresses (no rental data). CribAI searches over nothing. **This is the #1 blocker for the entire product.**

## Objective

Replace broken scrapers with a **two-pass Apify pipeline** for Zillow (free tier — 2,500 results/month) and **direct HTTP + cheerio** for Craigslist (free — unlimited). End state: 200+ real greater-Madison rental listings in Supabase with prices, bedrooms, photos, coordinates, embeddings — and a nightly GitHub Actions pipeline that keeps them fresh.

## Why Two-Pass Apify Pipeline

The Zillow **Search Scraper** (`maxcopell/zillow-scraper`, ID: `X46xKaa20oUA1fRiP`) returns only minimal data: address, price, photo, detailUrl, statusType. **No bedrooms, bathrooms, coordinates, sqft, or description.** This is insufficient for CribAI.

The Zillow **Detail Scraper** (`maxcopell/zillow-detail-scraper`) takes detail URLs and returns the full building payload: floorPlans with beds/baths/price/sqft per unit, lat/lng, walkScore/transitScore/bikeScore, buildingAttributes, galleryPhotos, description, specialOffers, and more.

**Architecture:**
```
Step 1: Search Scraper → discovers listing URLs (~$2/1,000 results)
Step 2: Detail Scraper → enriches each URL with full data (~$2/1,000 results)
```

## Why Apify over Bright Data

- Apify free tier: $5/month in credits = 2,500 results/month, forever, no credit card
- Bright Data trial: 1,000 records for $7, expires in 30 days
- Apify has dedicated Zillow scrapers with JS client library (`apify-client`)
- Save Bright Data credits for AI Startup Program application later

## Geographic Scope

**NOT limited to campus zip codes.** Use a single Zillow search URL covering the full Madison metro:

```
https://www.zillow.com/madison-wi/rentals/
```

Captures: Downtown/Isthmus, Near West, Campus, South/Park St, Hilldale, Middleton, Fitchburg, Monona, Sun Prairie, Verona — everywhere along bus lines.

## Constraints

- `normalizer.ts` MUST NOT be modified — everything downstream depends on it
- `BaseScraper` abstract class and `RawListing` interface in `base.ts` define the contract
- Apify free tier = 2,500 results/month — budget: ~500 search + ~500 detail per month
- Summer sublets (Craigslist `/sub`) are the priority launch market alongside rentals
- Detail scraper may return duplicate objects for the same building — deduplicate by `zpid`

## Fixture Files (Ground Truth for Field Mapping)

Two fixture files in `services/scraper/fixtures/`:

### `apify-zillow-search.json` — Search Scraper Output (5 listings)
Minimal fields per listing:
```json
{
  "address": "2221 Sherman Ave, Madison, WI 53704",
  "price": "$1,750+/mo",
  "imgSrc": "https://photos.zillowstatic.com/...",
  "detailUrl": "/apartments/madison-wi/mckenzie-place-apartments/Cm9xTV/",
  "statusType": "FOR_RENT"
}
```
**Key insight:** No bedrooms, bathrooms, coordinates, or sqft. This is why we need the detail scraper.

### `apify-zillow-detail.json` — Detail Scraper Output (Full Building Data, ~22K lines)
Complete building payload from McKenzie Place Apartments. **CONFIRMED field paths:**

| Detail JSON path | Example value | → DB field |
|---|---|---|
| `zpid` | `"452652518"` | `external_id` (deduplicate on this) |
| `buildingName` | `"McKenzie Place Apartments"` | `name` |
| `streetAddress` | `"2221 Sherman Ave"` | `street_address` |
| `address.city` | `"Madison"` | `city` |
| `address.state` | `"WI"` | `state` |
| `address.zipcode` | `"53704"` | `zipcode` |
| `latitude` | `43.102451` | `latitude` (PostGIS) |
| `longitude` | `-89.364288` | `longitude` (PostGIS) |
| `floorPlans[].beds` | `1` | `bedrooms` |
| `floorPlans[].baths` | `1` | `bathrooms` |
| `floorPlans[].minPrice` | `1750` | `rent` |
| `floorPlans[].sqft` | `772` | `sqft` |
| `floorPlans[].leaseTerm` | `"12 months"` | `lease_term` |
| `floorPlans[].units[]` | per-unit details | one RawListing per available unit |
| `description` | full text | `description` |
| `galleryPhotos[0..9]` | photo objects | `image_urls` (text[], up to 10) |
| `galleryPhotos[].mixedSources.jpeg[0].url` | 800px JPEG | preferred photo variant |
| `walkScore.walkscore` | `67` | `walk_score` |
| `transitScore.transit_score` | `45` | `transit_score` |
| `bikeScore.bikescore` | `92` | `bike_score` |
| `buildingAttributes.petPolicies` | `["Cats","SmallDogs","LargeDogs"]` | `pets_allowed` |
| `buildingAttributes.appliances` | `["Dishwasher","Washer","Dryer"]` | `amenities` |
| `buildingAttributes.depositFeeMin` | `500` | `deposit_min` |
| `buildingAttributes.depositFeeMax` | `2410` | `deposit_max` |
| `specialOffers[0].description` | `"Look & Lease Special..."` | `special_offer` |
| `bdpUrl` | `"/apartments/madison-wi/..."` | `source_url` (prepend zillow.com) |
| `buildingPhoneNumber` | `"(608) 465-5413"` | `contact_phone` |
| `isStudentHousing` | `false` | `is_student_housing` |

**CRITICAL — floorPlan flattening:** Each building has multiple `floorPlans`, each with multiple `units`. Create **one RawListing per available unit** (not per building). If a building has a 1BR at $1,750 and a 2BR at $2,410, that's 2 RawListings sharing the same address but different beds/baths/price/sqft. Use `zpid_unitNumber` as unique `externalId`.

**CRITICAL — image_urls:** The detail JSON has ~43 photos repeated across 4 arrays at 4 resolutions. Only extract from `galleryPhotos`, take first 10, use `mixedSources.jpeg[0].url` (800px variant) for fast loading. Store as `text[]` in DB.

**CRITICAL — deduplication:** Detail scraper test returned 2 identical objects for zpid `452652518`. In production, pass only URLs (no addresses). Normalizer should deduplicate by `zpid` regardless.

---

## Plans

### 07-01: Apify Client + Zillow Two-Pass Scraper Rewrite

**Scope:** Create Apify client wrapper, rewrite Zillow scraper as two-pass pipeline

**Key Files:**
- NEW: `services/scraper/clients/apify.ts` — wrapper for both Apify actors
- MODIFY: `services/scraper/scrapers/zillow.ts` — two-pass pipeline, keep BaseScraper interface
- NEW: `services/scraper/tests/apify-client.test.ts`
- NEW: `services/scraper/tests/zillow-apify.test.ts`
- EXISTS: `services/scraper/fixtures/apify-zillow-search.json`
- EXISTS: `services/scraper/fixtures/apify-zillow-detail.json`

**Pre-implementation (MUST DO FIRST):**
1. Read `services/scraper/scrapers/base.ts` — `BaseScraper` + `RawListing` interface
2. Read `services/scraper/normalizer.ts` — field expectations (DO NOT MODIFY)
3. Read `services/scraper/run.ts` — orchestrator flow
4. Read `services/scraper/scrapers/zillow.ts` — old scraper shape
5. Read BOTH fixture files. Build the mapper from the REAL detail response.

**Apify Client (`clients/apify.ts`):**

```typescript
import { ApifyClient } from 'apify-client';

// Search Scraper: maxcopell/zillow-scraper (ID: X46xKaa20oUA1fRiP)
//   Input: { searchUrls: [{ url }], maxItems? }
//   Output: minimal — address, price, imgSrc, detailUrl, statusType

// Detail Scraper: maxcopell/zillow-detail-scraper
//   Input: { startUrls: [{ url }], extractBuildingUnits: "for_rent", propertyStatus: "FOR_RENT" }
//   Output: full building — floorPlans, coords, amenities, photos, etc.

export async function runSearchScraper(token: string, searchUrl: string, maxItems?: number) { ... }
export async function runDetailScraper(token: string, detailUrls: string[]) { ... }
```

**Two-Pass Pipeline (`scrapers/zillow.ts`):**
```
Step 1: Search Scraper → "https://www.zillow.com/madison-wi/rentals/"
        → Extract detailUrl from each result
        → Prepend "https://www.zillow.com" to relative URLs

Step 2: Detail Scraper → pass collected detail URLs
        → For each building: flatten floorPlans[].units[] into individual RawListings
        → Extract up to 10 image_urls from galleryPhotos (800px JPEG variant)
        → Deduplicate by zpid

Step 3: Return RawListing[]
```

**Detail Scraper input (confirmed working):**
```json
{
  "startUrls": [{ "url": "https://www.zillow.com/apartments/madison-wi/mckenzie-place-apartments/Cm9xTV/" }],
  "extractBuildingUnits": "for_rent",
  "propertyStatus": "FOR_RENT"
}
```

**Tests:**
- Mock `ApifyClient` — no real API calls
- Search fixture → verify URL extraction
- Detail fixture → verify floorPlan flattening → verify RawListing[] count
- Verify image_urls extraction (first 10, 800px JPEG)
- Verify deduplication when same zpid appears twice
- Verify output passes `normalizer.ts` without Zod errors
- Edge cases: building with no floorPlans, missing coords, empty galleryPhotos

**Verification:**
- [ ] `apify-client` in `services/scraper/package.json`
- [ ] `clients/apify.ts` exports search + detail scraper functions
- [ ] `zillow.ts` extends `BaseScraper`, implements two-pass
- [ ] Both fixtures read correctly in tests
- [ ] floorPlan flattening produces correct RawListing count
- [ ] image_urls populated (up to 10 per listing)
- [ ] Output passes `normalizer.ts` without errors
- [ ] `normalizer.ts` UNMODIFIED: `git diff services/scraper/normalizer.ts` = empty
- [ ] All tests pass

---

### 07-02: Craigslist Scraper (fetch + cheerio)

**Scope:** Replace broken CL RSS scraper with direct HTTP + cheerio

**Key Files:**
- MODIFY: `services/scraper/scrapers/craigslist.ts`
- NEW: `services/scraper/tests/craigslist-http.test.ts`
- EXISTS: `services/scraper/fixtures/craigslist-madison-apa.html`
- EXISTS: `services/scraper/fixtures/craigslist-madison-sub.html`

**Approach:** Direct HTTP with realistic User-Agent + 2–3s delays. Parse with cheerio.

**Target URLs:**
- Apartments: `https://madison.craigslist.org/search/apa`
- **Sublets: `https://madison.craigslist.org/search/sub`** ← CRITICAL for summer launch
- Rooms: `https://madison.craigslist.org/search/roo` (optional)

**CL → RawListing mapping (verify against HTML fixture):**
```
title text               →  address
span.priceinfo           →  rent (parse number)
data-latitude            →  latitude (detail page)
data-longitude           →  longitude (detail page)
gallery images           →  image_urls (detail page)
posting URL              →  sourceUrl
posting ID               →  externalId ("cl_XXXXXXXXXX")
parse from title/body    →  bedrooms (regex: /(\d+)\s*br/i)
parse from title/body    →  bathrooms (regex: /(\d+)\s*ba/i)
"craigslist"             →  source
posting body             →  description
```

**Verification:**
- [ ] Returns valid `RawListing[]` from both `/apa` AND `/sub`
- [ ] Handles empty results, CL blocks (retry w/ backoff), incomplete listings
- [ ] All outputs pass `normalizer.ts`
- [ ] HTML fixture tests pass

---

### 07-03: Orchestrator Fixes + CLI

**Scope:** Fix env loading, add CLI flags, wire up new scrapers

**Key Files:**
- MODIFY: `services/scraper/run.ts`
- MODIFY: `services/scraper/package.json`

**Changes:**
1. Auto-load env vars from `apps/web/.env.local` and project root `.env` via `dotenv`
2. Add `APIFY_API_TOKEN` to env loading
3. CLI flags: `--source zillow|craigslist|all`, `--limit N`, `--dry-run`
4. Wire up new Zillow two-pass + Craigslist scrapers
5. Include CL `/sub` in default run

**New env var:** `APIFY_API_TOKEN` (required for Zillow)

**Verification:**
- [ ] Works WITHOUT manual `source` of env file
- [ ] `--source zillow --limit 10` runs only Zillow (both passes)
- [ ] `--source craigslist` runs only CL (both /apa and /sub)
- [ ] Default run hits both
- [ ] Metrics + diagnostics output correctly

---

### 07-04: GitHub Actions + Initial Data Load

**Scope:** Update CI, run initial load, verify e2e

**Key Files:**
- MODIFY: `.github/workflows/nightly-scrape.yml`

**Updates:**
1. `APIFY_API_TOKEN` as GitHub Actions secret
2. `workflow_dispatch` trigger
3. `--limit 500` for Zillow search step (budget: 500 search + 500 detail = $2/run, fits free tier)
4. Keep: scrape → embed → fairness recalc pipeline

**Verification:**
- [ ] `workflow_dispatch` trigger works
- [ ] 200+ active listings with rent, address, beds, coords, image_urls
- [ ] Listings span full Madison metro
- [ ] Embeddings generated
- [ ] CribAI returns real results with photos for "2BR near campus under $1200"
- [ ] CL sublet results appear for "summer sublet near campus"

---

## Free Tier Budget Math

```
Apify free tier:             $5.00/month
Search scraper:  500 × $0.002 = $1.00
Detail scraper:  500 × $0.002 = $1.00
Monthly total:                  $2.00
Buffer:                         $3.00
                                ─────
Fits free tier:                 ✓

Craigslist (fetch+cheerio):  $0
Gemini embeddings:           free tier
Supabase:                    free tier
Vercel:                      free tier

Monthly cost: $0
```

## Execution Order

1. **07-01** — Apify client + Zillow two-pass (critical path)
2. **07-02** — Craigslist + sublets (launch market, free)
3. **07-03** — Orchestrator fixes + CLI
4. **07-04** — GitHub Actions + data load + e2e verify

Complete and verify each before starting the next.
