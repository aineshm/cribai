---
phase: 01-auth-and-platform-foundation
plan: 01
subsystem: auth
tags: [supabase, magic-link, otp, sonner, toast, edu-validation, vitest]

requires: []
provides:
  - Working magic link auth flow with safe URL construction
  - .edu email validation utility (isEduEmail)
  - Error_code handling for expired/used magic links
  - Toast notification system via sonner
  - Vitest test infrastructure for web app
affects: [02-profile-management, 03-campus-pages]

tech-stack:
  added: [sonner, vitest]
  patterns: [edu-validation-utility, toast-error-feedback, error-param-mapping]

key-files:
  created:
    - apps/web/lib/edu-validation.ts
    - apps/web/lib/__tests__/edu-validation.test.ts
    - apps/web/vitest.config.ts
  modified:
    - apps/web/app/auth/callback/route.ts
    - apps/web/app/(auth)/login/page.tsx
    - apps/web/app/layout.tsx
    - apps/web/package.json

key-decisions:
  - "Extracted isEduEmail to lib/edu-validation.ts for testability and reuse"
  - "Used useSearchParams + window.history.replaceState for error param handling (no full navigation)"
  - "Default redirect changed from / to /uw-madison/cribai for authenticated users without last_campus cookie"

patterns-established:
  - "Error param pattern: callback redirects to /login?error=code, login page maps codes to user-friendly messages via toast"
  - "Validation utility pattern: pure functions in lib/ with co-located __tests__/"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03]

duration: 5min
completed: 2026-03-05
---

# Phase 1 Plan 1: Fix Auth Flow Summary

**Fixed broken magic link auth with .edu validation, expired link handling, and toast error feedback via sonner**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-05T08:50:18Z
- **Completed:** 2026-03-05T08:55:22Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Fixed broken auth callback by deleting duplicate route and enhancing the working one with error_code handling
- Added .edu email validation that blocks non-.edu emails before any server call
- Installed sonner and added toast notifications for auth error feedback
- Created vitest test infrastructure with 8 passing tests for edu validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix auth callback, add .edu validation, install sonner** - `cac31cb` (fix)
2. **Task 2: Unit tests for edu validation and auth callback** - `219a8eb` (test)

## Files Created/Modified
- `apps/web/lib/edu-validation.ts` - isEduEmail utility for .edu domain validation
- `apps/web/lib/__tests__/edu-validation.test.ts` - 8 test cases for edu validation
- `apps/web/vitest.config.ts` - Vitest config with path alias support
- `apps/web/app/auth/callback/route.ts` - Enhanced with error_code handling and /uw-madison/cribai default
- `apps/web/app/(auth)/login/page.tsx` - .edu validation, fixed redirect, toast error display
- `apps/web/app/layout.tsx` - Added Toaster component from sonner
- `apps/web/package.json` - Added sonner, vitest, test script
- `apps/web/app/(auth)/callback/route.ts` - DELETED (broken duplicate)

## Decisions Made
- Extracted isEduEmail to a separate utility file for testability and potential reuse in other contexts
- Used useSearchParams hook instead of raw window.location for reading error params (Next.js idiomatic)
- Changed default unauthenticated redirect from / to /uw-madison/cribai since UW Madison is the primary launch campus

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in `apps/web/tests/e2e/auth.spec.ts` cause tsc --noEmit to fail. These errors are unrelated to this plan's changes (syntax errors in Playwright test file). Logged to deferred-items.md for future resolution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Auth flow is functional: magic link -> callback -> authenticated redirect
- Toast notification system ready for use across the app
- Vitest infrastructure ready for additional unit tests
- Session persistence confirmed by existing middleware getUser() pattern

## Self-Check: PASSED

All 6 created/modified files verified on disk. Both task commits (cac31cb, 219a8eb) verified in git log.

---
*Phase: 01-auth-and-platform-foundation*
*Completed: 2026-03-05*
