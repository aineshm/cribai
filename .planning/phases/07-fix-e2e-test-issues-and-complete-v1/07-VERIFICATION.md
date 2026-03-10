---
phase: 07-fix-e2e-test-issues-and-complete-v1
verified: 2026-03-10T05:00:00Z
status: passed
score: 13/13 must-haves verified
re_verification:
  previous_status: passed
  previous_score: 9/9
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  new_plans_verified:
    - "07-03: Favicon CN, dashboard 2-col grid, mark-read dev UUID, Saved badge removed"
    - "07-04: CribAI tool steering, submit form section redesign"
gaps: []
human_verification:
  - test: "Favicon renders 'CN' in browser tab"
    expected: "Green 'CN' icon (not just 'C') appears in browser tab on all pages — no 404 in network tab"
    why_human: "Next.js ImageResponse serving cannot be verified without a running server"
  - test: "Price filter in action"
    expected: "Setting min/max price in listings UI excludes $0 and null-rent cards from results"
    why_human: "Requires live Supabase data and browser interaction"
  - test: "CribAI schedule_tour in dev mode"
    expected: "Asking CribAI to schedule a tour in dev auth mode succeeds without 'You must be signed in' error"
    why_human: "Requires running app with dev auth cookie set"
  - test: "Conversation persistence"
    expected: "After a CribAI conversation, refreshing the page restores messages from DB"
    why_human: "Requires authenticated session and live Supabase DB"
  - test: "CribAI tool selection — no redundant search"
    expected: "When user says 'schedule a tour for the first listing' after a search, CribAI proceeds to schedule_tour directly without re-running search_listings"
    why_human: "Requires live Gemini model interaction with actual conversation context"
  - test: "Mark-all-read with dev user"
    expected: "Clicking 'Mark All as Read' on the notifications page marks all notifications for the dev UUID (not 'dev-user-1') as read"
    why_human: "Requires running app with dev auth and live Supabase notifications table"
---

# Phase 07: Fix E2E Test Issues and Complete V1 — Verification Report

**Phase Goal:** Fix E2E test issues, address UAT gaps, and complete v1 polish — favicon, dashboard layout, notification system, CribAI tool selection, submit form UX.
**Verified:** 2026-03-10
**Status:** passed
**Re-verification:** Yes — after Plans 03 and 04 gap closure (previous score 9/9 from Plans 01-02, now 13/13 including Plans 03-04)

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                          | Status   | Evidence                                                                                      |
| --- | ---------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| 1   | Price filter excludes listings with $0 or null rent when min/max price is set                  | VERIFIED | `listings/page.tsx` lines 60-68: `.not('rent_monthly','is',null).gt('rent_monthly',0)`        |
| 2   | CribAI schedule_tour tool works in dev auth mode without sign-in error                         | VERIFIED | `cribai/route.ts` lines 167-172: isDevAuthEnabled fallback populates userId from dev cookie   |
| 3   | Conversation persistence works in dev auth mode — messages survive page reload                 | VERIFIED | `cribai-chat.tsx`: createConversation and persistMessage both wired                           |
| 4   | No 403 errors from places.googleapis.com photo URLs                                            | VERIFIED | Migration 008 purges URLs; places.googleapis.com removed from next.config.ts                  |
| 5   | Favicon shows green 'CN' branding, not just 'C'                                               | VERIFIED | `icon.tsx`: fontSize 16, text "CN", green #10b981 background, 32x32 ImageResponse             |
| 6   | Nav and form say "Share a Listing" / "Share Listing" instead of "Submit Listing"               | VERIFIED | layout.tsx:149, mobile-nav.tsx:131, submit-listing-form.tsx:352 all updated                   |
| 7   | Notifications page does not auto-mark all as read on load — user must click a button           | VERIFIED | notifications/page.tsx: no auto-update on load; MarkAllReadButton conditionally rendered       |
| 8   | Dashboard has no "Recently Viewed" placeholder — 2-column grid only                           | VERIFIED | dashboard/page.tsx: `lg:grid-cols-2`, zero occurrences of "Recently Viewed"                  |
| 9   | Profile settings page shows university name (read-only)                                        | VERIFIED | profile/page.tsx lines 28-33: dynamic lookup from campus_configs with fallback                 |
| 10  | Mark-all-read API resolves correct dev user UUID from cookie, not hardcoded 'dev-user-1'       | VERIFIED | mark-read/route.ts line 25: DEV_USER_COOKIE cookie read, DEFAULT_DEV_USER.id fallback         |
| 11  | Saved nav link (desktop and mobile) has no misleading price-change notification badge          | VERIFIED | layout.tsx: priceChangedSavesCount removed entirely; mobile-nav.tsx: same — 0 occurrences    |
| 12  | CribAI search_listings description guards against use when listing already identified          | VERIFIED | schemas.ts line 6: "Do NOT use this tool when the user has already identified a specific listing" |
| 13  | Submit listing form has 3 visual section cards with headers and dollar-sign rent prefix        | VERIFIED | submit-listing-form.tsx: Section 1 "Location & Basics", Section 2 "Listing Details", Section 3 "Contact Information"; pl-7 + absolute `$` span |

**Score:** 13/13 truths verified

### Required Artifacts

#### Plan 01 Artifacts (regression checks — all pass)

| Artifact                                                             | Provides                                       | Status   | Details                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `apps/web/app/(campus)/[campusSlug]/listings/page.tsx`              | force-dynamic + null/zero price exclusion      | VERIFIED | Lines 60-61: `.not('rent_monthly','is',null).gt('rent_monthly',0)`             |
| `apps/web/app/api/ai/cribai/route.ts`                               | Dev auth fallback for userId resolution        | VERIFIED | Lines 167-172: isDevAuthEnabled block with cookie resolution                   |
| `apps/web/components/cribai-chat.tsx`                                | Frontend wiring to POST /api/conversations     | VERIFIED | createConversation and persistMessage fully wired                              |
| `supabase/migrations/008_remove_google_places_photos.sql`            | Purges legacy Google Places photo URLs         | VERIFIED | File confirmed present                                                         |

#### Plan 02 Artifacts (regression checks — all pass)

| Artifact                                                                         | Provides                                   | Status   | Details                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------ | -------- | -------------------------------------------------------------------- |
| `apps/web/app/icon.tsx`                                                          | Dynamic favicon via ImageResponse          | VERIFIED | fontSize 16, text "CN", green background, 32x32                     |
| `apps/web/app/(campus)/[campusSlug]/notifications/page.tsx`                     | Mark all as read button, no auto-mark      | VERIFIED | Imports MarkAllReadButton; no update-on-load query                  |
| `apps/web/app/(campus)/[campusSlug]/notifications/mark-all-read-button.tsx`     | Client component for button interaction    | VERIFIED | 'use client'; calls /api/notifications/mark-read; router.refresh()  |
| `apps/web/app/api/notifications/mark-read/route.ts`                             | API route to mark notifications read       | VERIFIED | POST handler; auth + dev auth; updates is_read=true; returns count  |
| `apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx`                         | Dashboard without Recently Viewed; 2-col   | VERIFIED | `lg:grid-cols-2`, no "Recently Viewed" text                         |
| `apps/web/app/settings/profile/page.tsx`                                        | University name (read-only) on profile     | VERIFIED | Dynamic lookup from campus_configs with default fallback             |

#### Plan 03 Artifacts (new — fully verified)

| Artifact                                                          | Provides                                            | Status   | Details                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `apps/web/app/icon.tsx`                                           | Favicon with 'CN' text, fontSize 16                | VERIFIED | Text confirmed "CN", fontSize 16, green background — fits 32x32 without clip  |
| `apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx`          | 2-column grid (lg:grid-cols-2)                     | VERIFIED | Line 51: `lg:grid-cols-2` confirmed                                            |
| `apps/web/app/api/notifications/mark-read/route.ts`              | Correct dev user ID resolution from cookie          | VERIFIED | Line 25: DEV_USER_COOKIE cookie read; DEFAULT_DEV_USER.id fallback; no 'dev-user-1' |
| `apps/web/app/(campus)/[campusSlug]/layout.tsx`                  | Saved nav link without price-change badge           | VERIFIED | priceChangedSavesCount: 0 occurrences — fully removed                          |
| `apps/web/components/mobile-nav.tsx`                              | Mobile Saved link without badge; notifications keeps badge | VERIFIED | priceChangedSavesCount: 0 occurrences; notifications unread badge intact |

#### Plan 04 Artifacts (new — fully verified)

| Artifact                                              | Provides                                                 | Status   | Details                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `packages/ai/src/tools/schemas.ts`                    | Narrowed search_listings, enhanced schedule_tour         | VERIFIED | "Do NOT use this tool when the user has already identified" in search_listings; "Do NOT run search_listings first" in schedule_tour |
| `packages/ai/src/cribai.ts`                           | System prompt guard for known-listing actions            | VERIFIED | Line 45: "do NOT run search_listings again" instruction in SYSTEM_PROMPT                      |
| `apps/web/components/submit-listing-form.tsx`         | 3-section form with headers and dollar-sign prefix       | VERIFIED | Sections "Location & Basics" (line 138), "Listing Details" (line 247), "Contact Information" (line 306); `$` span with pl-7 (lines 166, 176) |

### Key Link Verification

| From                                            | To                                           | Via                                       | Status  | Details                                                                |
| ----------------------------------------------- | -------------------------------------------- | ----------------------------------------- | ------- | ---------------------------------------------------------------------- |
| `cribai/route.ts`                               | `schedule-tour.ts` (ToolContext.userId)      | isDevAuthEnabled cookie fallback          | WIRED   | userId populated from devUser cookie (lines 167-172)                   |
| `cribai-chat.tsx`                               | `/api/conversations` POST                    | createConversation on first message       | WIRED   | Called when isAuthenticated + !activeConvId                            |
| `listings/page.tsx`                             | Supabase listings table                      | PostgREST .not('rent_monthly','is',null)  | WIRED   | Lines 60-68: null + zero exclusion on both min/max paths               |
| `notifications/page.tsx`                        | `/api/notifications/mark-read`               | MarkAllReadButton fetch POST on click     | WIRED   | mark-all-read-button.tsx: fetch call; page imports it                  |
| `icon.tsx`                                      | Browser favicon serving                      | Next.js App Router automatic serving      | WIRED   | File at `apps/web/app/icon.tsx` — Next.js serves automatically         |
| `mark-read/route.ts`                            | `lib/dev-auth.ts`                            | DEV_USER_COOKIE + DEFAULT_DEV_USER import | WIRED   | Line 4: import confirmed; line 25: cookie read confirmed               |
| `cribai.ts`                                     | `tools/schemas.ts`                           | CRIBAI_TOOLS imported and spread          | WIRED   | Line 6: import; line 83: `[...CRIBAI_TOOLS]` used in Gemini config    |

### Requirements Coverage

All plans in Phase 07 declare `requirements: []`. Phase 07 is a bug-fix and polish phase with no formal REQUIREMENTS.md IDs assigned. No orphaned requirements found for Phase 07.

### Anti-Patterns Found

| File                 | Line | Pattern                              | Severity | Impact                       |
| -------------------- | ---- | ------------------------------------ | -------- | ---------------------------- |
| `dashboard/page.tsx` | 125  | Hardcoded `emerald-50`/`emerald-700` | Info     | Tour status badge — cosmetic, pre-existing in tour card (not in scope of plan 04 which only fixed success state) |

No blocker anti-patterns in phase 07 production files. The tour status badge in `dashboard/page.tsx` still uses hardcoded `emerald`/`amber`/`red` Tailwind colors (not design tokens), but this is a pre-existing pattern not introduced by Phase 07 and does not block any goal.

### Human Verification Required

#### 1. Favicon renders 'CN' in browser tab

**Test:** Load any page at `localhost:3000` in a browser
**Expected:** Green "CN" icon (not just "C") appears in the browser tab, no 404 for `/favicon.ico` or `/icon` in network tab
**Why human:** Next.js ImageResponse favicon serving cannot be verified without a running Next.js server

#### 2. Price filter excludes zero-rent cards

**Test:** Navigate to the listings page, apply a min price filter (e.g. $800)
**Expected:** Listings with no rent price or $0 do not appear; all shown listings have rent >= $800
**Why human:** Requires live Supabase connection with real listing data

#### 3. CribAI schedule_tour works in dev auth mode

**Test:** In dev mode (BYPASS_AUTH=true), open CribAI and ask to schedule a tour for a listing
**Expected:** Tour is scheduled without a "You must be signed in" error; dev userId is used
**Why human:** Requires running app with dev auth cookie active and Supabase tour_requests table

#### 4. Conversation persistence survives page reload

**Test:** Start a CribAI conversation as an authenticated user, send 2-3 messages, then reload the page
**Expected:** Previous messages reload from the database
**Why human:** Requires authenticated Supabase session and live API responses

#### 5. CribAI tool selection — no redundant search before tour scheduling

**Test:** Search for listings, then ask "I want to tour the first one" (or by address)
**Expected:** CribAI asks for name/email/date directly (schedule_tour flow) without running search_listings again
**Why human:** Requires live Gemini model inference; tool description steering is probabilistic

#### 6. Mark-all-read with dev user UUID

**Test:** In dev mode, open notifications page, click "Mark All as Read"
**Expected:** Notifications are marked read for the correct dev UUID (a0000000-...) — verify via Supabase dashboard or network response showing count > 0
**Why human:** Requires running app with dev auth, dev notifications in DB, and live Supabase

---

## Summary

Phase 07 has fully achieved its stated goal across all 4 plans.

**Plans 01-02** (verified previously at 9/9): All E2E bug fixes and initial UX polish confirmed with regression checks — price filter null exclusion, CribAI dev auth, conversation persistence, Google Places cleanup, favicon existence, "Share a Listing" copy, notifications auto-mark removal, Recently Viewed removal, and profile university name all intact.

**Plan 03** (verified in this pass): All 4 UAT gap items addressed:
- Favicon now shows "CN" at fontSize 16 (not "C" at 24)
- Dashboard uses `lg:grid-cols-2` — no empty right column
- Mark-read API reads `DEV_USER_COOKIE` cookie and falls back to `DEFAULT_DEV_USER.id` — hardcoded 'dev-user-1' string eliminated
- `priceChangedSavesCount` badge fully removed from both desktop layout and mobile nav — zero occurrences in both files

**Plan 04** (verified in this pass): Both UAT items addressed:
- CribAI `search_listings` description now explicitly states "Do NOT use this tool when the user has already identified a specific listing" — belt-and-suspenders with a matching system prompt instruction in `cribai.ts`
- Submit listing form restructured into 3 labeled section cards (Location & Basics, Listing Details, Contact Information) with dollar-sign prefix on rent input using pure Tailwind (absolute span + pl-7) and design tokens replacing hardcoded emerald in the success state

All 4 documented commit hashes for Plans 03-04 (25dc822, 29bf0ab, 12f84bc, 76b6e4b) confirmed in git history.

---

_Verified: 2026-03-10_
_Verifier: Claude (gsd-verifier)_
