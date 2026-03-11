---
phase: 05-agentic-data-pipeline-web-search
plan: 01
subsystem: scraper
tags: [zillow, craigslist, scraper, diagnostics, github-actions]

requires:
  - phase: 02-data-pipeline-and-freshness
    provides: "BaseScraper, CraigslistScraper, GooglePlacesScraper, normalizer, metrics, lifecycle"
provides:
  - "ZillowScraper extending BaseScraper with __NEXT_DATA__ HTML parsing"
  - "Per-source diagnostic reporting (SourceDiagnostic, formatDiagnosticReport)"
  - "Enhanced ScrapeMetrics with perSource breakdown and notifications count"
  - "GH Actions job summary with per-source diagnostic table"
affects: [05-02, 05-03, 06-agent-tools]

tech-stack:
  added: []
  patterns: ["__NEXT_DATA__ HTML parsing for SSR sites", "::diagnostic:: CI output prefix for structured reporting"]

key-files:
  created:
    - services/scraper/scrapers/zillow.ts
    - services/scraper/diagnostics.ts
    - services/scraper/__tests__/zillow.test.ts
    - services/scraper/__tests__/craigslist.test.ts
    - services/scraper/__tests__/run.test.ts
    - services/scraper/__tests__/diagnostics.test.ts
  modified:
    - services/scraper/scrapers/craigslist.ts
    - services/scraper/scrapers/google-places.ts
    - services/scraper/run.ts
    - services/scraper/metrics.ts
    - .github/workflows/nightly-scrape.yml
    - services/scraper/__tests__/metrics.test.ts

key-decisions:
  - "Zillow scraper uses __NEXT_DATA__ JSON extraction with JSON-LD fallback"
  - "GooglePlacesScraper removed from pipeline, file preserved for Phase 6 enrichment"
  - "Diagnostic output uses ::diagnostic:: prefix for GH Actions multiline output parsing"
  - "GOOGLE_PLACES_API_KEY removed from workflow, TAVILY_API_KEY added for future use"

patterns-established:
  - "Per-source diagnostic pattern: createDiagnostic + formatDiagnosticReport for CI visibility"
  - "Mutable metrics with immutable interface via mapped type for accumulation in loops"

requirements-completed: [DATA-04]

duration: 5min
completed: 2026-03-06
---

# Phase 05 Plan 01: Scraper Pipeline Overhaul Summary

**Zillow scraper with __NEXT_DATA__ parsing replaces Google Places, per-source diagnostic reporting for GH Actions visibility**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T18:36:20Z
- **Completed:** 2026-03-06T18:41:48Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- ZillowScraper parses __NEXT_DATA__ HTML from Zillow rental search into RawListing[]
- Google Places removed from scraper pipeline (file preserved for Phase 6 get_neighborhood_info)
- Craigslist scraper logs detailed failure diagnostics (status, URL, content-type, body-length)
- Per-source diagnostic module generates markdown tables for GH Actions job summary
- ScrapeMetrics extended with perSource breakdown and notifications count
- All 50 scraper tests passing, TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Zillow scraper, fix Craigslist, remove Google Places from pipeline** - `ff4c4a9` (feat)
2. **Task 2: Per-source diagnostic reporting and GH Actions job summary** - `9458793` (feat)

_Note: TDD tasks with RED/GREEN phases committed together for cleanliness_

## Files Created/Modified
- `services/scraper/scrapers/zillow.ts` - Zillow rental scraper with __NEXT_DATA__ parsing
- `services/scraper/diagnostics.ts` - Per-source diagnostic reporting (SourceDiagnostic, createDiagnostic, formatDiagnosticReport)
- `services/scraper/scrapers/craigslist.ts` - Enhanced error logging with status, URL, content-type, body-length
- `services/scraper/scrapers/google-places.ts` - Removed MAX_RESULTS cap, added deprecation note
- `services/scraper/run.ts` - Replaced GooglePlaces with Zillow, added diagnostic tracking per scraper
- `services/scraper/metrics.ts` - Extended ScrapeMetrics with perSource and notifications
- `.github/workflows/nightly-scrape.yml` - Removed GOOGLE_PLACES_API_KEY, added TAVILY_API_KEY, diagnostic table in summary
- `services/scraper/__tests__/zillow.test.ts` - Tests for Zillow parsing, empty data, 403 handling
- `services/scraper/__tests__/craigslist.test.ts` - Tests for 403 logging, RSS parsing without cap, empty feed warning
- `services/scraper/__tests__/run.test.ts` - Tests for buildScrapers composition
- `services/scraper/__tests__/diagnostics.test.ts` - Tests for createDiagnostic and formatDiagnosticReport
- `services/scraper/__tests__/metrics.test.ts` - Updated to include new ScrapeMetrics fields

## Decisions Made
- Zillow scraper uses __NEXT_DATA__ JSON extraction (primary) with JSON-LD fallback (secondary) -- most reliable for SSR Next.js sites
- GooglePlacesScraper removed from pipeline but file preserved with deprecation note for Phase 6 get_neighborhood_info enrichment
- Diagnostic output uses `::diagnostic::` prefix similar to existing `::metrics::` pattern for GH Actions parsing
- GOOGLE_PLACES_API_KEY removed from workflow env since scraper no longer uses it
- TAVILY_API_KEY added to workflow for future web search tool integration

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing metrics tests for new ScrapeMetrics shape**
- **Found during:** Task 2
- **Issue:** Existing metrics.test.ts created ScrapeMetrics objects without new `notifications` and `perSource` fields, causing outputMetrics to crash on `Object.entries(metrics.perSource)`
- **Fix:** Added null-safe access `metrics.perSource ?? {}` and updated test objects to include new fields
- **Files modified:** services/scraper/metrics.ts, services/scraper/__tests__/metrics.test.ts
- **Verification:** All 50 tests pass
- **Committed in:** 9458793 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for backward compatibility with existing metrics consumers. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Scraper pipeline now produces real rental listings from Zillow + Craigslist
- Per-source diagnostics provide visibility into which sources are working
- Ready for 05-02 (web search tool) and 05-03 (pipeline scheduling improvements)
- TAVILY_API_KEY secret needs to be added to GitHub repo when web search tool is implemented

---
*Phase: 05-agentic-data-pipeline-web-search*
*Completed: 2026-03-06*
