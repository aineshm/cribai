---
phase: 07-fix-e2e-test-issues-and-complete-v1
plan: 01
subsystem: api, ui, database
tags: [supabase, next.js, dev-auth, price-filter, migration]

requires:
  - phase: 06-agent-tool-expansion-and-polish
    provides: CribAI chat, conversation persistence API, dev auth utilities
provides:
  - Price filter excludes null/zero rent listings
  - CribAI route resolves userId via dev auth cookies
  - Migration to purge broken Google Places photo URLs
  - Clean next.config without deprecated remote pattern
affects: [07-02]

tech-stack:
  added: []
  patterns: [dev-auth-fallback-in-api-routes]

key-files:
  created:
    - supabase/migrations/008_remove_google_places_photos.sql
  modified:
    - apps/web/app/(campus)/[campusSlug]/listings/page.tsx
    - apps/web/app/api/ai/cribai/route.ts
    - apps/web/next.config.ts

key-decisions:
  - "Frontend conversation persistence already wired from Phase 6 -- no changes needed in cribai-chat.tsx"
  - "Import path for dev-auth is 4 levels up from cribai route (../../../../lib/dev-auth)"

patterns-established:
  - "Dev auth fallback: always check isDevAuthEnabled() after bearer token auth fails in API routes"

requirements-completed: []

duration: 4min
completed: 2026-03-10
---

# Phase 07 Plan 01: Fix E2E Bugs Summary

**Price filter null/zero exclusion, dev auth fallback in CribAI route, and Google Places photo URL purge migration**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-10T02:41:15Z
- **Completed:** 2026-03-10T02:46:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Price filter now excludes listings with null or $0 rent when min/max price is set
- Listings page uses force-dynamic to prevent Next.js App Router caching with search params
- CribAI API route resolves userId from dev auth cookies when no bearer token present (fixes schedule_tour)
- Migration 008 purges legacy Google Places photo URLs that return 403
- Removed places.googleapis.com from Next.js image remotePatterns

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix price filter, dev auth in CribAI route** - `7a1bb8d` (fix)
2. **Task 2: Purge Google Places photo URLs and clean config** - `4151eb6` (fix)

## Files Created/Modified
- `apps/web/app/(campus)/[campusSlug]/listings/page.tsx` - Added force-dynamic export, null/zero price exclusion
- `apps/web/app/api/ai/cribai/route.ts` - Added dev auth fallback for userId resolution
- `supabase/migrations/008_remove_google_places_photos.sql` - Purges places.googleapis.com URLs from photo_urls
- `apps/web/next.config.ts` - Removed deprecated places.googleapis.com remote pattern

## Decisions Made
- Frontend conversation persistence (cribai-chat.tsx) was already fully wired from Phase 6 -- createConversation and persistMessage logic present. No changes needed despite plan expecting this work.
- Fixed import path for dev-auth module (4 levels up from api/ai/cribai/route.ts, not 3 as plan suggested)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected dev-auth import path**
- **Found during:** Task 1
- **Issue:** Plan specified `../../../lib/dev-auth` but correct path is `../../../../lib/dev-auth` from the cribai route's location
- **Fix:** Used correct relative path
- **Files modified:** apps/web/app/api/ai/cribai/route.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** 7a1bb8d

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor path correction. Frontend conversation persistence task was already complete from Phase 6 (no work needed).

## Issues Encountered
- Pre-existing TypeScript errors in map-block.test.tsx and heart-button.test.tsx -- out of scope, not related to plan changes

## User Setup Required
None - no external service configuration required. Migration 008 needs to be applied to Supabase (`supabase db push` or manual application).

## Next Phase Readiness
- All 4 critical E2E bugs addressed
- Ready for plan 07-02

---
*Phase: 07-fix-e2e-test-issues-and-complete-v1*
*Completed: 2026-03-10*
