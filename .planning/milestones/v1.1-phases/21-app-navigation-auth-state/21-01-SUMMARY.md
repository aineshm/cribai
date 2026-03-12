---
phase: 21-app-navigation-auth-state
plan: 01
subsystem: ui
tags: [next.js, server-components, supabase, auth, navigation, landing-page]

# Dependency graph
requires:
  - phase: 20-concierge-mount-design-cleanup
    provides: "(main) layout with ConciergeShell + ConciergeNavButton"
  - phase: 19-auth-flow-route-protection
    provides: "Supabase session read pattern with dev-auth header fallback"
provides:
  - "Auth-gated Post and Profile nav links in (main) layout"
  - "Landing page converted to Server Component with auth-aware CTAs"
  - "Hero, MobileStickyBar, FooterCTA accept isAuthenticated prop"
  - "Authenticated users see 'Go to Dashboard' -> /explore"
  - "Unauthenticated users see 'Get Started Free' / 'Sign In' -> /login"
affects:
  - landing-page
  - navigation
  - auth-state

# Tech tracking
tech-stack:
  added: []
  patterns: ["Server Component session read with dev-auth header fallback", "isAuthenticated prop threading from Server Component to client children"]

key-files:
  created:
    - apps/web/components/landing/__tests__/Hero.test.tsx
    - apps/web/components/landing/__tests__/MobileStickyBar.test.tsx
  modified:
    - apps/web/app/(main)/layout.tsx
    - apps/web/app/page.tsx
    - apps/web/components/landing/Hero.tsx
    - apps/web/components/landing/MobileStickyBar.tsx
    - apps/web/components/landing/FooterCTA.tsx
    - apps/web/__tests__/main-layout.test.tsx

key-decisions:
  - "MobileStickyBar accepts optional visible prop to bypass IntersectionObserver in tests — zero production behavior change"
  - "isAuthenticated prop defaults to false on all landing components for backward compatibility"
  - "Server Component page.tsx can import 'use client' child components — valid Next.js 15 pattern"

patterns-established:
  - "Auth-aware Server Component: cookies() + createServerComponentClient + getUser + x-dev-user-json fallback"
  - "Threading isAuthenticated from Server Component parent to 'use client' children via props"
  - "Test-override prop (visible) on animated components to bypass browser APIs absent in jsdom"

requirements-completed: [POST-01, PROF-01, LAND-01, LAND-04]

# Metrics
duration: 3min
completed: 2026-03-12
---

# Phase 21 Plan 01: App Navigation Auth State Summary

**Auth-gated Post/Profile nav links in (main) layout plus landing page converted from 'use client' to Server Component with auth-aware Hero, MobileStickyBar, and FooterCTA CTAs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-12T01:09:46Z
- **Completed:** 2026-03-12T01:12:54Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- (main) layout is now async Server Component reading Supabase session — Post and Profile nav links only appear when authenticated
- Landing page (app/page.tsx) converted from `'use client'` to async Server Component, passing `isAuthenticated` down to Hero, MobileStickyBar, FooterCTA, and the nav link
- 14 unit tests across 3 test files (7 layout auth tests + 4 Hero tests + 3 MobileStickyBar tests), all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Auth-gated nav links in (main)/layout.tsx** - `1180c54` (feat)
2. **Task 2: Landing page Server Component + auth-aware CTAs** - `208232f` (feat)

**Plan metadata:** committed with SUMMARY.md (docs)

_Note: TDD tasks — tests written first (RED), then implementation (GREEN) in single atomic commits per task_

## Files Created/Modified

- `apps/web/app/(main)/layout.tsx` - Converted to async, reads Supabase session, conditionally renders Post/Profile nav links
- `apps/web/app/page.tsx` - Removed 'use client', made async, reads session, passes isAuthenticated to children
- `apps/web/components/landing/Hero.tsx` - Added isAuthenticated prop, auth-aware CTA href/text
- `apps/web/components/landing/MobileStickyBar.tsx` - Added isAuthenticated + visible (test override) props
- `apps/web/components/landing/FooterCTA.tsx` - Added isAuthenticated prop, auth-aware CTA href/text
- `apps/web/__tests__/main-layout.test.tsx` - Extended with 4 new auth-conditional tests (7 total)
- `apps/web/components/landing/__tests__/Hero.test.tsx` - Created with 4 tests
- `apps/web/components/landing/__tests__/MobileStickyBar.test.tsx` - Created with 3 tests

## Decisions Made

- MobileStickyBar uses IntersectionObserver internally which is unavailable in jsdom. Added an optional `visible` prop that bypasses observer logic for testing — no production behavior change.
- All landing component props default to `false` for backward compatibility.
- Server Component page.tsx validly imports `'use client'` children (Hero, SocialProof, etc.) — standard Next.js 15 pattern.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — build passed cleanly. The 3 pre-existing failing test files (freshness-badge, map-block, ProfilePage) are out of scope per Phase 18-02 decision in STATE.md.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- POST-01, PROF-01, LAND-01, LAND-04 gap items from v1.1 audit are closed
- Landing page and (main) nav are fully auth-state-aware
- No blockers for subsequent phases

---
*Phase: 21-app-navigation-auth-state*
*Completed: 2026-03-12*
