---
phase: 20-concierge-mount-design-cleanup
plan: 01
subsystem: ui
tags: [react, next.js, concierge, layout, route-groups]

# Dependency graph
requires:
  - phase: 15-concierge-ui
    provides: ConciergeShell, ConciergeNavButton, ConciergeProvider components

provides:
  - "(main) route group layout with ConciergeShell wrapper and sticky nav containing ConciergeNavButton"
  - "All (main) pages (explore, listing, post, profile) now have AI Concierge sidebar accessible"

affects: [20-02-design-cleanup, future (main) pages]

# Tech tracking
tech-stack:
  added: []
  patterns: [server-component layout wrapping client-component shell, nav inside ConciergeShell so ConciergeNavButton has provider context]

key-files:
  created:
    - apps/web/app/(main)/layout.tsx
    - apps/web/__tests__/main-layout.test.tsx
  modified: []

key-decisions:
  - "(main) layout is a server component with no 'use client' — ConciergeShell handles client boundary"
  - "Nav rendered inside ConciergeShell (not sibling) so ConciergeNavButton can call useConcierge()"
  - "Minimal nav: wordmark + ConciergeNavButton only — (main) pages are standalone v1.1 routes, not campus-scoped"

patterns-established:
  - "Pattern: ConciergeShell as outermost wrapper in route-group layouts ensures provider context for all nav items"

requirements-completed: [AGENT-01]

# Metrics
duration: 8min
completed: 2026-03-11
---

# Phase 20 Plan 01: Concierge Mount in (main) Layout Summary

**(main)/layout.tsx server component wrapping all v1.1 pages (explore, listing, post, profile) with ConciergeShell and a sticky nav containing ConciergeNavButton**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-11T17:39:00Z
- **Completed:** 2026-03-11T17:47:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Created `(main)/layout.tsx` as a server component — no `'use client'` directive, no Supabase or auth calls
- ConciergeShell wraps all page children, providing ConciergeProvider context throughout the (main) route group
- ConciergeNavButton mounted inside sticky nav inside ConciergeShell (correct provider ancestry)
- 3-test unit suite confirms shell, nav button, and children render correctly (TDD RED → GREEN)
- Closed gap AGENT-01: AI Concierge sidebar now accessible from all v1.1 pages

## Task Commits

Each task was committed atomically:

1. **Task 1: Create (main)/layout.tsx with ConciergeShell and nav bar** - `fd4d2a6` (feat)

**Plan metadata:** _(docs commit below)_

## Files Created/Modified

- `apps/web/app/(main)/layout.tsx` — Server component layout mounting ConciergeShell + sticky nav with ConciergeNavButton
- `apps/web/__tests__/main-layout.test.tsx` — Unit tests for shell wrapper, nav button presence, and children rendering

## Decisions Made

- Layout is a pure server component. ConciergeShell is a `'use client'` component that handles the client boundary internally, so no `'use client'` is needed on the layout itself.
- Nav is placed inside ConciergeShell (not a sibling) — this is mandatory because ConciergeNavButton calls `useConcierge()` which requires ConciergeProvider as an ancestor.
- Nav is intentionally minimal (wordmark + Concierge button). The (main) route group serves v1.1 standalone pages that don't have campus context, so campus-specific nav links are excluded.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing test failures in ChatMapBlock, ProfilePage, freshness-badge, and SavedListings test suites were present before this plan and are out of scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- (main) route group layout complete; all v1.1 pages (explore, listing, post, profile) now have ConciergeShell context
- Ready for 20-02 design cleanup work

---
*Phase: 20-concierge-mount-design-cleanup*
*Completed: 2026-03-11*
