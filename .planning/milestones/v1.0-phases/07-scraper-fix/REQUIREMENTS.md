# Phase 07 Requirements

## New Requirements

| ID | Description | Plan | Status |
|----|-------------|------|--------|
| DATA-08 | Apify client wrapper supporting both Search and Detail Zillow scrapers | 07-01 | ⏳ |
| DATA-09 | Zillow two-pass pipeline: search discovers URLs, detail enriches with full data | 07-01 | ⏳ |
| DATA-10 | floorPlan flattening: one RawListing per available unit (not per building) | 07-01 | ⏳ |
| DATA-11 | image_urls extraction: up to 10 gallery photos per listing (800px JPEG variant) | 07-01 | ⏳ |
| DATA-12 | Deduplication by zpid in Zillow normalizer path | 07-01 | ⏳ |
| DATA-13 | Craigslist scraper via fetch + cheerio (incl. /sub sublets) | 07-02 | ⏳ |
| DATA-14 | Scraper CLI flags: --source, --limit, --dry-run | 07-03 | ⏳ |
| DATA-15 | Scraper auto-loads env vars without manual source command | 07-03 | ⏳ |
| DATA-16 | GitHub Actions nightly-scrape uses new scrapers + manual trigger | 07-04 | ⏳ |
| DATA-17 | 200+ active Madison listings with price, address, beds, coords, image_urls | 07-04 | ⏳ |

## Unchanged Constraint

- `normalizer.ts` MUST NOT be modified at any point during Phase 07. Verify with `git diff services/scraper/normalizer.ts` after every plan.
