---
phase: 23-chat-campus-context-profile-persistence
plan: "02"
subsystem: auth
tags: [auth, profile, supabase, user-metadata, tdd]
dependency_graph:
  requires: []
  provides: [AUTH-05-profile-persistence]
  affects: [apps/web/components/auth/AuthForm.tsx, apps/web/app/(main)/profile/page.tsx]
tech_stack:
  added: []
  patterns: [useCallback-async, supabase-updateUser, TDD-RED-GREEN]
key_files:
  created:
    - apps/web/components/auth/__tests__/AuthForm.persist.test.tsx
  modified:
    - apps/web/components/auth/AuthForm.tsx
    - apps/web/components/auth/__tests__/AuthForm.redirect.test.tsx
key_decisions:
  - "handleProfileComplete uses useCallback (consistent with sendOtpEmail and handleVerifyOtp above it)"
  - "setLoading/setError stable refs excluded from useCallback deps — only searchParams and router included"
  - "On success path: loading stays true until unmount (navigation fires) — no flicker/race"
  - "redirect tests required waitFor upgrade — handleProfileComplete is now async, synchronous expect(mockPush) fired before promise resolved"
metrics:
  duration: 7min
  completed: "2026-03-12"
  tasks_completed: 2
  files_changed: 3
---

# Phase 23 Plan 02: Profile Persistence (AUTH-05) Summary

Async `handleProfileComplete` in `AuthForm.tsx` — persists `full_name`, `university`, `graduation_year` to Supabase `user_metadata` via `updateUser` before navigating, closing the AUTH-05 gap where profile step data was silently discarded.

## What Was Built

### Task 0: AuthForm.persist.test.tsx (Wave 0 RED)

Created `apps/web/components/auth/__tests__/AuthForm.persist.test.tsx` with 4 tests covering:
1. `updateUser` called with correct metadata field names (`full_name`, `university`, `graduation_year`)
2. Navigation to `/explore` after successful `updateUser`
3. Error shown and navigation blocked when `updateUser` fails
4. `updateUser` called before `router.push` (no race condition)

Tests failed RED as expected — implementation not yet written.

### Task 1: Async handleProfileComplete + redirect test mock update (GREEN)

**`apps/web/components/auth/AuthForm.tsx`:**
- Replaced synchronous `function handleProfileComplete(_profile: ...)` with `const handleProfileComplete = useCallback(async (profile: ...) => {...}, [searchParams, router])`
- Calls `supabase.auth.updateUser({ data: { full_name, university, graduation_year } })` before navigation
- On error: `setError(updateError.message)` + `setLoading(false)` + `return` — blocks navigation
- On success: same `returnTo` validation logic as before, then `router.push(destination)`

**`apps/web/components/auth/__tests__/AuthForm.redirect.test.tsx`:**
- Added `updateUser: vi.fn().mockResolvedValue({ error: null })` to Supabase mock
- Wrapped all 3 redirect `expect(mockPush)` assertions in `await waitFor(...)` — required because `handleProfileComplete` is now async

## Verification Results

1. `pnpm --filter web test --run -- components/auth/__tests__/AuthForm` — 7 tests PASS (4 persist + 3 redirect)
2. `pnpm --filter web build` — zero TypeScript errors, build succeeds
3. `grep "updateUser" apps/web/components/auth/AuthForm.tsx` — confirms call with correct field names at line 138
4. `grep "handleProfileComplete" apps/web/components/auth/AuthForm.tsx` — confirms `useCallback` (async) at line 129
5. `grep "updateUser" apps/web/components/auth/__tests__/AuthForm.redirect.test.tsx` — confirms mock updated at line 98

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Redirect tests needed `waitFor` after `handleProfileComplete` became async**
- **Found during:** Task 1 (GREEN verification)
- **Issue:** `AuthForm.redirect.test.tsx` used synchronous `expect(mockPush).toHaveBeenCalledWith(...)` directly after `fireEvent.click`. After making `handleProfileComplete` async (with `await updateUser`), the synchronous assertions fired before the promise resolved — all 3 redirect tests failed.
- **Fix:** Wrapped each `expect(mockPush)` in `await waitFor(() => { ... })` in all 3 redirect test cases. No test assertions changed — only added async waiting.
- **Files modified:** `apps/web/components/auth/__tests__/AuthForm.redirect.test.tsx`
- **Commit:** 27a6c63

## Self-Check: PASSED

Files confirmed present:
- FOUND: apps/web/components/auth/__tests__/AuthForm.persist.test.tsx
- FOUND: apps/web/components/auth/AuthForm.tsx (modified)
- FOUND: apps/web/components/auth/__tests__/AuthForm.redirect.test.tsx (modified)

Commits confirmed:
- 934d863: test(23-02): add failing AuthForm.persist.test.tsx (Wave 0 RED)
- 27a6c63: feat(23-02): implement async handleProfileComplete with Supabase updateUser (GREEN)
