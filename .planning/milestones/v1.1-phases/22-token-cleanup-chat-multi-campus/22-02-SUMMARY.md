---
phase: 22-token-cleanup-chat-multi-campus
plan: "02"
subsystem: ui
tags: [react, context, chat, nextjs, campus]

# Dependency graph
requires:
  - phase: 18-explore-page-wiring
    provides: ChatProvider with hardcoded uw-madison slug (Phase 18 deferral)
  - phase: 22-token-cleanup-chat-multi-campus
    provides: Plan 22-01 (design token cleanup precondition)
provides:
  - ChatProvider accepts optional campusSlug prop (string, defaults to empty string)
  - Campus layout injects real campusSlug from route params into ChatProvider
  - CribAI API calls from campus routes include the correct campus context
  - Root layout ChatProvider retained with empty string default for explore page coverage
affects:
  - any future campus that uses CribAI chat (correct slug sent automatically)
  - EXPL-04 requirement now satisfied

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Innermost-wins React context: campus layout wraps content with slug-aware ChatProvider; root layout provides fallback with empty string
    - Explicit prop interface over implicit context reads (ChatProvider does not use useCampus() to avoid throwing outside campus routes)

key-files:
  created: []
  modified:
    - apps/web/components/chat/ChatProvider.tsx
    - apps/web/app/(campus)/[campusSlug]/layout.tsx
    - apps/web/components/chat/__tests__/ChatProvider.test.tsx

key-decisions:
  - "ChatProvider uses explicit prop (campusSlug?: string, default '') rather than useCampus() hook — hook would throw when ChatProvider is mounted in root layout outside campus route tree"
  - "Campus layout mounts a second ChatProvider wrapping CampusProvider — innermost context wins, so campus routes get real slug; explore page uses root layout provider with empty string"
  - "campusSlug added to useCallback dependency array so sendMessage closure always reads the current prop value"

patterns-established:
  - "Prop over hook pattern: when a client component is mounted at multiple levels of the route tree, pass data via explicit prop rather than consuming a context that may not be present at all mount sites"

requirements-completed: [EXPL-04]

# Metrics
duration: 2min
completed: "2026-03-12"
---

# Phase 22 Plan 02: ChatProvider Multi-Campus Support Summary

**ChatProvider made campus-aware via explicit prop injection — hardcoded 'uw-madison' removed, campus layout passes real slug from route params, explore page unaffected via root layout fallback**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-12T01:09:29Z
- **Completed:** 2026-03-12T01:11:53Z
- **Tasks:** 2 (TDD + wiring)
- **Files modified:** 3

## Accomplishments
- Removed hardcoded `'uw-madison'` from ChatProvider — CribAI now receives the correct campus slug for any campus
- ChatProvider accepts optional `campusSlug?: string` prop with empty string default covering root layout / explore page
- Campus layout (`[campusSlug]/layout.tsx`) wraps its content tree with `<ChatProvider campusSlug={campusSlug}>`, injecting the real slug from route params
- All 9 ChatProvider unit tests pass; 2 new tests added (prop-injected slug assertion, empty string when no prop)
- Build passes with zero errors; no hardcoded campus slug anywhere in ChatProvider

## Task Commits

Each task was committed atomically:

1. **Task 1: Update ChatProvider to accept campusSlug prop, update test** - `8107fdd` (feat, TDD GREEN)
2. **Task 2: Inject campusSlug into ChatProvider from campus layout** - `2be8f08` (feat)

## Files Created/Modified
- `apps/web/components/chat/ChatProvider.tsx` - Added `ChatProviderProps` interface, `campusSlug?: string` prop with `''` default, prop value injected into fetch body, `campusSlug` in useCallback deps
- `apps/web/app/(campus)/[campusSlug]/layout.tsx` - Added ChatProvider import, wrapped `CampusProvider` tree with `<ChatProvider campusSlug={campusSlug}>`
- `apps/web/components/chat/__tests__/ChatProvider.test.tsx` - Updated existing test to use `campusSlug="test-campus"` prop and assert injected value; added new test for empty string default

## Decisions Made
- Used explicit prop rather than `useCampus()` hook — `useCampus()` would throw when ChatProvider is mounted in the root layout, outside any `CampusProvider` ancestor. Prop is the safe, testable interface.
- Innermost-wins React context pattern: campus layout provides a scoped `ChatProvider` with the real slug; root layout `ChatProvider` (no prop, defaults to `''`) remains to cover the explore page and other `(main)` routes. No route-guarding or `usePathname()` needed.
- `campusSlug` added to `useCallback` dependency array — required for closure correctness when the prop value changes.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing test failures in `map-block.test.tsx`, `freshness-badge.test.tsx`, and `ProfilePage.test.tsx` appeared in the full suite run. These are documented as out-of-scope in Phase 18-02 STATE.md decision. Not caused by this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- EXPL-04 fully closed: CribAI slide-over panel sends the correct campus slug for every campus
- Phase 22 plans remaining: none (this was plan 02 of 02)
- Any new campus added to the DB automatically receives correct CribAI context with no code changes required

## Self-Check: PASSED

All files present and both commits verified on branch.

---
*Phase: 22-token-cleanup-chat-multi-campus*
*Completed: 2026-03-12*
