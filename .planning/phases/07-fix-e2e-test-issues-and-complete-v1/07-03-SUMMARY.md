---
phase: 07-fix-e2e-test-issues-and-complete-v1
plan: 03
subsystem: ui
tags: [next-js, favicon, notifications, mobile-nav, dev-auth]

# Dependency graph
requires:
  - phase: 07-02
    provides: notification bell, mobile nav, mark-all-read button
provides:
  - Favicon showing green 'CN' branding
  - Dashboard 2-column grid layout
  - Mark-read API using correct dev user UUID from cookie
  - Saved nav link (desktop and mobile) without misleading price-change badge
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [dev-auth cookie resolution pattern for API routes]

key-files:
  created: []
  modified:
    - apps/web/app/icon.tsx
    - apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx
    - apps/web/app/api/notifications/mark-read/route.ts
    - apps/web/app/(campus)/[campusSlug]/layout.tsx
    - apps/web/components/mobile-nav.tsx

key-decisions:
  - "Removed priceChangedSavesCount entirely from layout and mobile-nav (was unused after badge removal, caused TypeScript error)"
  - "Mark-read route reads dev_user_id cookie, falls back to DEFAULT_DEV_USER.id (same pattern as other dev-auth routes)"

patterns-established:
  - "Dev auth API routes: read DEV_USER_COOKIE from cookieStore, fall back to DEFAULT_DEV_USER.id"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 07 Plan 03: UAT Gap Closure (Favicon, Grid, Badge, Mark-Read) Summary

**Fixed 4 UAT issues: 'CN' favicon branding, 2-column dashboard grid, correct dev user UUID in mark-read API, and notification badge removed from Saved nav link on desktop and mobile.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T04:35:08Z
- **Completed:** 2026-03-10T04:37:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Favicon now shows green 'CN' at font size 16 to fit the 32x32 canvas without clipping
- Dashboard grid changed from `lg:grid-cols-3` to `lg:grid-cols-2` — no awkward empty right column
- Mark-read API route reads `dev_user_id` cookie and falls back to `DEFAULT_DEV_USER.id` instead of hardcoded `'dev-user-1'` string
- Saved nav link is now a plain link on both desktop layout and mobile nav — red price-change badge removed

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix favicon text and dashboard grid** - `25dc822` (feat)
2. **Task 2: Fix mark-read dev user ID and move notification badge** - `29bf0ab` (fix)

**Plan metadata:** (see final commit)

## Files Created/Modified
- `apps/web/app/icon.tsx` - Changed text 'C' -> 'CN', fontSize 24 -> 16
- `apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx` - Changed lg:grid-cols-3 to lg:grid-cols-2
- `apps/web/app/api/notifications/mark-read/route.ts` - Import DEV_USER_COOKIE/DEFAULT_DEV_USER, resolve user from cookie
- `apps/web/app/(campus)/[campusSlug]/layout.tsx` - Remove Saved badge JSX, remove priceChangedSavesCount variable and DB queries
- `apps/web/components/mobile-nav.tsx` - Remove priceChangedSavesCount from interface, props, and Saved link JSX

## Decisions Made
- Removed `priceChangedSavesCount` variable entirely from layout.tsx rather than keeping it as dead code — TypeScript strict mode raises an error for declared but unread variables, so removal was necessary for the build to pass.
- Used the `DEV_USER_COOKIE` + `DEFAULT_DEV_USER.id` pattern already established in other dev-auth routes rather than inventing a new resolution strategy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused priceChangedSavesCount variable to fix TypeScript build error**
- **Found during:** Task 2 (Fix mark-read dev user ID and move notification badge)
- **Issue:** Plan said "keep the priceChangedSavesCount variable and its DB query — it may be useful for NotificationBell or future use." But TypeScript strict mode raised `'priceChangedSavesCount' is declared but its value is never read` causing build failure.
- **Fix:** Removed the variable declaration and all its DB queries from both the dev and production paths in layout.tsx. Also removed it from MobileNav interface/props (which was part of the plan).
- **Files modified:** apps/web/app/(campus)/[campusSlug]/layout.tsx
- **Verification:** Build completed compilation and type-checking without TypeScript errors.
- **Committed in:** 29bf0ab (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - build-blocking TypeScript error)
**Impact on plan:** Auto-fix corrects plan instruction that conflicted with TypeScript strict mode. The variable was genuinely unused after badge removal. No scope creep.

## Issues Encountered
- Pre-existing prerender error on `/login` page during Next.js static export — unrelated to changes in this plan, pre-existing issue with Supabase client during SSG. Logged as out-of-scope.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 UAT gaps addressed: favicon CN, dashboard 2-col grid, mark-read correct UUID, Saved nav badge removed
- Notifications bell retains its unread count badge on both desktop and mobile
- Phase 7 (and v1) is complete

---
*Phase: 07-fix-e2e-test-issues-and-complete-v1*
*Completed: 2026-03-10*

## Self-Check: PASSED
- icon.tsx: FOUND
- mark-read/route.ts: FOUND
- SUMMARY.md: FOUND
- Commit 25dc822: FOUND
- Commit 29bf0ab: FOUND
