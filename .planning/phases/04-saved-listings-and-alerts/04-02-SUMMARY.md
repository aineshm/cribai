---
phase: 04-saved-listings-and-alerts
plan: "02"
subsystem: ui
tags: [react, next.js, mapbox, supabase, server-components, photo-gallery]

requires:
  - phase: 04-saved-listings-and-alerts
    provides: saved_listings table, HeartButton component, ListingCard heart overlay

provides:
  - Enhanced listing detail page with photo gallery, map, freshness, CribAI CTA, similar listings
  - Saved listings page with auth redirect and empty state
  - Saved nav links in desktop and mobile navigation

affects: [04-03-notifications, 04-04-cribai-tool]

tech-stack:
  added: []
  patterns: [wkb-point-parsing, inline-heart-variant, server-side-saved-check]

key-files:
  created:
    - apps/web/app/(campus)/[campusSlug]/saved/page.tsx
    - apps/web/components/listing-location-map.tsx
    - apps/web/lib/parse-wkb-point.ts
  modified:
    - apps/web/app/(campus)/[campusSlug]/listings/[id]/page.tsx
    - apps/web/components/heart-button.tsx
    - apps/web/components/auth-nav.tsx
    - apps/web/components/mobile-nav.tsx
    - apps/web/app/(campus)/[campusSlug]/layout.tsx

key-decisions:
  - "WKB hex parser for PostGIS geography POINT extraction (avoids new migration/RPC)"
  - "HeartButton inline variant with currentColor stroke for non-overlay usage"
  - "Desktop nav shows Saved link always; AuthNav shows Saved only when authenticated and campusSlug provided"

patterns-established:
  - "WKB point parsing: parse PostGIS geography hex in JS instead of SQL extraction"
  - "Heart variant pattern: overlay (photo) vs inline (detail page) via variant prop"
  - "Server-side saved check: auth client fetches saved state for HeartButton initialSaved"

requirements-completed: [LIST-01, LIST-03, LIST-04]

duration: 5min
completed: 2026-03-06
---

# Phase 4 Plan 02: Enhanced Detail Page + Saved Listings Page + Nav Links Summary

**Enhanced listing detail with photo gallery, Mapbox map, freshness badge, CribAI CTA, and similar listings; saved listings page with empty state; Saved nav links in desktop and mobile**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T16:06:57Z
- **Completed:** 2026-03-06T16:12:06Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Listing detail page rewritten with photo gallery, HeartButton, FreshnessBadge, posted date, Mapbox map, CribAI CTA, similar listings section, and two-column layout
- Saved listings page with auth redirect, joined query, responsive grid, and friendly empty state with CribAI CTA
- Saved link added to desktop nav, mobile nav, and AuthNav component

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhanced listing detail page** - `2b576a8` (feat)
2. **Task 2: Saved listings page** - `f5f2076` (feat)
3. **Task 3: Saved nav links + campusSlug prop** - `d711014` (feat)

## Files Created/Modified
- `apps/web/app/(campus)/[campusSlug]/listings/[id]/page.tsx` - Rewritten detail page with gallery, map, freshness, CribAI CTA, similar listings
- `apps/web/app/(campus)/[campusSlug]/saved/page.tsx` - New saved listings page with auth redirect and empty state
- `apps/web/components/listing-location-map.tsx` - Single-listing Mapbox map component
- `apps/web/lib/parse-wkb-point.ts` - PostGIS WKB hex to lat/lng parser
- `apps/web/components/heart-button.tsx` - Added inline variant and currentColor stroke
- `apps/web/components/auth-nav.tsx` - Added campusSlug prop and Saved link
- `apps/web/components/mobile-nav.tsx` - Added Saved link with active state
- `apps/web/app/(campus)/[campusSlug]/layout.tsx` - Passes campusSlug to AuthNav, added Saved desktop link

## Decisions Made
- Created WKB hex parser utility instead of adding a database RPC or migration to extract lat/lng -- keeps things simple and avoids schema changes
- Added `variant` prop to HeartButton (overlay vs inline) rather than creating a separate component -- single source of truth for save toggle logic
- Desktop nav always shows "Saved" link (not gated on auth) -- clicking navigates to saved page which handles auth redirect itself

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] HeartButton absolute positioning incompatible with inline usage**
- **Found during:** Task 1 (detail page HeartButton placement)
- **Issue:** HeartButton had hardcoded `absolute top-3 right-3` positioning designed for photo overlay; doesn't work when placed inline next to title
- **Fix:** Added `variant` prop ('overlay' | 'inline') controlling positioning and background styling; inline variant uses `bg-surface-100` and `currentColor` stroke instead of white
- **Files modified:** apps/web/components/heart-button.tsx
- **Verification:** Typecheck passes, both overlay and inline variants render correctly
- **Committed in:** 2b576a8 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for HeartButton reuse on detail page. No scope creep.

## Issues Encountered
- Pre-existing `playwright.config.ts` untracked file causes build type-check failure (missing @playwright/test) -- out of scope, not caused by this plan
- Pre-existing `tests/e2e/auth.spec.ts` typecheck errors -- out of scope, noted in 04-01 summary

## User Setup Required
None - Mapbox token must be configured via NEXT_PUBLIC_MAPBOX_TOKEN env var (already required from Phase 3).

## Next Phase Readiness
- Saved listings page ready for notification badge integration (04-03)
- Detail page ready for any future enhancements
- Nav structure ready for notification bell icon addition

---
*Phase: 04-saved-listings-and-alerts*
*Completed: 2026-03-06*

## Self-Check: PASSED
- All 8 files verified present
- All 3 task commits verified (2b576a8, f5f2076, d711014)
