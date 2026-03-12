---
phase: 19-auth-flow-route-protection
plan: "02"
subsystem: profile-ui
tags: [auth, profile, navigation, chat, gap-closure]
dependency_graph:
  requires: [19-01]
  provides: [PROF-01, PROF-02, DETAIL-05]
  affects: [apps/web/app/(main)/profile, apps/web/components/profile, apps/web/components/listing]
tech_stack:
  added: ["@testing-library/user-event@14"]
  patterns: [server-component-client-split, dev-auth-fallback, link-navigation, context-wiring]
key_files:
  created:
    - apps/web/components/profile/ProfilePageClient.tsx
    - apps/web/components/profile/__tests__/SavedListings.test.tsx
    - apps/web/components/listing/__tests__/MobileBottomBar.test.tsx
  modified:
    - apps/web/app/(main)/profile/page.tsx
    - apps/web/components/profile/SavedListings.tsx
    - apps/web/components/listing/MobileBottomBar.tsx
    - apps/web/components/profile/__tests__/ProfileHeader.test.tsx
decisions:
  - "Server Component reads real Supabase session via createServerComponentClient; dev-auth fallback reads x-dev-user-json header to prevent redirect loop in dev"
  - "Name resolution uses full_name ?? display_name ?? email prefix fallback chain to cover both real Supabase and dev-auth shapes"
  - "isVerified checks email_confirmed_at presence with 'in' guard; dev-auth users default to true since field is absent"
  - "motion.div kept as outer wrapper for SavedListings stagger — Link sits inside it around Card"
  - "Auto-fixed: installed @testing-library/user-event (missing dev dependency blocking MobileBottomBar test)"
metrics:
  duration: "~95 min (including rate-limit pause)"
  completed: "2026-03-11"
  tasks_completed: 2
  files_changed: 7
---

# Phase 19 Plan 02: Profile Auth Wiring + Link Navigation Summary

**One-liner:** Profile page converted to Server Component fetching real Supabase session with dev-auth fallback, saved listing cards wired to Link navigation, and mobile Chat button enabled via ChatProvider context.

## What Was Built

### Task 1 — Profile page Server Component with real session data (PROF-01)

`apps/web/app/(main)/profile/page.tsx` was a `'use client'` component with hardcoded "Alex Johnson" props. It is now an async Server Component that:

1. Fetches the authenticated user via `createServerComponentClient` + `supabase.auth.getUser()`
2. Falls back to `x-dev-user-json` request header for dev-auth mode (prevents infinite redirect in development)
3. Redirects to `/login?returnTo=/profile` only when both paths return null
4. Extracts `full_name ?? display_name ?? email-prefix` for the display name
5. Renders `<ProfilePageClient>` passing all resolved props

`ProfilePageClient.tsx` was extracted as a new `'use client'` component that accepts the resolved session props and owns the `motion.div`, `Tabs`, and tab content rendering.

Two new tests were added to `ProfileHeader.test.tsx` confirming name and university are rendered from props (not hardcoded).

### Task 2 — SavedListings Link navigation + MobileBottomBar Chat wiring (PROF-02, DETAIL-05)

`SavedListings.tsx`: Each `<Card>` in the `items.map()` is now wrapped in `<Link href={/listing/${listing.id}} className="block">` inside the existing `<motion.div>` stagger wrapper.

`MobileBottomBar.tsx`: Imports `useChatContext` from `ChatProvider`, calls `setOpen: openChat` destructured from context, and the Chat button now uses `onClick={() => openChat(true)}` with no `disabled` attribute.

## Tests

| File | Tests | Status |
|---|---|---|
| ProfileHeader.test.tsx | 10 (+2 PROF-01 tests) | PASS |
| SavedListings.test.tsx | 3 (new) | PASS |
| MobileBottomBar.test.tsx | 2 (new) | PASS |
| **Total** | **15** | **15/15 PASS** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Missing @testing-library/user-event dev dependency**
- **Found during:** Task 2 — MobileBottomBar test file failed to resolve import
- **Issue:** `@testing-library/user-event` was not installed in `apps/web`
- **Fix:** `pnpm add -D @testing-library/user-event` in `apps/web`
- **Files modified:** `apps/web/package.json`, `pnpm-lock.yaml`
- **Commit:** f0f12f7

## Commits

| Hash | Task | Description |
|---|---|---|
| ba552aa | Task 1 | feat(19-02): convert profile page to Server Component with real session data |
| f0f12f7 | Task 2 | feat(19-02): add Link navigation to SavedListings and wire MobileBottomBar Chat button |

## Self-Check: PASSED

- [x] `apps/web/components/profile/ProfilePageClient.tsx` — exists
- [x] `apps/web/app/(main)/profile/page.tsx` — no `'use client'` directive, has `createServerComponentClient`
- [x] `apps/web/components/profile/SavedListings.tsx` — contains `next/link` import
- [x] `apps/web/components/listing/MobileBottomBar.tsx` — contains `useChatContext`
- [x] All 15 tests pass
- [x] Commits ba552aa and f0f12f7 exist in git log
