---
phase: 02-data-pipeline
plan: 03
subsystem: ui
tags: [next-image, freshness-badge, photo-gallery, tailwind, react]

# Dependency graph
requires:
  - phase: 02-data-pipeline/01
    provides: "photo_urls, source_url, last_seen_at, is_active fields on listings"
provides:
  - "FreshnessBadge component with green/yellow/red states"
  - "StaleSection collapsible component for inactive listings"
  - "ListingPhotoGallery with 0/1/many photo support"
  - "Updated ListingCard with hero image, nullable rent, freshness badge"
  - "Updated ListingGrid with active/stale split"
  - "Next.js image config for Apartments.com CDN"
affects: [listing-detail, search-results, cribai-chat]

# Tech tracking
tech-stack:
  added: []
  patterns: [next-image-remote-patterns, active-stale-split, freshness-tiering]

key-files:
  created:
    - apps/web/components/freshness-badge.tsx
    - apps/web/components/stale-section.tsx
    - apps/web/components/listing-photo-gallery.tsx
    - apps/web/__tests__/freshness-badge.test.tsx
  modified:
    - apps/web/components/listing-card.tsx
    - apps/web/components/listing-grid.tsx
    - apps/web/next.config.ts
    - apps/web/app/(campus)/[campusSlug]/listings/page.tsx

key-decisions:
  - "Used emerald/amber/red Tailwind colors for freshness states instead of CSS variables"
  - "StaleSection uses useState toggle (not details/summary) for better animation control"
  - "Photo gallery uses horizontal scroll with snap for multi-photo, not a modal carousel"
  - "No placeholder image when photo_urls is empty -- skip image area entirely"

patterns-established:
  - "Freshness tiering: 0-3 days fresh, 4-6 aging, 7+ stale"
  - "Active/stale split pattern for listing grids"

requirements-completed: [DATA-02, DATA-06]

# Metrics
duration: 6min
completed: 2026-03-05
---

# Phase 02 Plan 03: Frontend Listing Display Summary

**Freshness badges, stale listing separation, hero photos, and photo gallery components for listing cards and detail pages**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-06T02:24:59Z
- **Completed:** 2026-03-06T02:30:49Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- FreshnessBadge component with 3-tier color system (green/yellow/red) based on days since last_seen_at
- ListingCard updated with hero photo via next/image, nullable rent ("Contact for pricing"), and freshness badge
- ListingGrid splits listings into active grid and collapsible stale section
- ListingPhotoGallery handles 0/1/many photos with source URL fallback links
- 12 unit tests for freshness level and label logic, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1a: Failing freshness badge tests (TDD RED)** - `0274ce3` (test)
2. **Task 1b: Freshness badge, stale section, photo gallery (TDD GREEN)** - `bfe7d67` (feat)
3. **Task 2: Update listing card, grid, and Next.js image config** - `4259c91` (feat)

## Files Created/Modified
- `apps/web/components/freshness-badge.tsx` - Freshness indicator with getFreshnessLevel/getFreshnessLabel helpers
- `apps/web/components/stale-section.tsx` - Collapsible section for inactive listings with muted opacity
- `apps/web/components/listing-photo-gallery.tsx` - Photo carousel with 0/1/many handling and source links
- `apps/web/__tests__/freshness-badge.test.tsx` - 12 unit tests for freshness logic boundaries
- `apps/web/components/listing-card.tsx` - Hero photo, nullable rent, freshness badge integration
- `apps/web/components/listing-grid.tsx` - Active/stale listing split with StaleSection
- `apps/web/next.config.ts` - Apartments.com and RentCafe CDN image domains
- `apps/web/app/(campus)/[campusSlug]/listings/page.tsx` - Query updated to fetch photo_urls, source_url, last_seen_at, is_active

## Decisions Made
- Used emerald/amber/red Tailwind colors for freshness states for visual clarity
- StaleSection uses useState toggle rather than details/summary for animation support
- Photo gallery uses horizontal scroll with snap points, not modal carousel
- No placeholder image when photo_urls is empty per user decision

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed type narrowing in photo gallery single photo case**
- **Found during:** Task 2 (build verification)
- **Issue:** `photoUrls[0]` could be `string | undefined` per TypeScript, causing Next.js build error
- **Fix:** Assigned to typed const `singlePhoto` with assertion since length check guarantees existence
- **Files modified:** apps/web/components/listing-photo-gallery.tsx
- **Verification:** Build type error resolved
- **Committed in:** 4259c91 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for build correctness. No scope creep.

## Issues Encountered
- Pre-existing iCloud duplicate files (e.g., "profile-form 2.tsx") cause build failures unrelated to this plan's changes. Logged as out-of-scope.
- Pre-existing typecheck failures in @campusnest/ai package (missing zod/supabase-js declarations). Not related to web package changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All frontend listing display components are complete
- Phase 02 (Data Pipeline) is now fully complete
- Ready for Phase 03 work

## Self-Check: PASSED

All 8 files verified present. All 3 commits verified in git history.

---
*Phase: 02-data-pipeline*
*Completed: 2026-03-05*
