---
phase: 07-scraper-fix
plan: 01
subsystem: scraper
tags: [scraper, zillow, craigslist, apify, cheerio, cli]
dependency_graph:
  requires: [apify-client, cheerio]
  provides: [zillow-scraper, craigslist-scraper, orchestrator-cli]
  affects: [nightly-scrape.yml, listings-pipeline]
tech_stack:
  added: [apify-client, dotenv, cheerio-html-parsing]
  patterns: [two-pass-scraping, fixture-based-testing, cli-arg-parsing]
key_files:
  created:
    - services/scraper/clients/apify.ts
    - services/scraper/__tests__/apify-client.test.ts
  modified:
    - services/scraper/scrapers/zillow.ts
    - services/scraper/scrapers/craigslist.ts
    - services/scraper/run.ts
    - services/scraper/package.json
    - services/scraper/__tests__/zillow.test.ts
    - services/scraper/__tests__/craigslist.test.ts
    - services/scraper/tsconfig.json
    - .github/workflows/nightly-scrape.yml
decisions:
  - Apify two-pass (search + detail) replaces direct Zillow HTML scraping
  - Cheerio HTML parsing replaces Craigslist RSS parsing (RSS no longer reliable)
  - dotenv auto-loads env from apps/web/.env.local for local development
  - Dry run mode skips Supabase entirely, uses default UW-Madison config
metrics:
  duration: 7min
  completed: 2026-03-09
  tasks: 3
  files: 10
  tests: 66
---

# Quick Task 3: Phase 7 Scraper Rewrite Summary

Rewrote Zillow and Craigslist scrapers from scratch, fixed orchestrator CLI, and updated GitHub Actions -- producing working pipeline that generates RawListing[] from Apify detail data and Craigslist HTML.

## Task Completion

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Apify client + Zillow two-pass scraper | 804976f | New clients/apify.ts, rewrote zillow.ts with floorPlan flattening, 14 tests |
| 2 | Craigslist cheerio + orchestrator CLI | 09d151a | Cheerio HTML parsing for /apa and /sub, dotenv, --source/--limit/--dry-run flags, 9 tests |
| 3 | GH Actions + full suite verification | b4f25b8 | APIFY_API_TOKEN in env, --limit 500, 66 tests pass, typecheck clean |

## Key Implementation Details

### Zillow Two-Pass Pipeline
- Search scraper (`maxcopell/zillow-scraper`) finds building URLs
- Detail scraper (`maxcopell/zillow-detail-scraper`) extracts full building data
- Deduplication by zpid (fixture has 2 identical objects for zpid 452652518)
- FloorPlan flattening: each unit becomes a separate RawListing
- McKenzie Place fixture produces 2 listings: 1BR/$1750/772sqft + 2BR/$2410/1063sqft
- Up to 10 gallery photos extracted (800px JPEG variant from mixedSources.jpeg[0].url)
- Amenities from buildingAttributes.appliances + petPolicies

### Craigslist HTML Scraper
- Replaces broken RSS parsing with fetch + cheerio on real search HTML
- Scrapes both /apa (apartments) and /sub (sublets) in a single scrape() call
- Parses price from .price div, address from .location div, posting ID from URL
- Retry logic with exponential backoff (2s, 4s) on HTTP failures
- Real fixture: 349 apa listings + 40 sub listings from Madison

### Orchestrator CLI
- Auto-loads env vars from apps/web/.env.local via dotenv
- CLI flags: --source (zillow|craigslist|all), --limit N, --dry-run
- Dry run mode: runs scrapers + normalize, skips Supabase upsert entirely
- Backwards compatible with existing GH Actions pipeline

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- 66 tests passing across 10 test files
- TypeScript typecheck clean (zero errors)
- normalizer.ts completely unmodified (git diff empty)
- All RawListing outputs pass normalizeListing() without errors

## Self-Check: PASSED

All created/modified files exist, all commits verified.
