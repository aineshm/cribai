# Phase 2: Data Pipeline - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Reliable scraping of real UW Madison listings from Apartments.com with photo collection, nightly GitHub Actions automation with failure alerting, and freshness tracking with staleness UX. No new listing sources (Phase 5), no semantic search (Phase 3), no saved listings (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Photo Handling
- Scrape up to 5 photos per listing (hero + key interior shots)
- Hero image displays on listing cards in search results
- Multiple photos display on listing detail pages
- If a listing has few/no photos, show what's available + link to the source listing URL for more
- Keep it simple — no placeholder image complexity
- Storage approach: Claude's discretion (URL-only vs download — research tradeoffs)

### Failure Alerting
- Use GitHub Actions built-in email notifications for scrape failures (zero extra infra)
- Add GitHub Actions job summary with formatted report card (listings upserted, stale marked, errors)
- 0 listings scraped = treat as failure (exit non-zero) — likely means blocked or selectors broke
- Threshold: any listings > 0 is success, no configurable minimum per campus

### Staleness UX
- 7-day threshold for marking listings as stale (keep current)
- Stale listings shown in a separate "possibly outdated" collapsible section, not mixed with active results
- All listings (active and stale) show freshness indicator: "Last verified: X days ago"
- Archive price metadata (address, rent, dates, campus) to a lightweight history table before deletion
- Delete full listing rows after 30 days stale — keeps DB lean
- Price history metadata preserved for future predictive analytics

### Scraper Resilience
- Basic stealth: random delays, realistic user-agent, headless with stealth plugin (Crawlee handles most)
- No proxy rotation for Phase 2 — add if blocked
- Save partial listings: address is required minimum, rent is optional (flag as incomplete data)
- Single bounding-box search strategy for now — expand strategies in Phase 5
- Current retry config (2 retries, 20 req/min) kept unless research suggests changes

### Claude's Discretion
- Photo storage mechanism (URL-only vs Supabase Storage — research and recommend)
- Stealth plugin choice and configuration details
- Incomplete listing display treatment
- Archive table schema design
- Job summary formatting

</decisions>

<specifics>
## Specific Ideas

- "The AI IS the product" — listings feed into CribAI, so data quality directly impacts the AI experience
- Link to source listing URL when photos are limited — lets users see more on Apartments.com directly
- Future: CribAI could verify if a stale listing is still available via on-demand web check (new AI tool — deferred)
- Future: show relative rent prices compared to similar properties in past years for listings with missing rent

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `services/scraper/scrapers/apartments-com.ts`: Full Crawlee/Playwright scraper — needs photo extraction added
- `services/scraper/scrapers/base-scraper.ts`: `RawListing` interface — needs photo fields added
- `services/scraper/normalizer.ts`: Amenity normalization with 12 tests — extend for photos
- `services/scraper/run.ts`: Orchestrator with Supabase upsert and 7-day stale marking — needs metrics, archiving, photo handling
- `.github/workflows/nightly-scrape.yml`: Cron workflow exists (2am CT) — needs alerting and job summary

### Established Patterns
- Crawlee `PlaywrightCrawler` with SEARCH/DETAIL label routing — extend for photo extraction on DETAIL pages
- Supabase upsert on `(external_id, source)` unique constraint — works for incremental updates
- `campus_configs` table has `scrape_radius_km` and `location` — drives scraper config
- Service role key for scraper DB operations (bypasses RLS)

### Integration Points
- `listings` table: needs photo column(s) added via migration
- `listings` table: `is_active`, `first_seen_at`, `last_seen_at` exist — freshness tracking partially built
- New `listing_history` table needed for price archive before deletion
- `run.ts` creates Supabase client with service role — reuse for archive operations

</code_context>

<deferred>
## Deferred Ideas

- CribAI on-demand listing verification tool — check if a stale listing is still live by visiting source URL (new AI tool, future phase)
- Relative rent pricing — show how a listing's rent compares to similar properties historically (future analytics)
- Multiple Apartments.com search strategies (zip code, city name) — Phase 5 scope
- Proxy rotation and advanced anti-bot — add only if basic stealth proves insufficient
- Configurable staleness threshold per campus — overkill for single-campus launch
- Predictive pricing analytics using archived price data — v2 PM-side feature

</deferred>

---

*Phase: 02-data-pipeline*
*Context gathered: 2026-03-05*
