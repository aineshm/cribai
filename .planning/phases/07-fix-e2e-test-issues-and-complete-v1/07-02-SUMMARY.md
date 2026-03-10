---
phase: 07-fix-e2e-test-issues-and-complete-v1
plan: 02
subsystem: ui
tags: [favicon, notifications, dashboard, profile, nextjs, imageresponse]

requires:
  - phase: 04-saved-listings-notifications
    provides: Notifications page, dashboard, saved listings
provides:
  - Dynamic favicon via Next.js ImageResponse API
  - Mark all as read button replacing auto-mark behavior
  - POST /api/notifications/mark-read API route
  - University name on profile settings page
affects: []

tech-stack:
  added: []
  patterns:
    - Client component button for server data mutation via API route

key-files:
  created:
    - apps/web/app/icon.tsx
    - apps/web/app/(campus)/[campusSlug]/notifications/mark-all-read-button.tsx
    - apps/web/app/api/notifications/mark-read/route.ts
  modified:
    - apps/web/app/(campus)/[campusSlug]/layout.tsx
    - apps/web/components/mobile-nav.tsx
    - apps/web/components/submit-listing-form.tsx
    - apps/web/app/(campus)/[campusSlug]/notifications/page.tsx
    - apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx
    - apps/web/app/settings/profile/page.tsx

key-decisions:
  - "MarkAllReadButton is a client component using router.refresh() after API call for data revalidation"
  - "University defaults to UW-Madison for v1 with dynamic lookup via campus_id when available"

patterns-established:
  - "Client button + API route pattern for user-triggered server mutations on server-rendered pages"

requirements-completed: []

duration: 3min
completed: 2026-03-10
---

# Phase 7 Plan 2: UX Polish Summary

**Dynamic favicon, Share a Listing copy, explicit mark-as-read button, Recently Viewed removal, and university on profile**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T02:41:02Z
- **Completed:** 2026-03-10T02:44:09Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Added dynamic favicon via Next.js ImageResponse API (eliminates 404 on every page load)
- Replaced "Submit Listing" with "Share a Listing" across desktop nav, mobile nav, and form button
- Replaced auto-mark-as-read on notifications page load with explicit "Mark all as read" button
- Created POST /api/notifications/mark-read API route with auth and dev-mode support
- Removed Recently Viewed placeholder card from dashboard (deferred to v2)
- Added read-only university name field to profile settings page

## Task Commits

Each task was committed atomically:

1. **Task 1: Add favicon and update submit listing copy** - `3b30ecd` (feat)
2. **Task 2: Fix notification read behavior, remove Recently Viewed, add university to profile** - `f2a0919` (feat)

## Files Created/Modified
- `apps/web/app/icon.tsx` - Dynamic favicon using ImageResponse
- `apps/web/app/(campus)/[campusSlug]/layout.tsx` - Desktop nav: Submit Listing -> Share a Listing
- `apps/web/components/mobile-nav.tsx` - Mobile nav: Submit Listing -> Share a Listing
- `apps/web/components/submit-listing-form.tsx` - Form button: Submit Listing -> Share Listing
- `apps/web/app/(campus)/[campusSlug]/notifications/page.tsx` - Removed auto-mark-as-read, added MarkAllReadButton
- `apps/web/app/(campus)/[campusSlug]/notifications/mark-all-read-button.tsx` - Client component for mark all as read
- `apps/web/app/api/notifications/mark-read/route.ts` - API route to mark notifications as read
- `apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx` - Removed Recently Viewed placeholder
- `apps/web/app/settings/profile/page.tsx` - Added read-only university name field

## Decisions Made
- MarkAllReadButton is a client component using router.refresh() after API call for data revalidation
- University defaults to UW-Madison for v1 with dynamic lookup via campus_id when available
- Mark-read API route supports both real Supabase auth and dev auth (BYPASS_AUTH)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All UX polish items from E2E audit are addressed
- Pre-existing test failures in map-block.test.tsx and freshness-badge.test.tsx remain (out of scope for this plan)

---
*Phase: 07-fix-e2e-test-issues-and-complete-v1*
*Completed: 2026-03-10*
