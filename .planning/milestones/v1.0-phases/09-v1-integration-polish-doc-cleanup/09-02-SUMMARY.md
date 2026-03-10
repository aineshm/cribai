---
phase: 09-v1-integration-polish-doc-cleanup
plan: 02
subsystem: middleware, documentation
tags: [auth, middleware, protected-routes, roadmap]
dependency_graph:
  requires: []
  provides: [broadened-auth-protection, accurate-roadmap]
  affects: [apps/web/middleware.ts, .planning/ROADMAP.md]
tech_stack:
  added: []
  patterns: [middleware-first-auth-protection, defence-in-depth]
key_files:
  created: []
  modified:
    - apps/web/middleware.ts
    - .planning/ROADMAP.md
decisions:
  - "Kept campusMatch for last_campus cookie-setting (cribai pages only); added separate protectedRouteMatch for broader auth gating"
  - "Marked 09-01-PLAN.md complete in ROADMAP.md since it was executed in prior session (commit fc3fe99)"
  - "Updated Phase 9 progress row to 2/2 Complete"
metrics:
  duration: 2min
  completed_date: 2026-03-10
  tasks_completed: 2
  files_modified: 2
---

# Phase 9 Plan 02: Middleware Protected Route Expansion + ROADMAP Checkmark Cleanup Summary

**One-liner:** Broadened Next.js middleware auth guard from `/*/cribai` only to all five campus route types (cribai, dashboard, saved, notifications, submit-listing) and corrected stale ROADMAP.md checkmarks.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Expand middleware protected route coverage | 3403037 | apps/web/middleware.ts |
| 2 | Fix stale ROADMAP.md checkmarks and update Phase 9 plan list | 1e8f66b | .planning/ROADMAP.md |

## What Was Built

### Task 1: Middleware Auth Expansion

The production auth guard in `apps/web/middleware.ts` previously only protected `/*/cribai` routes. Any unauthenticated user visiting `/uw-madison/dashboard`, `/uw-madison/saved`, `/uw-madison/notifications`, or `/uw-madison/submit-listing` would get a server render before the page-level guard could redirect them.

The change introduces a `protectedRouteMatch` regex alongside the existing `campusMatch`:

- `campusMatch` (`/^\/([^/]+)\/cribai/`) — retained solely for `last_campus` cookie-setting behavior
- `protectedRouteMatch` (`/^\/([^/]+)\/(cribai|dashboard|saved|notifications|submit-listing)/`) — drives the auth redirect

This preserves the dev auth early-return path (dev auth still returns before this code runs), the rate limiting section, and the API route guards. The `/login` route is unaffected (it has no campus slug prefix).

Build passed with zero errors.

### Task 2: ROADMAP.md Checkmark Cleanup

Audit found:
- `09-01-PLAN.md` was already executed (commit `fc3fe99`) but still marked `[ ]`
- `09-02-PLAN.md` (current plan) needed to be marked complete
- Phase 9 progress row showed `0/2 Planned` instead of `2/2 Complete`

All three were corrected. After this change, zero `[ ]` plan checkmarks remain in ROADMAP.md — all completed plans are accurately marked `[x]`.

## Deviations from Plan

### Auto-fixed Issues

None.

**Additional work beyond plan scope:**
The plan mentioned fixing `[ ]` for 05-04 and 05-05 if stale — those were already `[x]` so no change was needed. The 09-01-PLAN.md checkmark fix was identified from git log (commit fc3fe99 existed but checkmark had not been updated) — treated as the same cleanup task.

The Phase 9 progress row update (0/2 Planned → 2/2 Complete) was a natural extension of marking both plans complete; no deviation from intent.

## Verification

1. `pnpm --filter @campusnest/web build` — passed, zero errors
2. `apps/web/middleware.ts` contains regex with `dashboard|saved|notifications|submit-listing` — confirmed
3. `.planning/ROADMAP.md` has zero `[ ]` checkmarks for any plan entry — confirmed (grep count: 0)

## Self-Check

Files exist:
- apps/web/middleware.ts — modified
- .planning/ROADMAP.md — modified

Commits exist:
- 3403037 — feat(09-02): expand middleware auth protection to all campus routes
- 1e8f66b — docs(09-02): update ROADMAP.md checkmarks and Phase 9 completion status
