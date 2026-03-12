---
phase: 17-real-tool-integrations
plan: 02
subsystem: api
tags: [google-places, walkscore, gemini, supabase, tool-handlers]

requires:
  - phase: 17-real-tool-integrations
    provides: api-cache, google-places, walkscore lib modules
provides:
  - Real Google Places reviews handler with Gemini summary
  - Walk Score + categorized amenities neighborhood handler
  - Landlord contact card + Gemini draft inquiry handler
affects: [18-mission-executor, 20-ui-reconciliation]

tech-stack:
  added: []
  patterns: [address-resolution-from-listing, categorized-amenity-display, gemini-draft-generation, graceful-api-degradation]

key-files:
  created: []
  modified:
    - packages/ai/src/tools/handlers/get-reviews.ts
    - packages/ai/src/tools/handlers/get-neighborhood-info.ts
    - packages/ai/src/tools/handlers/contact-pm.ts
    - packages/ai/src/tools/__tests__/get-reviews.test.ts
    - packages/ai/src/tools/__tests__/get-neighborhood-info.test.ts
    - packages/ai/src/tools/__tests__/contact-pm.test.ts

key-decisions:
  - "Reviews: Gemini summary only for 3+ reviews, direct formatting for fewer (avoids unnecessary API call)"
  - "Neighborhood: default Madison WI coords when only address provided (no geocoding needed for MVP)"
  - "Contact PM: draft-only with casual student tone, no outbound email (per locked decision)"
  - "All handlers return error ToolResult for missing API keys instead of throwing (graceful degradation)"

patterns-established:
  - "Address resolution pattern: resolveAddress helper queries listings table by ID"
  - "Graceful API degradation: missing key returns partial results, not errors"
  - "Categorized amenity display: group NearbyPlace[] by primary type into named categories"

requirements-completed: [TOOLS-01, TOOLS-02, TOOLS-03]

duration: 3min
completed: 2026-03-11
---

# Phase 17 Plan 02: Tool Handler Implementations Summary

**Three stub tool handlers replaced with real Google Places reviews (+ Gemini summary), Walk Score + categorized amenities, and landlord contact card with Gemini draft message generation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-11T02:18:19Z
- **Completed:** 2026-03-11T02:23:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- get-reviews returns real Google Places ratings + Gemini-generated summary with review quotes and 24h cache
- get-neighborhood-info returns Walk Score (walk/transit/bike) + categorized nearby amenities with 7-day cache
- contact-pm returns landlord contact card from DB + Gemini-generated casual draft inquiry message
- All three handlers gracefully handle missing API keys and missing data
- 25 passing tests across all three handlers

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite get-reviews handler** - `874f429` (feat)
2. **Task 2: Rewrite neighborhood-info and contact-pm handlers** - `95cbad2` (feat)

## Files Created/Modified
- `packages/ai/src/tools/handlers/get-reviews.ts` - Real Google Places reviews with Gemini summary, 24h cache
- `packages/ai/src/tools/handlers/get-neighborhood-info.ts` - Walk Score + categorized nearby amenities, 7-day cache
- `packages/ai/src/tools/handlers/contact-pm.ts` - Landlord contact card + Gemini draft message
- `packages/ai/src/tools/__tests__/get-reviews.test.ts` - 10 tests covering all review behaviors
- `packages/ai/src/tools/__tests__/get-neighborhood-info.test.ts` - 7 tests covering neighborhood behaviors
- `packages/ai/src/tools/__tests__/contact-pm.test.ts` - 8 tests covering contact-pm behaviors

## Decisions Made
- Gemini summary only generated for 3+ reviews (avoids unnecessary API call for sparse data)
- Default Madison WI coordinates used when only address provided (no geocoding API needed for MVP)
- Draft message uses casual student tone per locked decision; no outbound email
- All handlers return error ToolResult for missing API keys instead of throwing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed rating number formatting in test assertion**
- **Found during:** Task 1
- **Issue:** Test expected "4.0" but JavaScript formats `4` not `4.0`
- **Fix:** Updated assertion to check for "4/5" pattern instead of "4.0"
- **Files modified:** packages/ai/src/tools/__tests__/get-reviews.test.ts
- **Verification:** All 10 tests pass
- **Committed in:** 874f429

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial test assertion fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. API keys (GOOGLE_PLACES_API_KEY, WALKSCORE_API_KEY, GEMINI_API_KEY) must be provisioned before integration testing.

## Next Phase Readiness
- Phase 17 complete: all tool handlers now return real data
- All three lib modules + handlers ready for Phase 18 (mission executor)
- Pre-existing web build failure and get-saved-listings test failure logged to deferred-items.md

---
*Phase: 17-real-tool-integrations*
*Completed: 2026-03-11*
