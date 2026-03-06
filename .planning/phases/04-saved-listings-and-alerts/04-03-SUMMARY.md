---
phase: 04-saved-listings-and-alerts
plan: "03"
subsystem: scraper, ui
tags: [supabase, realtime, notifications, price-detection, scraper, react]

requires:
  - phase: 04-saved-listings-and-alerts
    provides: saved_listings table, notifications table with Realtime, HeartButton, nav with Saved links

provides:
  - Price change detection module for scraper pipeline
  - NotificationBell client component with Realtime subscription
  - Notifications page with date grouping and color-coded price changes
  - Notification bell in desktop nav and Notifications link in mobile nav

affects: [04-04-cribai-tool]

tech-stack:
  added: []
  patterns: [realtime-subscription-per-user, price-detection-before-upsert, server-side-mark-as-read]

key-files:
  created:
    - services/scraper/price-change-detector.ts
    - services/scraper/__tests__/price-change-detector.test.ts
    - apps/web/components/notification-bell.tsx
    - apps/web/app/(campus)/[campusSlug]/notifications/page.tsx
  modified:
    - services/scraper/run.ts
    - apps/web/app/(campus)/[campusSlug]/layout.tsx
    - apps/web/components/mobile-nav.tsx

key-decisions:
  - "Price detection runs BEFORE upsert in scraper pipeline to compare against old DB prices"
  - "Notification type uses 'price_change' (matching DB schema) not separate decrease/increase types"
  - "Realtime channel filtered by user_id for efficient per-user notification delivery"
  - "Notifications page marks all unread as read server-side on load (no client-side action needed)"

patterns-established:
  - "Price detection before upsert: fetch current prices, compare, store changes, then upsert"
  - "Realtime subscription per user: channel name includes userId, filter on user_id column"
  - "Server-side mark-as-read: UPDATE on page load in server component, not client action"

requirements-completed: [LIST-02]

duration: 4min
completed: 2026-03-06
---

# Phase 4 Plan 03: Price Change Detection + Notifications UI Summary

**Scraper price change detection with per-user notification creation, Realtime-powered bell icon, and notifications page with color-coded price changes and date grouping**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-06T16:15:07Z
- **Completed:** 2026-03-06T16:20:00Z
- **Tasks:** 4
- **Files modified:** 7

## Accomplishments
- Price change detector compares scraped vs DB prices and creates notifications for users who saved affected listings
- NotificationBell with Supabase Realtime subscription for live unread count updates
- Notifications page with date grouping (Today/Yesterday/This Week/Earlier), color-coded arrows, and mark-all-read on load
- Bell icon in desktop nav and Notifications link with badge in mobile nav

## Task Commits

Each task was committed atomically:

1. **Task 1: Price change detector module with tests** - `b54e681` (feat)
2. **Task 2: Integrate price detection into scraper run.ts** - `99847d3` (feat)
3. **Task 3: NotificationBell + Notifications page** - `f9e44b5` (feat)
4. **Task 4: Add bell to nav + unread count prop threading** - `6fba830` (feat)

## Files Created/Modified
- `services/scraper/price-change-detector.ts` - detectPriceChanges and createPriceChangeNotifications functions
- `services/scraper/__tests__/price-change-detector.test.ts` - 9 unit tests for price detection and notification creation
- `services/scraper/run.ts` - Integrated price detection before upsert and notification creation after
- `apps/web/components/notification-bell.tsx` - Bell icon with Realtime subscription and unread badge
- `apps/web/app/(campus)/[campusSlug]/notifications/page.tsx` - Full notifications page with grouping and empty state
- `apps/web/app/(campus)/[campusSlug]/layout.tsx` - Queries unread count, renders NotificationBell, passes count to MobileNav
- `apps/web/components/mobile-nav.tsx` - Added Notifications link with badge count

## Decisions Made
- Price detection runs BEFORE upsert to compare against old DB values (prevents stale comparison)
- Used 'price_change' type (matching DB CHECK constraint) instead of separate price_decrease/price_increase types from research
- Realtime channel filtered by user_id for efficient per-user delivery
- Server-side mark-as-read on notifications page load (simpler than client-side action)
- changeMap uses Map for O(1) lookup instead of Array.find for notification creation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript errors in price-change-detector tests**
- **Found during:** Task 4 (typecheck verification)
- **Issue:** Unused `beforeEach` import and non-null assertion needed on array access
- **Fix:** Removed unused import, added `!` non-null assertions on test result array access
- **Files modified:** services/scraper/__tests__/price-change-detector.test.ts
- **Verification:** `pnpm run typecheck` passes for scraper package
- **Committed in:** 6fba830 (Task 4 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test file cleanup. No scope creep.

## Issues Encountered
- Pre-existing `tests/e2e/auth.spec.ts` typecheck errors in web package (out of scope, documented in 04-01 and 04-02 summaries)

## User Setup Required
None - uses existing Supabase Realtime (enabled in 04-01 migration).

## Next Phase Readiness
- Notification system end-to-end ready (scraper detection -> DB insert -> Realtime -> bell update)
- Ready for CribAI get_saved_listings tool integration (04-04 if applicable)

---
*Phase: 04-saved-listings-and-alerts*
*Completed: 2026-03-06*

## Self-Check: PASSED
- All 7 files verified present
- All 4 task commits verified (b54e681, 99847d3, f9e44b5, 6fba830)
