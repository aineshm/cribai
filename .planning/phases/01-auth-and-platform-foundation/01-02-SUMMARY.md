---
phase: 01-auth-and-platform-foundation
plan: 02
subsystem: ui
tags: [next.js, tailwind, mobile-responsive, supabase, seed-data, dvh]

requires:
  - phase: 01-auth-and-platform-foundation
    provides: "campus_configs table schema, auth-nav component, campus layout"
provides:
  - "UW Madison seed data in campus_configs table"
  - "Root redirect to /uw-madison/cribai (chat-first experience)"
  - "Mobile-responsive hamburger nav component"
  - "Dashboard shell page at /[campusSlug]/dashboard"
  - "Settings link in AuthNav for authenticated users"
  - "PLAT-02 multi-campus architecture verified"
affects: [01-auth-and-platform-foundation, phase-04-alerts]

tech-stack:
  added: []
  patterns: ["dvh viewport units for mobile", "client component MobileNav inside server layout", "responsive nav: hidden md:flex + md:hidden hamburger"]

key-files:
  created:
    - supabase/migrations/003_uw_madison_seed.sql
    - apps/web/components/mobile-nav.tsx
    - apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx
  modified:
    - apps/web/app/page.tsx
    - apps/web/app/(campus)/[campusSlug]/layout.tsx
    - apps/web/components/auth-nav.tsx

key-decisions:
  - "Root URL redirects to /uw-madison/cribai for chat-first experience"
  - "Dashboard page requires auth, redirects to /login if unauthenticated"
  - "University name badge hidden on small screens (sm:inline) to save mobile space"

patterns-established:
  - "Mobile nav pattern: client component child of server layout, receiving props"
  - "Dashboard placeholder cards pattern: const array mapped to grid cards"
  - "dvh usage: min-h-[100dvh] on root, min-h-[calc(100dvh-64px)] on main content"

requirements-completed: [PLAT-01, PLAT-02, PLAT-03]

duration: 2min
completed: 2026-03-05
---

# Phase 01 Plan 02: Campus Setup and Mobile Layout Summary

**UW Madison seed data with root redirect to chat-first experience, mobile hamburger nav, and dashboard shell page**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T08:50:17Z
- **Completed:** 2026-03-05T08:52:23Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- UW Madison seeded as primary campus with wisc.edu domain, coordinates, and timezone
- Root URL redirects directly to CribAI chat (chat-first per user decision)
- Navigation collapses to animated hamburger menu on mobile with active route highlighting
- Dashboard shell page created with placeholder cards for appointments, recently viewed, and saved items
- Multi-campus architecture verified: layout uses dynamic campusSlug param with zero hardcoded campus references

## Task Commits

Each task was committed atomically:

1. **Task 1: UW Madison seed data and root redirect** - `bc0438a` (feat)
2. **Task 2: Mobile-responsive nav, dashboard shell, and multi-campus verification** - `3d6955f` (feat)

## Files Created/Modified
- `supabase/migrations/003_uw_madison_seed.sql` - UW Madison campus seed data with ON CONFLICT idempotency
- `apps/web/app/page.tsx` - Root redirect to /uw-madison/cribai
- `apps/web/components/mobile-nav.tsx` - Hamburger menu client component with animated icon and active route highlighting
- `apps/web/app/(campus)/[campusSlug]/layout.tsx` - Mobile-responsive nav, Dashboard link, dvh viewport units
- `apps/web/components/auth-nav.tsx` - Settings link for authenticated users
- `apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx` - Auth-protected dashboard shell with placeholder cards

## Decisions Made
- Root URL redirects to /uw-madison/cribai for chat-first experience (matches user decision from planning)
- Dashboard page requires authentication and redirects to /login if not signed in
- University name badge hidden on very small screens to preserve mobile nav space
- MobileNav uses animated hamburger icon (rotate/translate transforms) for polish

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in tests/e2e/auth.spec.ts (unrelated to this plan's changes) - ignored per scope boundary rules

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Campus seed data ready for auth testing (wisc.edu domain for .edu verification)
- Dashboard page shell ready for Phase 4+ feature population (appointments, saved listings)
- Mobile layout ready for chat interface testing
- Settings link prepares for Plan 03 (settings/profile page)

## Self-Check: PASSED

All 6 files verified present. Both task commits (bc0438a, 3d6955f) confirmed in git log.

---
*Phase: 01-auth-and-platform-foundation*
*Completed: 2026-03-05*
