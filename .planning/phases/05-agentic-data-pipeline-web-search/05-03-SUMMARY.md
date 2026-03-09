---
phase: 05-agentic-data-pipeline-web-search
plan: 03
subsystem: ui, api, database
tags: [source-citation, web-search, listing-card, supabase, migration, api-route]

# Dependency graph
requires:
  - phase: 05-01
    provides: Scraper overhaul with Zillow + Craigslist sources
  - phase: 05-02
    provides: web_search tool with Tavily API and session cache
provides:
  - Source citation display on all listing cards
  - web_search and get_saved_listings tool indicators in chat UI
  - Google Places listings marked inactive via migration
  - source field returned in search_listings results (SQL + semantic)
  - persistWebListing function for saving web-sourced listings to DB with embedding trigger
  - POST /api/save-web-listing API route for client-side save flow
  - match_listings_semantic RPC updated to return source column
affects: [06-agent-tool-expansion]

# Tech tracking
tech-stack:
  added: []
  patterns: [persist-on-save pattern for ephemeral web results, service-role upsert via API route]

key-files:
  created:
    - supabase/migrations/008_cleanup_google_places.sql
    - supabase/migrations/009_add_source_to_semantic_rpc.sql
    - packages/ai/__tests__/persist-web-listing.test.ts
    - apps/web/app/api/save-web-listing/route.ts
  modified:
    - packages/types/src/chat.ts
    - apps/web/components/listing-card.tsx
    - apps/web/components/chat/chat-tool-indicator.tsx
    - packages/ai/src/tools/handlers/search-listings.ts
    - packages/ai/src/tools/handlers/web-search.ts
    - packages/ai/src/index.ts

key-decisions:
  - "Web-sourced listings use persist-on-save pattern: ephemeral in chat, persisted only when user favorites"
  - "Service-role client used for upsert in API route (needs write access to listings table)"
  - "Migration numbering 008/009 follows existing sequence (not 005/006 as plan suggested)"
  - "Source citation uses friendly display names (Apartments.com, Craigslist, Zillow, web search)"

patterns-established:
  - "Persist-on-save: web results become DB records only when user saves to favorites"
  - "Embedding trigger via null last_embedded_at: cleared after upsert so pipeline picks up new listing"

requirements-completed: [AGENT-02]

# Metrics
duration: 10min
completed: 2026-03-06
---

# Phase 5 Plan 3: UI Integration, Source Citations, and Save-Web-Listing Flow Summary

**Source citations on listing cards, web_search chat indicator, Google Places cleanup, persistWebListing with 5 unit tests, and /api/save-web-listing API route**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-06T18:51:47Z
- **Completed:** 2026-03-06T19:02:00Z
- **Tasks:** 2 of 2 auto tasks completed (Task 3 is human-verify checkpoint)
- **Files modified:** 10

## Accomplishments
- ListingCard displays source citation for all listing sources (Apartments.com, Craigslist, Zillow, web search)
- web_search and get_saved_listings tool indicators added to chat UI
- Google Places listings marked inactive via migration 008
- match_listings_semantic RPC updated to return source column (migration 009)
- search_listings returns source field in both SQL and semantic query paths
- listingSummarySchema extended with optional source and sourceUrl fields
- persistWebListing function with 5 unit tests covering upsert success/failure, embedding trigger, no-data, field correctness
- POST /api/save-web-listing API route with auth, input validation, service-role upsert

## Task Commits

Each task was committed atomically:

1. **Task 1: Source citation, web_search indicator, types, Google Places cleanup** - `88617f6` (feat)
2. **Task 2: persistWebListing with unit tests and save-listing API wiring** - `87942de` (feat)

## Files Created/Modified
- `packages/types/src/chat.ts` - Added optional source and sourceUrl to listingSummarySchema
- `apps/web/components/listing-card.tsx` - Source citation display with friendly names
- `apps/web/components/chat/chat-tool-indicator.tsx` - web_search and get_saved_listings labels
- `packages/ai/src/tools/handlers/search-listings.ts` - Source field in SQL and semantic result mappings
- `packages/ai/src/tools/handlers/web-search.ts` - persistWebListing function with JSDoc
- `packages/ai/src/index.ts` - Export persistWebListing
- `packages/ai/__tests__/persist-web-listing.test.ts` - 5 unit tests for persist function
- `apps/web/app/api/save-web-listing/route.ts` - POST endpoint with auth and validation
- `supabase/migrations/008_cleanup_google_places.sql` - Mark Google Places listings inactive
- `supabase/migrations/009_add_source_to_semantic_rpc.sql` - Add source to RPC return type

## Decisions Made
- Web-sourced listings use persist-on-save pattern: ephemeral in chat, persisted only when user favorites
- Service-role client used for upsert in API route (needs write access to listings table)
- Migration numbering 008/009 follows existing sequence (not 005/006 as plan suggested, since those numbers were taken)
- Source citation uses friendly display names (Apartments.com, Craigslist, Zillow, web search)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing search-listings test assertion**
- **Found during:** Task 1
- **Issue:** Test expected exact string match on modelContext but uniqueHint was appended (from Plan 05-02)
- **Fix:** Changed `.toBe()` to `.toContain()` for the empty result assertion
- **Files modified:** packages/ai/src/tools/__tests__/search-listings.test.ts
- **Verification:** All 9 search-listings tests pass
- **Committed in:** 88617f6 (Task 1 commit)

**2. [Rule 3 - Blocking] Added @tavily/core mock to persist-web-listing tests**
- **Found during:** Task 2
- **Issue:** Importing persistWebListing from web-search.ts triggered @tavily/core resolution, causing vitest to hang
- **Fix:** Added vi.mock('@tavily/core') before importing the module under test
- **Files modified:** packages/ai/__tests__/persist-web-listing.test.ts
- **Verification:** All 5 tests run in <1s without hanging
- **Committed in:** 87942de (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for test correctness. No scope creep.

## Issues Encountered
- Pre-existing typecheck errors in @campusnest/web (auth-nav, map-block tests, cribai-chat, heart-button test) - confirmed these exist on main branch too, not caused by this plan's changes

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 5 implementation complete pending human verification (Task 3 checkpoint)
- All auto tasks done, awaiting end-to-end user verification of source citations, web search indicator, and save flow

---
*Phase: 05-agentic-data-pipeline-web-search*
*Completed: 2026-03-06*
