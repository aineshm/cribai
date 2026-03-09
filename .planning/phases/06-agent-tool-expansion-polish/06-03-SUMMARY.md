---
phase: 06-agent-tool-expansion-polish
plan: 03
subsystem: ui, api
tags: [form, listing-submission, manual-data, supabase, zod-validation, sonner]

# Dependency graph
requires:
  - phase: 06-01
    provides: Chat persistence with sidebar
  - phase: 06-02
    provides: Placeholder tools and enhanced schedule_tour
provides:
  - Manual listing submission form at /[campusSlug]/submit-listing
  - POST /api/submit-listing API route with Zod validation
  - listingSubmissionSchema in packages/types
  - Phase 6 end-to-end verified
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [service-role insert for manual listings, client-side Zod validation with field-level errors]

key-files:
  created:
    - apps/web/app/(campus)/[campusSlug]/submit-listing/page.tsx
    - apps/web/components/submit-listing-form.tsx
    - apps/web/app/api/submit-listing/route.ts
    - packages/types/src/listing.ts
  modified:
    - apps/web/app/(campus)/[campusSlug]/layout.tsx
    - apps/web/components/mobile-nav.tsx
    - packages/types/src/index.ts

key-decisions:
  - "Service-role client for listing insert (same pattern as save-web-listing)"
  - "Auth required for submission page (server-side redirect to /login)"
  - "Submit Listing nav link visible only to authenticated users"

patterns-established:
  - "Manual data submission: Zod schema validates client-side before fetch POST, service-role upserts server-side"

requirements-completed: [DATA-03]

# Metrics
duration: 2min
completed: 2026-03-09
---

# Phase 6 Plan 03: Manual Listing Submission Summary

**Manual listing submission form with Zod validation, service-role insert, and Phase 6 end-to-end verification**

## Performance

- **Duration:** 2 min (continuation from checkpoint)
- **Started:** 2026-03-09T14:45:21Z
- **Completed:** 2026-03-09T14:47:29Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Manual listing submission form with address, rent, bedrooms, bathrooms, sqft, amenities, description, contact email, and source URL fields
- POST /api/submit-listing API route with Zod validation and service-role Supabase insert (source='manual')
- Submit Listing nav link added to both desktop layout and mobile nav (auth-gated)
- Phase 6 end-to-end verification approved: chat persistence, placeholder tools, schedule tour conflicts, manual submission, and map tool all working

## Task Commits

Each task was committed atomically:

1. **Task 1: Manual listing submission form and API** - `8a825c2` (feat)
2. **Task 2: Phase 6 end-to-end verification** - checkpoint:human-verify (approved)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `packages/types/src/listing.ts` - listingSubmissionSchema with Zod validation
- `packages/types/src/index.ts` - Re-export listing types
- `apps/web/components/submit-listing-form.tsx` - Client form component with field-level validation and sonner toasts
- `apps/web/app/api/submit-listing/route.ts` - POST endpoint with auth check, Zod parse, service-role insert
- `apps/web/app/(campus)/[campusSlug]/submit-listing/page.tsx` - Server component page with auth redirect
- `apps/web/app/(campus)/[campusSlug]/layout.tsx` - Added Submit Listing nav link (auth-gated)
- `apps/web/components/mobile-nav.tsx` - Added Submit Listing mobile nav link (auth-gated)

## Decisions Made
- Service-role client used for listing insert (bypasses RLS, consistent with save-web-listing pattern)
- Auth required server-side on submit-listing page (redirect to /login if not authenticated)
- Submit Listing nav link only visible to authenticated users in both desktop and mobile navigation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All Phase 6 requirements complete (CHAT-01, CHAT-02, CHAT-03, AGENT-03, AGENT-04, DATA-03)
- CampusNest v1 feature set is complete
- Ready for production deployment

## Self-Check: PASSED

- [x] submit-listing/page.tsx exists
- [x] submit-listing-form.tsx exists
- [x] api/submit-listing/route.ts exists
- [x] packages/types/src/listing.ts exists
- [x] Commit 8a825c2 exists in git log

---
*Phase: 06-agent-tool-expansion-polish*
*Completed: 2026-03-09*
