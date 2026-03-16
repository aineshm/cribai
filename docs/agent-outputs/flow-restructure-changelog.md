# Flow Restructure Changelog — Agent 4

## Summary
Addressed 15 UX audit issues focused on structural UX: navigation architecture, auth flows, onboarding, pagination, and user journey improvements.

---

## Pass 1 — Core Fixes

### C3: Landing Page (Critical) — NEW
**File:** `apps/web/app/page.tsx`
- Replaced hard redirect (`redirect('/uw-madison/cribai')`) with a proper landing page
- Hero section with value proposition
- Dynamic campus selector that queries `campus_configs` table (with fallback for empty DB)
- Feature highlights: True Cost Calculator, Fairness Scores, CribAI Advisor
- Sign-in CTA and "ask CribAI" link
- Footer with placeholder legal links

### C4: Fix Malformed Login Redirect (Critical)
**File:** `apps/web/app/(campus)/[campusSlug]/submit-listing/page.tsx`
- Changed `/(auth)/login?redirect=...` to `/login?returnTo=...`
- Route group prefix `(auth)` was included in URL, causing 404

### C5: Login Consumes returnTo Parameter (Critical)
**File:** `apps/web/app/(auth)/login/page.tsx`
- Added `useSearchParams()` to read `returnTo` query parameter
- After successful OTP verification, redirects to `returnTo` if it's a valid relative path
- Falls back to `/uw-madison/cribai` if no returnTo or if it fails validation
- Validates returnTo starts with `/` and not `//` to prevent open redirect

### H2: Auth-Conditional Nav Items (High)
**Files:** `apps/web/app/(campus)/[campusSlug]/layout.tsx`, `apps/web/components/mobile-nav.tsx`
- Desktop nav: Wrapped Dashboard and Saved links in `{userId && (<>...</>)}` conditional
- Mobile nav: Added `userId` prop, wrapped Dashboard/Saved/Notifications in auth conditional
- Unauthenticated users now only see: Listings, CribAI, Sign in

### H3: Dev Mode Fix for Notifications & Saved Pages (High)
**Files:** `apps/web/app/(campus)/[campusSlug]/notifications/page.tsx`, `apps/web/app/(campus)/[campusSlug]/saved/page.tsx`
- Replaced `createServerComponentClient` + `supabase.auth.getUser()` with `getCurrentUser()` helper
- In dev mode, uses `createSecretClient()` to bypass RLS (matching dashboard pattern)
- Both pages now work correctly in BYPASS_AUTH dev mode

### H7: Settings Layout Hardcoded Campus Slug (High)
**File:** `apps/web/app/settings/layout.tsx`
- Changed CampusNest link from hardcoded `/uw-madison/cribai` to `/`
- Now routes to landing page (which has campus selector) instead of hardcoded campus

### M1: Verify-edu Back Link (Medium)
**File:** `apps/web/app/(auth)/verify-edu/page.tsx`
- Replaced `<Link href="/">` with `<button onClick={() => router.back()}>`
- "Back" now returns to wherever the user came from (settings, profile, etc.)
- Removed unused `Link` import, added `useRouter`

### M4: Submit Listing Success State (Medium)
**File:** `apps/web/components/submit-listing-form.tsx`, `apps/web/app/(campus)/[campusSlug]/submit-listing/page.tsx`
- Added success view after form submission (replaces reset + toast)
- Shows checkmark icon, confirmation message, and explanation of next steps
- "Submit another" button resets form, "Browse listings" links to listings page
- Added `campusSlug` prop to form for contextual navigation

### M16: Footer (Medium)
**File:** `apps/web/app/(campus)/[campusSlug]/layout.tsx`
- Added footer to campus layout with CampusNest branding and university name
- Placeholder links for About, Terms, Privacy
- Responsive flex layout (stacked on mobile, row on desktop)

---

## Pass 2 — Remaining Flow Issues

### H6: Pagination on Listings Page (High)
**File:** `apps/web/app/(campus)/[campusSlug]/listings/page.tsx`
- Added offset-based pagination with `PAGE_SIZE = 18`
- Uses Supabase `.range(from, to)` with `count: 'exact'` for total
- Pagination nav with Previous/Next + numbered page buttons + ellipsis for large page counts
- Shows total listing count in header ("X listings found")
- Pagination URLs preserve all active filters (beds, minPrice, maxPrice, sort)
- Page number in `?page=N` search param

### L1: OTP Auto-Submit (Low)
**File:** `apps/web/app/(auth)/login/page.tsx`
- Added `useEffect` that auto-triggers verification when OTP reaches 8 digits
- Reduces friction — users just paste and the code verifies immediately

### L2: Resend OTP Code Fix (Low)
**File:** `apps/web/app/(auth)/login/page.tsx`
- Extracted OTP-sending logic into standalone `sendOtpEmail()` function
- Resend button now calls `sendOtpEmail()` directly instead of creating a fake `Event` object
- Removed fragile `new Event('submit') as unknown as React.FormEvent` cast

### M8: Share Button on Listing Detail (Medium) — NEW FILE
**Files:** `apps/web/components/share-button.tsx` (NEW), `apps/web/app/(campus)/[campusSlug]/listings/[id]/page.tsx`
- Created `ShareButton` client component
- Uses `navigator.share()` on supported devices (mobile native share sheet)
- Falls back to clipboard copy with toast confirmation
- Shows checkmark + "Copied!" after successful clipboard copy
- Added to listing detail page sidebar above "View original listing"

### M11: Saved Listings Sort (Medium) — NEW FILE
**Files:** `apps/web/components/saved-sort-select.tsx` (NEW), `apps/web/app/(campus)/[campusSlug]/saved/page.tsx`
- Created `SavedSortSelect` client component with URL-param-based sorting
- Sort options: Recently saved (default), Price low→high, Price high→low, Best Value
- Sort dropdown only appears when there are 2+ saved listings
- Server-side sorting of flattened listings array

---

## Files Created (2 new)
- `apps/web/components/share-button.tsx`
- `apps/web/components/saved-sort-select.tsx`

## Files Modified (10)
- `apps/web/app/page.tsx` — Landing page (rewrite)
- `apps/web/app/(auth)/login/page.tsx` — returnTo, auto-submit, resend fix
- `apps/web/app/(auth)/verify-edu/page.tsx` — Back button fix
- `apps/web/app/(campus)/[campusSlug]/layout.tsx` — Auth-conditional nav + footer
- `apps/web/app/(campus)/[campusSlug]/submit-listing/page.tsx` — Login redirect fix
- `apps/web/app/(campus)/[campusSlug]/listings/page.tsx` — Pagination
- `apps/web/app/(campus)/[campusSlug]/listings/[id]/page.tsx` — Share button
- `apps/web/app/(campus)/[campusSlug]/saved/page.tsx` — Dev mode fix + sort
- `apps/web/app/(campus)/[campusSlug]/notifications/page.tsx` — Dev mode fix
- `apps/web/app/settings/layout.tsx` — Hardcoded campus slug fix
- `apps/web/components/submit-listing-form.tsx` — Success state
- `apps/web/components/mobile-nav.tsx` — Auth-conditional nav (userId prop)

## Coordination Notes
- Coordinated mobile-nav.tsx changes with Agent 3 via agent-comms
- Agent 3 confirmed no conflict with auth-conditional wrapping
- All locks registered in COORDINATION.md
- Agent 3 completed M15 (suggestion chips), H5/M14 (filters), C1/C2 (loading/error), H8 (404), M13 (lightbox), L4/L7/L9 (minor fixes)
- Zero new TypeScript errors introduced
