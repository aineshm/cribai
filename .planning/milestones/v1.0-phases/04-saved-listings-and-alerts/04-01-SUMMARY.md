---
phase: 04-saved-listings-and-alerts
plan: "01"
subsystem: database, ui
tags: [supabase, rls, zod, react, optimistic-ui, heart-toggle]

requires:
  - phase: 01-auth-and-profile
    provides: auth.users table, Supabase client setup, auth session
  - phase: 02-data-pipeline
    provides: listings table, ListingCard component, photo_urls

provides:
  - saved_listings table with RLS policies
  - notifications table with RLS and Realtime
  - SavedListing and Notification Zod types
  - HeartButton client component with optimistic UI
  - ListingCard heart overlay integration
  - Listings page saved state for authenticated users

affects: [04-02-saved-page, 04-03-notifications, 04-04-detail-page]

tech-stack:
  added: []
  patterns: [optimistic-ui-toggle, css-keyframe-animation, rls-for-all-policy]

key-files:
  created:
    - supabase/migrations/007_saved_listings_notifications.sql
    - packages/types/src/saved-listing.ts
    - packages/types/src/notification.ts
    - apps/web/components/heart-button.tsx
    - apps/web/lib/__tests__/heart-button.test.tsx
  modified:
    - packages/types/src/index.ts
    - apps/web/components/listing-card.tsx
    - apps/web/components/listing-grid.tsx
    - apps/web/components/stale-section.tsx
    - apps/web/app/(campus)/[campusSlug]/listings/page.tsx
    - apps/web/app/globals.css
    - apps/web/vitest.config.ts

key-decisions:
  - "CSS keyframes for heart animation instead of framer-motion (no new dependency)"
  - "HeartButton fetches auth inline via supabase.auth.getUser() instead of prop threading"
  - "Vitest include pattern fixed to match .tsx in lib/__tests__"

patterns-established:
  - "Optimistic UI toggle: flip state immediately, revert on API error"
  - "Heart overlay: absolute positioned inside relative photo container"
  - "Server-side saved set: fetch user saves once in page, pass Set through grid"

requirements-completed: [LIST-01]

duration: 4min
completed: 2026-03-06
---

# Phase 4 Plan 01: Database Schema + Types + HeartButton + ListingCard Integration Summary

**Saved listings DB schema with RLS, Zod types for SavedListing/Notification, and HeartButton with optimistic toggle integrated into ListingCard photo overlay**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-06T16:00:05Z
- **Completed:** 2026-03-06T16:04:30Z
- **Tasks:** 4
- **Files modified:** 12

## Accomplishments
- saved_listings and notifications tables with RLS, indexes, and Realtime enabled
- Zod schemas for SavedListing and Notification types exported from @campusnest/types
- HeartButton client component with optimistic UI, CSS animation, and auth redirect
- Heart overlay integrated into ListingCard; listings page fetches saved state for auth users

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 007_saved_listings_notifications.sql** - `b6389b6` (feat)
2. **Task 2: Zod schemas for SavedListing and Notification** - `c46174d` (feat)
3. **Task 3: HeartButton component with optimistic UI** - `c555ecb` (feat)
4. **Task 4: ListingCard integration + listings page + tests** - `b284e52` (feat)

## Files Created/Modified
- `supabase/migrations/007_saved_listings_notifications.sql` - saved_listings + notifications tables with RLS
- `packages/types/src/saved-listing.ts` - SavedListing Zod schema
- `packages/types/src/notification.ts` - Notification + PriceChangePayload Zod schemas
- `packages/types/src/index.ts` - Re-exports for new types
- `apps/web/components/heart-button.tsx` - Client component with optimistic save toggle
- `apps/web/components/listing-card.tsx` - Added HeartButton overlay on hero photo
- `apps/web/components/listing-grid.tsx` - Threads savedListingIds to ListingCard
- `apps/web/components/stale-section.tsx` - Threads savedListingIds to ListingCard
- `apps/web/app/(campus)/[campusSlug]/listings/page.tsx` - Fetches user saved IDs
- `apps/web/app/globals.css` - heart-pop CSS keyframe animation
- `apps/web/lib/__tests__/heart-button.test.tsx` - 5 unit tests for HeartButton
- `apps/web/vitest.config.ts` - Fixed include pattern for .tsx in lib/__tests__

## Decisions Made
- Used CSS keyframes for heart animation instead of framer-motion (avoids new dependency, sufficient for scale+fill effect)
- HeartButton calls supabase.auth.getUser() inline rather than receiving isAuthenticated/userId as props (simpler API, single source of truth)
- Fixed vitest include pattern to match .tsx files in lib/__tests__ (was only matching .ts)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed vitest include pattern for .tsx test files**
- **Found during:** Task 4 (heart-button tests)
- **Issue:** Vitest config `lib/__tests__/**/*.test.ts` did not match `.tsx` files, so heart-button tests were silently skipped
- **Fix:** Changed pattern to `lib/__tests__/**/*.test.{ts,tsx}`
- **Files modified:** apps/web/vitest.config.ts
- **Verification:** All 35 tests run and pass
- **Committed in:** b284e52 (Task 4 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for test discovery. No scope creep.

## Issues Encountered
- Pre-existing typecheck errors in `tests/e2e/auth.spec.ts` (out of scope, unrelated to this plan's changes)

## User Setup Required
None - no external service configuration required. Migration must be applied to Supabase via `supabase db push` or dashboard migration.

## Next Phase Readiness
- Database foundation ready for saved listings page (04-02), notifications (04-03), and detail page (04-04)
- HeartButton reusable on any page that has listing IDs
- Notification table ready for price change detection integration in scraper

---
*Phase: 04-saved-listings-and-alerts*
*Completed: 2026-03-06*
