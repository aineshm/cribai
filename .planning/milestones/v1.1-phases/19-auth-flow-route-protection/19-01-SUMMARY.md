---
phase: 19-auth-flow-route-protection
plan: "01"
subsystem: auth
tags: [auth, middleware, routing, redirect, tdd]
dependency_graph:
  requires: []
  provides: [AUTH-06-redirect, POST-01-route-guard]
  affects: [apps/web/middleware.ts, apps/web/components/auth/AuthForm.tsx, apps/web/app/auth/confirm/route.ts]
tech_stack:
  added: []
  patterns: [returnTo-param, flat-route-protection, tdd-red-green]
key_files:
  created:
    - apps/web/components/auth/__tests__/AuthForm.redirect.test.tsx
    - apps/web/lib/__tests__/middleware.test.ts
  modified:
    - apps/web/components/auth/AuthForm.tsx
    - apps/web/app/auth/confirm/route.ts
    - apps/web/middleware.ts
decisions:
  - "Used protectedFlatRoutes array in middleware so future flat routes can be added in one place"
  - "Fixed 'next' -> 'returnTo' for campus routes too — consistent param name throughout the app"
  - "auth/confirm/route.ts: removed lastCampus fallback entirely, simplified to '/explore'"
metrics:
  duration: "~35min (two-agent session with resume)"
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_created: 2
  files_modified: 3
---

# Phase 19 Plan 01: Auth Flow Route Protection Summary

**One-liner:** Closed AUTH-06 and POST-01 gaps — post-OTP redirect now goes to /explore, middleware protects /post and /profile with consistent returnTo param.

## Tasks Completed

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Fix post-auth redirect and auth/confirm fallback | d8fd026 | Done |
| 2 | Add middleware route protection for /post and /profile | 80022d9 | Done |

## What Was Built

### Task 1 — Post-auth redirect fixes (AUTH-06)

Three bugs fixed in the auth flow:

1. `AuthForm.tsx` line 135: default redirect changed from `/uw-madison/cribai` to `/explore`. Open redirect guard retained — only safe relative paths pass through.

2. `app/auth/confirm/route.ts`: fallback simplified from `(lastCampus ? /\${lastCampus}/cribai : '/')` to `'/explore'`. The `lastCampus` cookie logic was unnecessary complexity — the email-link confirm route should always land on `/explore` when no explicit `next` param is provided.

3. `middleware.ts` dev-mode `/login` redirect: changed from `/${lastCampus}/cribai` to `/explore`. Unused `lastCampus` variable left in place (read from cookie earlier in the block) — this is harmless.

Test coverage: 3 cases in `AuthForm.redirect.test.tsx` — no returnTo, valid returnTo, open redirect attempt.

### Task 2 — Flat route protection + returnTo consistency (POST-01)

Two changes to `middleware.ts`:

1. Added `protectedFlatRoutes = ['/post', '/profile']` block before the existing campus route check. Unauthenticated requests to these paths redirect to `/login?returnTo=<path>`.

2. Fixed existing campus route redirect: changed `searchParams.set('next', pathname)` to `searchParams.set('returnTo', pathname)`. The `next` param was a silent mismatch — `AuthForm.handleProfileComplete` only reads `returnTo`, so campus route redirect-after-login was broken.

Test coverage: 5 cases in `middleware.test.ts` — /post unauthenticated, /profile unauthenticated, /post authenticated (passthrough), campus route redirect, campus route uses returnTo.

## Deviations from Plan

None — plan executed exactly as written.

## Pre-existing Test Failures (Out of Scope)

The following test files had failures unrelated to this plan's changes. They were pre-existing before this plan executed and are logged for future resolution:

- `components/chat/__tests__/map-block.test.tsx` — 5 failures (map library not rendering in happy-dom)
- `__tests__/freshness-badge.test.tsx` — 4 failures (boundary day off-by-one in date math)

These are not caused by or related to auth flow or middleware changes.

## Self-Check: PASSED

All files confirmed present. Both commits (d8fd026, 80022d9) confirmed in git log.
