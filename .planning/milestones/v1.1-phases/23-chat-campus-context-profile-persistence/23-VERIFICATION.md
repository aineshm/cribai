---
phase: 23-chat-campus-context-profile-persistence
verified: 2026-03-11T00:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 23: Chat Campus Context + Profile Persistence — Verification Report

**Phase Goal:** Fix the two broken E2E flows — give the root-layout ChatProvider a valid campusSlug (derived from user profile or a sensible default) so Explore page and Listing Detail chat work, and persist ProfileSetup data to Supabase so onboarding profile step is not a dead end.
**Verified:** 2026-03-11T00:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Explore page chat sends a non-empty campusSlug to /api/ai/cribai (not '') | VERIFIED | `(main)/layout.tsx` line 42: `<ChatProvider campusSlug={campusSlug}>` where `campusSlug` is derived via metadata → DB → literal fallback; `ChatProvider.tsx` line 63: `campusSlug: campusSlug` in POST body |
| 2  | Listing Detail MobileBottomBar Chat button uses a ChatProvider with a valid campusSlug | VERIFIED | All (main) routes inherit from the inner ChatProvider in `(main)/layout.tsx`; campus-scoped layouts override with their own slug via innermost-wins pattern |
| 3  | The campusSlug is derived from user_metadata.campus_slug; DB fallback used when metadata is absent | VERIFIED | `(main)/layout.tsx` lines 38-39: `campusSlugFromMeta ?? await getDefaultCampusSlug(supabase)`; `getDefaultCampusSlug` queries `campus_configs` ordered by `created_at asc` with `'uw-madison'` literal fallback |
| 4  | Root layout ChatProvider remains unchanged (innermost-wins pattern preserved) | VERIFIED | `apps/web/app/layout.tsx` lines 33-35: `<ChatProvider>` with no campusSlug prop — still defaults to `''` |
| 5  | handleProfileComplete calls supabase.auth.updateUser with full_name, university, graduation_year before navigating | VERIFIED | `AuthForm.tsx` lines 138-144: async `useCallback` calls `updateUser({ data: { full_name, university, graduation_year } })` before `router.push` |
| 6  | On updateUser error, navigation is blocked and error message is shown in the form | VERIFIED | `AuthForm.tsx` lines 146-150: `if (updateError) { setError(updateError.message); setLoading(false); return; }` — returns before `router.push` |
| 7  | On updateUser success, router.push fires with correct destination (returnTo or /explore) | VERIFIED | `AuthForm.tsx` lines 152-157: same `returnTo` validation logic as before, then `router.push(destination)` |

**Score:** 7/7 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/app/(main)/layout.tsx` | Inner ChatProvider wrapping children with server-derived campusSlug | VERIFIED | 79 lines; imports `ChatProvider`; has `getDefaultCampusSlug` helper; derives `campusSlug`; wraps `ConciergeShell` in `<ChatProvider campusSlug={campusSlug}>` |
| `apps/web/components/chat/__tests__/ChatProvider.test.tsx` | Test confirming ChatProvider passes non-empty campusSlug in POST body; innermost-wins test | VERIFIED | 264 lines; 10 tests including innermost-wins test at line 216: nested `<ChatProvider campusSlug="uw-madison">` asserts `callBody.campusSlug === 'uw-madison'` |
| `apps/web/components/auth/AuthForm.tsx` | async handleProfileComplete that calls updateUser before router.push | VERIFIED | 325 lines; `useCallback` async at line 129; `updateUser` call at line 138; error handling at lines 146-150 |
| `apps/web/components/auth/__tests__/AuthForm.persist.test.tsx` | Unit tests covering AUTH-05 profile persistence behavior | VERIFIED | 193 lines; 4 tests: correct field names, success navigation, error blocks nav, call order |
| `apps/web/components/auth/__tests__/AuthForm.redirect.test.tsx` | Updated mock that includes updateUser | VERIFIED | Line 98: `updateUser: vi.fn().mockResolvedValue({ error: null })`; all 3 redirect tests use `await waitFor` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/web/app/(main)/layout.tsx` | `apps/web/components/chat/ChatProvider.tsx` | `<ChatProvider campusSlug={derivedSlug}>` wrapping children | WIRED | Line 6 imports ChatProvider; line 42 uses `<ChatProvider campusSlug={campusSlug}>` |
| `apps/web/components/chat/ChatProvider.tsx` | `/api/ai/cribai` | `fetch POST with campusSlug in body` | WIRED | Lines 58-66: `fetch('/api/ai/cribai', { method: 'POST', body: JSON.stringify({ ..., campusSlug: campusSlug }) })` |
| `AuthForm.tsx handleProfileComplete` | `Supabase auth.users.raw_user_meta_data` | `supabase.auth.updateUser({ data: { full_name, university, graduation_year } })` | WIRED | Lines 137-144; field names match profile page expectations |
| `Supabase auth.users.raw_user_meta_data` | `apps/web/app/(main)/profile/page.tsx` | `user.user_metadata.full_name / .university / .graduation_year` | WIRED | Profile page lines 28, 36, 39 read `meta.full_name`, `meta.university`, `meta.graduation_year` respectively |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EXPL-04 | 23-01-PLAN.md | Floating AI button opens CribAI as a slide-over chat panel (not a separate page) — Explore page chat sends non-empty campusSlug | SATISFIED | `(main)/layout.tsx` wraps Explore route children with inner ChatProvider carrying derived campusSlug; campusSlug reaches /api/ai/cribai POST body |
| DETAIL-05 | 23-01-PLAN.md | Mobile users see sticky bottom bar with price, Book Tour, and Chat with AI buttons — Listing Detail chat sends non-empty campusSlug | SATISFIED | Listing Detail page is a (main) route; inherits inner ChatProvider campusSlug from `(main)/layout.tsx` |
| AUTH-05 | 23-02-PLAN.md | Auth page uses split layout with branded left panel and animated multi-step form — profile step now persists data | SATISFIED | `handleProfileComplete` is async, calls `updateUser` with `full_name`/`university`/`graduation_year` before navigation; 4 unit tests cover all branches |

All 3 requirements mapped to Phase 23 are accounted for. No orphaned requirements found.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/components/auth/AuthForm.tsx` | 194 | `placeholder="you@university.edu"` | Info | HTML input placeholder attribute — not a code anti-pattern, expected UI text |

No blockers or warnings found. One informational note on HTML input placeholder (expected, not a code quality issue).

---

## Human Verification Required

### 1. Explore Page Chat — Live campusSlug Flow

**Test:** Log in with a real Supabase user that has `campus_slug` in `user_metadata`. Navigate to /explore. Open CribAI chat. Send a message.
**Expected:** Chat sends a message using the user's campus slug. AI responds with campus-relevant results (not a 404 or empty response).
**Why human:** campusSlug derivation involves live Supabase DB query; cannot mock `campus_configs` in static verification.

### 2. Profile Page — Post-Onboarding Data Visible

**Test:** Complete onboarding (email → OTP → profile step with name "Jane Smith", university "UW-Madison", year "2026"). Navigate to /profile.
**Expected:** Profile page shows "Jane Smith", "UW-Madison", and "2026" — not email-derived defaults.
**Why human:** Requires a live Supabase session with a real `updateUser` write; unit tests mock the Supabase call.

### 3. DB Fallback — No campus_slug in Metadata

**Test:** Log in with a user that has no `campus_slug` in `user_metadata`. Navigate to /explore and open CribAI chat.
**Expected:** Chat sends the first `campus_configs` row slug (or `'uw-madison'` if table is empty). No 404 response from the AI API.
**Why human:** Requires controlling user metadata state in a live Supabase environment.

---

## Gaps Summary

No gaps. All automated checks passed:

- `(main)/layout.tsx` is substantive (79 lines), imports ChatProvider, has `getDefaultCampusSlug`, derives campusSlug via 3-tier fallback chain, and wraps children with `<ChatProvider campusSlug={campusSlug}>`.
- `ChatProvider.tsx` includes `campusSlug` in the fetch POST body (line 63), fully wired.
- Root layout `app/layout.tsx` still has `<ChatProvider>` with no campusSlug prop — innermost-wins pattern intact.
- `AuthForm.tsx` `handleProfileComplete` is async, uses `useCallback`, calls `updateUser` with correct field names (`full_name`, `university`, `graduation_year`), handles error (blocks navigation, shows `data-testid="auth-error"`), and navigates on success.
- `AuthForm.persist.test.tsx` exists with 4 substantive tests covering all branches.
- `AuthForm.redirect.test.tsx` mock updated with `updateUser: vi.fn().mockResolvedValue({ error: null })`; all 3 redirect tests use `await waitFor`.
- Profile page reads `meta.full_name`, `meta.university`, `meta.graduation_year` — field names match what `updateUser` writes.
- Commits verified: `5950d72`, `074a0ba`, `934d863`, `27a6c63`.
- No TODO/FIXME/placeholder code anti-patterns in modified files.

Three human verification items remain but are not blockers — they require live Supabase sessions and cannot be verified programmatically.

---

_Verified: 2026-03-11T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
