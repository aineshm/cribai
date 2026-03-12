---
phase: 17-real-tool-integrations
plan: 01
subsystem: api
tags: [google-places, walkscore, supabase, caching, api-clients]

requires:
  - phase: 16-missions-db-schema
    provides: migrations numbering (013 is latest)
provides:
  - api_cache table for TTL-based external API response caching
  - landlords phone/email columns and listings landlord_id FK
  - Google Places API client (textSearch, getPlaceDetails, nearbySearch)
  - Walk Score API client (getWalkScore with graceful degradation)
  - Supabase-backed cache module (getCached, setCache)
affects: [17-02-tool-handlers, 18-mission-executor]

tech-stack:
  added: []
  patterns: [supabase-upsert-cache, fetch-based-api-client, graceful-degradation]

key-files:
  created:
    - supabase/migrations/014_api_cache_landlord_contacts.sql
    - packages/ai/src/tools/lib/api-cache.ts
    - packages/ai/src/tools/lib/google-places.ts
    - packages/ai/src/tools/lib/walkscore.ts
    - packages/ai/src/tools/__tests__/api-cache.test.ts
    - packages/ai/src/tools/__tests__/google-places.test.ts
    - packages/ai/src/tools/__tests__/walkscore.test.ts
  modified:
    - packages/ai/src/tools/__tests__/helpers.ts

key-decisions:
  - "Walk Score returns null-score result on failure instead of throwing (graceful degradation)"
  - "Google Places throws on non-OK response for explicit error handling by callers"
  - "Cache uses upsert with onConflict: 'key' for idempotent writes"

patterns-established:
  - "API client pattern: typed interfaces, native fetch, explicit error handling"
  - "Cache pattern: TTL-aware reads with null return, upsert writes"
  - "Test pattern: vi.stubGlobal('fetch', mockFetch) for API client tests"

requirements-completed: [TOOLS-01, TOOLS-02, TOOLS-03]

duration: 3min
completed: 2026-03-11
---

# Phase 17 Plan 01: Foundation Libraries Summary

**Supabase-backed TTL cache, Google Places API client (3 endpoints), and Walk Score client with 15 passing unit tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-11T02:12:40Z
- **Completed:** 2026-03-11T02:15:11Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Migration 014 adds api_cache table, landlord phone/email columns, and listings landlord_id FK
- Three shared lib modules (api-cache, google-places, walkscore) ready for tool handlers
- 15 unit tests covering cache hit/miss/expiry, all 3 Places endpoints, and Walk Score success/failure/network-error

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration + api-cache module with tests** - `f2d0771` (feat)
2. **Task 2: TDD RED - failing tests** - `c54e94c` (test)
3. **Task 2: TDD GREEN - implementations** - `5ef646d` (feat)

## Files Created/Modified
- `supabase/migrations/014_api_cache_landlord_contacts.sql` - api_cache table, landlord contacts, listings FK
- `packages/ai/src/tools/lib/api-cache.ts` - getCached and setCache with TTL
- `packages/ai/src/tools/lib/google-places.ts` - textSearchPlace, getPlaceDetails, nearbySearch
- `packages/ai/src/tools/lib/walkscore.ts` - getWalkScore with graceful degradation
- `packages/ai/src/tools/__tests__/api-cache.test.ts` - 4 cache tests
- `packages/ai/src/tools/__tests__/google-places.test.ts` - 8 Places tests
- `packages/ai/src/tools/__tests__/walkscore.test.ts` - 3 Walk Score tests
- `packages/ai/src/tools/__tests__/helpers.ts` - Added upsert to MockQueryBuilder

## Decisions Made
- Walk Score returns null-score result on failure instead of throwing (graceful degradation per user decision)
- Google Places throws on non-OK response for explicit error handling by callers
- Cache uses upsert with onConflict: 'key' for idempotent writes
- api_cache table is service-role only (RLS enabled, no user-facing policies)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing afterEach import in api-cache tests**
- **Found during:** Task 1
- **Issue:** afterEach was used but not imported from vitest
- **Fix:** Added afterEach to the import statement
- **Files modified:** packages/ai/src/tools/__tests__/api-cache.test.ts
- **Verification:** All 4 tests pass
- **Committed in:** f2d0771

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial import fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 lib modules ready for Plan 02 (tool handler implementations)
- api-cache, google-places, and walkscore can be imported by tool handlers
- Migration 014 must be applied to Supabase before integration testing

---
*Phase: 17-real-tool-integrations*
*Completed: 2026-03-11*
