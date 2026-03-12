---
phase: 21-app-navigation-auth-state
plan: 02
subsystem: e2e-tests
tags: [playwright, e2e, navigation, auth, landing-page]

# Dependency graph
requires:
  - phase: 21-app-navigation-auth-state
    plan: 01
    provides: "Auth-aware landing page and (main) nav layout"
provides:
  - "HomePage page object with auth-aware locators (dashboardLink, dashboardCta)"
  - "navigation.spec.ts E2E tests for /post route protection and unauthenticated landing CTAs"
affects:
  - e2e-tests
  - landing-page
  - navigation

# Tech tracking
tech-stack:
  added: []
  patterns: ["Page Object Model with auth-aware locators split by auth state", "E2E middleware protection verification via redirect assertion"]

key-files:
  created:
    - apps/web/tests/e2e/navigation.spec.ts
  modified:
    - apps/web/tests/e2e/pages/HomePage.ts
    - apps/web/app/page.tsx

key-decisions:
  - "Inline Tailwind classes in page.tsx nav link — buttonVariants cannot be called from Server Components (was causing 500 error)"
  - "E2E navigation tests use chromium project only (firefox/webkit binaries not installed in this environment — pre-existing)"
  - "Authenticated E2E state not tested — requires Supabase session cookies; unit tests in Plan 01 cover conditional rendering"

patterns-established:
  - "Split page object locators by auth state with clear comments (unauthenticated / authenticated sections)"

requirements-completed: [POST-01, LAND-01, LAND-04]

# Metrics
duration: 4min
completed: 2026-03-12
---

# Phase 21 Plan 02: E2E Test Infrastructure for Auth-Aware Navigation

**HomePage page object updated with auth-aware locators, navigation.spec.ts added covering /post middleware protection and unauthenticated landing CTAs**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-12T01:15:12Z
- **Completed:** 2026-03-12T01:19:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- HomePage page object extended with `dashboardLink` (nav authenticated state) and `dashboardCta` (hero authenticated state) locators — existing unauthenticated locators unchanged
- All 9 existing homepage E2E tests continue to pass (chromium)
- New `navigation.spec.ts` with 7 tests: `/post` route middleware protection (with returnTo param), `/explore` nav render, and 4 unauthenticated landing CTA assertions (hero, nav sign-in, footer, mobile sticky bar) — all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Update HomePage page object + fix buttonVariants server bug** - `3572ea4` (feat)
2. **Task 2: Add navigation.spec.ts** - `c63f0c0` (feat)

**Plan metadata:** committed with SUMMARY.md (docs)

## Files Created/Modified

- `apps/web/tests/e2e/pages/HomePage.ts` - Added dashboardLink (nav) and dashboardCta (hero) locators for authenticated state; updated comments
- `apps/web/tests/e2e/navigation.spec.ts` - Created with 7 E2E tests across two describe blocks
- `apps/web/app/page.tsx` - Fixed: removed buttonVariants import (client-only), inlined Tailwind classes on nav link

## Decisions Made

- `buttonVariants` is exported from `button.tsx` which has `"use client"` directive. Calling it in a Server Component causes a Next.js runtime error. Fix: inline the equivalent Tailwind classes directly in the Server Component.
- Authenticated E2E state not covered — would require real Supabase session cookies or complex mock setup; unit tests in Plan 01 already cover conditional rendering logic.
- Firefox and WebKit browser binaries are not installed in this environment — tests scoped to chromium project. This is a pre-existing environment condition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed buttonVariants called from Server Component in page.tsx**
- **Found during:** Task 1 verification (landing page returned HTTP 500)
- **Issue:** `app/page.tsx` imported `buttonVariants` from `@/components/ui/button` which has `"use client"` directive. Next.js 15 throws at runtime when a server component calls a client-only function.
- **Fix:** Removed import, inlined equivalent Tailwind classes (`inline-flex items-center justify-center rounded-full bg-[var(--primary-600)] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-700)]`) directly on the nav `<Link>`.
- **Files modified:** `apps/web/app/page.tsx`
- **Commit:** `3572ea4`

## Issues Encountered

- Firefox and WebKit browser binaries not installed in local environment — pre-existing constraint, not introduced by this plan.
- The 3 pre-existing failing test files (freshness-badge, map-block, ProfilePage) remain out of scope per Phase 18-02 decision in STATE.md.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- POST-01, LAND-01, LAND-04 E2E coverage now in place
- All Phase 21 success criteria met
- No blockers for subsequent phases

---

## Self-Check: PASSED

- `apps/web/tests/e2e/navigation.spec.ts` exists: FOUND
- `apps/web/tests/e2e/pages/HomePage.ts` modified with auth locators: FOUND
- `apps/web/app/page.tsx` fixed (no buttonVariants): FOUND
- Commit `3572ea4`: FOUND
- Commit `c63f0c0`: FOUND

---
*Phase: 21-app-navigation-auth-state*
*Completed: 2026-03-12*
