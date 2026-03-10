---
phase: 09-v1-integration-polish-doc-cleanup
plan: 01
subsystem: api
tags: [supabase, nextjs, dev-auth, postgresql]

# Dependency graph
requires:
  - phase: 08-close-audit-gaps-verify-phase-4
    provides: Dev auth pattern established in messages/route.ts, audit gaps identified
  - phase: 06-chat-persistence-submit-listing
    provides: submit-listing API route and conversations API route initial implementations
provides:
  - contact_email column on listings table (migration 011)
  - contact_email persisted in submit-listing API (no more silent data loss)
  - Dev auth bypass on GET /api/conversations/[id] (BYPASS_AUTH=true parity)
affects: [10-production-launch, e2e-testing]

# Tech tracking
tech-stack:
  added: []
  patterns: [dev-auth bypass replicated from messages/route.ts to conversations/[id]/route.ts]

key-files:
  created:
    - supabase/migrations/011_add_contact_email_to_listings.sql
  modified:
    - apps/web/app/api/submit-listing/route.ts
    - apps/web/app/api/conversations/[id]/route.ts

key-decisions:
  - "Import path for dev-auth from conversations/[id]/route.ts is 4 levels (../../../../lib/dev-auth), not 5 — one level shallower than messages/route.ts"
  - "Added explicit user_id filter on conversation query in dev mode (service-role client bypasses RLS, so filter is needed for correctness)"

patterns-established:
  - "Dev auth bypass pattern: isDevAuthEnabled() branch + createSecretClient() for all API routes needing auth"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-10
---

# Phase 09 Plan 01: API Integration Gaps Summary

**contact_email persisted to listings DB via migration + API route fix, and GET /api/conversations/[id] gains dev auth bypass matching messages/route.ts pattern**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-10T18:07:33Z
- **Completed:** 2026-03-10T18:12:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created migration 011 adding `contact_email text` column to listings table with `IF NOT EXISTS` for idempotency
- Wired `contact_email` through submit-listing route: destructured from Zod payload and included in INSERT — eliminates INT-01 silent data loss
- Added dev auth bypass to `GET /api/conversations/[id]` matching the established pattern from messages/route.ts — fixes INT-02 conversation sidebar reload in dev mode

## Task Commits

Each task was committed atomically:

1. **Task 1: Add contact_email column and wire through submit-listing API** - `fc3fe99` (feat)
2. **Task 2: Add dev auth bypass to GET /api/conversations/[id]** - `440524e` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `supabase/migrations/011_add_contact_email_to_listings.sql` - ALTER TABLE listings ADD COLUMN IF NOT EXISTS contact_email text
- `apps/web/app/api/submit-listing/route.ts` - Destructures contact_email from Zod payload; adds contact_email to INSERT object
- `apps/web/app/api/conversations/[id]/route.ts` - Adds dev auth imports, resolves userId via dev cookie in BYPASS_AUTH mode, uses createSecretClient() for DB queries in dev mode

## Decisions Made
- Import path for dev-auth from `conversations/[id]/route.ts` is 4 levels (`../../../../lib/dev-auth`), not 5 — this route is one level shallower than `messages/route.ts`
- Added explicit `.eq('user_id', userId)` filter on conversation query so that when using service-role client in dev mode (which bypasses RLS), the query is still scoped to the resolved dev user

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Migration 011 must be applied to the Supabase database when deploying.

## Next Phase Readiness
- INT-01 and INT-02 integration gaps are closed
- Phase 09 plan 02 (documentation cleanup) can proceed
- Supabase migration 011 must be applied in production before submit-listing form is used

## Self-Check: PASSED

- `supabase/migrations/011_add_contact_email_to_listings.sql` - FOUND
- `apps/web/app/api/submit-listing/route.ts` contains `contact_email` - FOUND (2 occurrences)
- `apps/web/app/api/conversations/[id]/route.ts` contains `isDevAuthEnabled` - FOUND (3 occurrences)
- Commits fc3fe99 and 440524e - FOUND

---
*Phase: 09-v1-integration-polish-doc-cleanup*
*Completed: 2026-03-10*
