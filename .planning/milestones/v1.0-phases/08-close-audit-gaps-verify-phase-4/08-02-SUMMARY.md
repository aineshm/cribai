---
phase: 08-close-audit-gaps-verify-phase-4
plan: "02"
subsystem: pipeline, api
tags: [pageindex, dev-auth, dead-code, nightly-scrape, messages-route]
dependency_graph:
  requires: []
  provides: [pageindex-rebuild-pipeline, messages-dev-auth]
  affects: [.github/workflows/nightly-scrape.yml, apps/web/app/api/conversations/[id]/messages/route.ts]
tech_stack:
  added: []
  patterns: [dev-auth-bypass, service-role-writeClient, gha-step-gating]
key_files:
  created: []
  modified:
    - .github/workflows/nightly-scrape.yml
    - apps/web/app/api/conversations/[id]/messages/route.ts
  deleted:
    - apps/web/app/api/save-web-listing/route.ts
decisions:
  - "Import path for dev-auth from messages/route.ts is 5 levels (../../../../../lib/dev-auth), not 4 as in plan"
  - "Plan-noted 4-level import path was incorrect; auto-corrected to 5 levels matching actual directory depth"
metrics:
  duration: 6min
  completed_date: "2026-03-10"
  tasks: 3
  files_changed: 3
---

# Phase 8 Plan 02: Mechanical Audit Gap Fixes Summary

**One-liner:** Nightly pipeline now rebuilds PageIndex after embeddings, messages API route uses dev auth bypass with service-role writeClient, and dead save-web-listing route removed (63 lines eliminated).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add PageIndex rebuild step to nightly pipeline | a90357c | `.github/workflows/nightly-scrape.yml` |
| 2 | Wire dev auth bypass in messages API route | 28664e0, 940dc00 | `apps/web/app/api/conversations/[id]/messages/route.ts` |
| 3 | Remove dead /api/save-web-listing route | 101d3e3 | `apps/web/app/api/save-web-listing/route.ts` (deleted) |

## What Was Built

### Task 1: PageIndex Rebuild in Nightly Pipeline
Added two steps to `.github/workflows/nightly-scrape.yml` after the "Write embedding summary" step:
- `Rebuild PageIndex for CribAI context`: Gated on `success() && steps.embed.outcome == 'success'`, POSTs to `rebuild-pageindex` Edge Function, exits 1 on HTTP >= 400.
- `Write PageIndex rebuild summary`: Appends result to GitHub Actions job summary, matching the existing embedding summary pattern.

This ensures CribAI's PageIndex is refreshed every time fresh embeddings are generated, keeping AI context current.

### Task 2: Dev Auth in Messages API
Modified `apps/web/app/api/conversations/[id]/messages/route.ts` to match the dev auth pattern from `conversations/route.ts`:
- Import `isDevAuthEnabled`, `getDevUserById`, `DEFAULT_DEV_USER`, `DEV_USER_COOKIE` from `lib/dev-auth`
- Import `createSecretClient` for service-role writes
- Resolve userId via cookie in dev mode, `supabase.auth.getUser()` in production
- `writeClient = isDevAuthEnabled() ? createSecretClient() : supabase` used for both message INSERT and conversation UPDATE

Both DB writes use `writeClient` to prevent silent RLS failures when the fake dev user ID doesn't own the conversation.

### Task 3: Remove Dead Route
Deleted `apps/web/app/api/save-web-listing/route.ts` (63 lines). Confirmed no callers in source code — `persistWebListing` is invoked directly in `packages/ai/src/tools/handlers/web-search.ts` lines 106 and 143. The function and its tests remain intact.

## Verification Results

```
check1 (rebuild-pageindex in workflow): PASS
check2 (isDevAuthEnabled in messages route): PASS
check3 (save-web-listing route deleted): PASS
pnpm run build: PASS (7/7 tasks successful)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect dev-auth import path depth**
- **Found during:** Task 2 — build failure after first commit
- **Issue:** Plan specified 4-level relative path (`../../../../lib/dev-auth`) but the route is 5 levels deep from `apps/web/` root (`app/api/conversations/[id]/messages/route.ts`)
- **Fix:** Corrected to `../../../../../lib/dev-auth` (5 levels), matching actual directory depth
- **Files modified:** `apps/web/app/api/conversations/[id]/messages/route.ts`
- **Commit:** 940dc00 (captured in docs(08-01) commit due to amend timing)

## Self-Check

All three tasks delivered with correct final file state. Build passes with zero new errors. Import path fix applied correctly.
