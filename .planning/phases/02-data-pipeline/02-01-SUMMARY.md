---
phase: 02-data-pipeline
plan: 01
subsystem: scraper
tags: [playwright, crawlee, stealth, photos, supabase, lifecycle]

# Dependency graph
requires:
  - phase: 01-auth-platform
    provides: Supabase schema with listings table, campus_configs, profiles
provides:
  - RawListing/NormalizedListing with photoUrls, sourceUrl, nullable rent
  - Photo extraction utility (JSON-LD > OG > carousel, max 5)
  - Stealth plugin integration (playwright-extra)
  - Metrics module with CI-friendly ::metrics:: JSON output
  - Listing lifecycle (30-day archive to listing_history, delete)
  - Migration 005 with photo_urls, source_url, nullable rent, listing_history table
affects: [02-data-pipeline, 03-search-discovery, frontend-listing-display]

# Tech tracking
tech-stack:
  added: [playwright-extra, puppeteer-extra-plugin-stealth]
  patterns: [photo-extraction-cascade, metrics-output-protocol, archive-then-delete-lifecycle]

key-files:
  created:
    - supabase/migrations/005_phase2_photos_history.sql
    - services/scraper/scrapers/photo-utils.ts
    - services/scraper/metrics.ts
    - services/scraper/lifecycle.ts
    - services/scraper/__tests__/photo-extraction.test.ts
    - services/scraper/__tests__/metrics.test.ts
    - services/scraper/__tests__/staleness.test.ts
  modified:
    - services/scraper/scrapers/base-scraper.ts
    - services/scraper/scrapers/apartments-com.ts
    - services/scraper/normalizer.ts
    - services/scraper/run.ts
    - services/scraper/package.json
    - packages/types/src/listing.ts
    - services/scraper/__tests__/normalizer.test.ts

key-decisions:
  - "Extracted extractPhotos into standalone photo-utils.ts for testability (not private class method)"
  - "Extracted metrics and lifecycle into separate modules for single-responsibility and testing"

patterns-established:
  - "Photo extraction cascade: JSON-LD > OG meta > carousel DOM with dedup and cap"
  - "Metrics output: ::metrics::{json} protocol for CI parsing"
  - "Listing lifecycle: mark inactive at 7 days, archive+delete at 30 days"

requirements-completed: [DATA-01, DATA-02, DATA-06]

# Metrics
duration: 7min
completed: 2026-03-05
---

# Phase 02 Plan 01: Scraper Enhancement Summary

**Apartments.com scraper with photo extraction (JSON-LD/OG/carousel), optional rent, stealth plugin, metrics output, and 30-day listing archive lifecycle**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-05T20:33:58Z
- **Completed:** 2026-03-05T20:41:10Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- RawListing/NormalizedListing extended with photoUrls, sourceUrl, nullable rentMonthly
- Photo extraction via 3-strategy cascade (JSON-LD > OG > carousel) with dedup and max 5 cap
- Stealth plugin integrated via playwright-extra for anti-bot evasion
- Metrics module outputs ::metrics:: JSON for CI parsing and exits non-zero on 0 listings
- Listing lifecycle: archive 30-day stale listings to listing_history then delete
- Database migration adds photo_urls, source_url, nullable rent, listing_history table with RLS
- 27 tests passing across 4 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Database migration + type updates + stealth install** - `382101b` (feat)
2. **Task 2: Photo extraction + optional rent + metrics + archive** - `21ea2dd` (feat)

_TDD flow: tests written first (RED), then implementation (GREEN), verified passing._

## Files Created/Modified
- `supabase/migrations/005_phase2_photos_history.sql` - photo_urls, source_url, nullable rent, listing_history table
- `services/scraper/scrapers/photo-utils.ts` - Standalone photo extraction with 3-strategy cascade
- `services/scraper/metrics.ts` - ScrapeMetrics interface, outputMetrics with exit-on-zero
- `services/scraper/lifecycle.ts` - archiveStaleListings (30-day archive + delete)
- `services/scraper/scrapers/base-scraper.ts` - RawListing with photoUrls, sourceUrl, nullable rent
- `services/scraper/scrapers/apartments-com.ts` - Photo extraction, optional rent, stealth plugin
- `services/scraper/normalizer.ts` - NormalizedListing with photoUrls, sourceUrl, null rent guard
- `services/scraper/run.ts` - Metrics tracking, photo_urls/source_url upsert, archive lifecycle
- `packages/types/src/listing.ts` - Zod schema with photoUrls, sourceUrl, nullable rentMonthly
- `services/scraper/__tests__/photo-extraction.test.ts` - 6 tests for photo extraction
- `services/scraper/__tests__/metrics.test.ts` - 3 tests for metrics output and exit behavior
- `services/scraper/__tests__/staleness.test.ts` - 2 tests for archive lifecycle
- `services/scraper/__tests__/normalizer.test.ts` - Extended with 4 new photo/rent tests

## Decisions Made
- Extracted extractPhotos into standalone photo-utils.ts rather than keeping as private class method for better testability with mocked Playwright Page
- Extracted metrics and lifecycle into separate modules (metrics.ts, lifecycle.ts) for single-responsibility and independent testing
- Used OG fallback only when JSON-LD yields 0 photos (not as additive source) to match research recommendation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused imports causing TypeScript errors**
- **Found during:** Task 2 (post-implementation typecheck)
- **Issue:** Unused imports (beforeEach, createMockSupabase, ScrapeMetrics type) flagged as TS6133 errors
- **Fix:** Removed unused imports from test files and run.ts
- **Files modified:** __tests__/photo-extraction.test.ts, __tests__/staleness.test.ts, run.ts
- **Verification:** pnpm typecheck passes clean
- **Committed in:** 21ea2dd (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor cleanup, no scope change.

## Issues Encountered
- Pre-existing typecheck failures in @campusnest/ai package (missing zod module declarations) -- unrelated to our changes, out of scope

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Scraper is production-ready with photo extraction, optional rent, stealth, metrics, and lifecycle management
- Ready for Plan 02 (GitHub Actions workflow enhancements) and Plan 03 (frontend freshness/photo display)
- Next.js image remotePatterns for apartments.com CDN domains will need configuration in a frontend plan

## Self-Check: PASSED

All 8 created files verified. Both task commits (382101b, 21ea2dd) confirmed in git log. 27 tests passing.

---
*Phase: 02-data-pipeline*
*Completed: 2026-03-05*
