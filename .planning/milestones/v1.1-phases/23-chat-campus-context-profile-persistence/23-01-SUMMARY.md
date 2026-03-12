---
phase: 23-chat-campus-context-profile-persistence
plan: 01
subsystem: ui
tags: [chat, campus, context, server-component, supabase, innermost-wins]

# Dependency graph
requires:
  - phase: 22-token-cleanup-chat-multi-campus
    provides: ChatProvider with campusSlug prop and innermost-wins pattern
  - phase: 20-concierge-mount-design-cleanup
    provides: (main)/layout.tsx ConciergeShell structure
provides:
  - "(main)/layout.tsx inner ChatProvider with server-derived campusSlug"
  - "getDefaultCampusSlug DB fallback helper"
  - "Innermost-wins test proving nested ChatProvider slug isolation"
affects: [explore-page, listing-detail, chat-flow, campus-context]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server component derives campusSlug from user_metadata with DB + literal fallback"
    - "Inner ChatProvider wrapping in (main)/layout.tsx enables innermost-wins context override"

key-files:
  created: []
  modified:
    - apps/web/app/(main)/layout.tsx
    - apps/web/components/chat/__tests__/ChatProvider.test.tsx

key-decisions:
  - "(main)/layout.tsx derives campusSlug from user_metadata.campus_slug first, campus_configs DB row second, 'uw-madison' literal last"
  - "getDefaultCampusSlug typed via ReturnType<typeof createServerComponentClient> to avoid extra import"
  - "Inner ChatProvider wraps ConciergeShell so all (main) routes inherit campus context"

patterns-established:
  - "campusSlug derivation: metadata -> DB first row -> 'uw-madison' literal fallback"
  - "innermost-wins: each layout level wraps with ChatProvider; deepest provider's slug wins"

requirements-completed: [EXPL-04, DETAIL-05]

# Metrics
duration: 2min
completed: 2026-03-12
---

# Phase 23 Plan 01: campusSlug Derivation in (main)/layout.tsx Summary

**Server-derived campusSlug injected into inner ChatProvider in (main)/layout.tsx via user_metadata->campus_configs->literal fallback chain, unblocking Explore and Listing Detail chat flows**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-12T03:14:15Z
- **Completed:** 2026-03-12T03:16:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `getDefaultCampusSlug` async helper querying first `campus_configs` row with `uw-madison` last-resort fallback
- Wrapped `ConciergeShell` with `<ChatProvider campusSlug={campusSlug}>` in `(main)/layout.tsx` so all (main) routes (Explore, Listing Detail) have a real slug
- Added innermost-wins unit test verifying nested ChatProvider isolates slug; all 10 ChatProvider tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Derive campusSlug in (main)/layout.tsx and wrap children with inner ChatProvider** - `5950d72` (feat)
2. **Task 2: Add campusSlug derivation test to ChatProvider.test.tsx** - `074a0ba` (test)

**Plan metadata:** committed after SUMMARY creation (docs)

## Files Created/Modified
- `apps/web/app/(main)/layout.tsx` - Added ChatProvider import, getDefaultCampusSlug helper, campusSlug derivation, and inner ChatProvider wrapper around ConciergeShell
- `apps/web/components/chat/__tests__/ChatProvider.test.tsx` - Added innermost-wins test: nested provider with real slug sends that slug in POST body

## Decisions Made
- Typed `getDefaultCampusSlug` parameter as `ReturnType<typeof createServerComponentClient>` to avoid an extra `SupabaseClient` import
- Used `resolvedUser?.user_metadata?.campus_slug` (not raw `user`) to include dev-auth header fallback in slug derivation
- Inner ChatProvider wraps `ConciergeShell` (not the other way) to keep ConciergeShell inside the chat context tree

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- EXPL-04 and DETAIL-05 are unblocked: Explore page chat now sends non-empty campusSlug to /api/ai/cribai
- Listing Detail MobileBottomBar chat inherits valid campusSlug from (main)/layout.tsx ChatProvider
- Root layout ChatProvider remains unchanged (empty default, innermost-wins preserved)

---
*Phase: 23-chat-campus-context-profile-persistence*
*Completed: 2026-03-12*
