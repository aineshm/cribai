---
status: diagnosed
phase: 07-fix-e2e-test-issues-and-complete-v1
source: 07-01-SUMMARY.md, 07-02-SUMMARY.md
started: 2026-03-10T02:50:00Z
updated: 2026-03-10T03:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Price filter excludes zero/null rent listings
expected: Go to /uw-madison/listings. Set min price to $500 and max price to $1200. The count should update AND the displayed listing cards should only show listings with rent between $500-$1200. No $0 or null-price listings should appear.
result: pass

### 2. CribAI dev auth — conversation persistence
expected: With BYPASS_AUTH=true, go to /uw-madison/cribai. Send a message (e.g., "Find me a 2-bedroom under $1200"). AI should respond with listing results. Reload the page. The conversation sidebar should show the previous conversation, and clicking it should restore the chat history.
result: issue
reported: "nope not storing anymore, it was earlier"
severity: major

### 3. CribAI dev auth — schedule tour
expected: With BYPASS_AUTH=true, ask CribAI to schedule a tour (e.g., "Schedule a tour for [listing] next Saturday at 2pm"). Provide any details the AI asks for. The schedule_tour tool should succeed and return a tour confirmation — NOT "You must be signed in."
result: issue
reported: "after specifying the property, CribAI showed 5 listings in the chat instead of proceeding with tour scheduling"
severity: major

### 4. No broken Google Places photos
expected: Browse the listings grid. No listing cards should show broken/403 image icons. Listings without photos show a gray "No photo" placeholder. Check the browser console — no 403 errors from places.googleapis.com.
result: pass

### 5. Favicon loads
expected: Load any page in the app. The browser tab should show a green "CN" favicon. No 404 error for favicon.ico in the network tab.
result: issue
reported: "It's just a C"
severity: cosmetic

### 6. "Share a Listing" nav copy
expected: Check the desktop nav bar — the link that was "Submit Listing" should now read "Share a Listing". Check the mobile hamburger menu — same change. Navigate to the submit listing page — the form button should say "Share Listing" or similar community-oriented copy.
result: issue
reported: "Copy change is correct but design of the sub pages/tabs is very poor"
severity: minor

### 7. Notifications mark-as-read button
expected: Go to /uw-madison/notifications (must be authenticated or dev auth). If there are unread notifications, they should NOT be auto-marked as read on page load. Instead, a "Mark all as read" button should be visible. Clicking it should mark all notifications as read.
result: issue
reported: "Doesn't work, and also the saved button in the top nav bar incorrectly shows a red circle notification indicator"
severity: major

### 8. Dashboard — no Recently Viewed placeholder
expected: Go to /uw-madison/dashboard. The dashboard should show Saved Items and Upcoming Appointments cards. There should be NO "Recently Viewed" card with "No recently viewed listings" placeholder text.
result: issue
reported: "Two cards in a three-column grid, left-aligned with awkward empty space on the right"
severity: minor

### 9. University on profile settings
expected: Go to /settings/profile. A read-only "University" field should display "University of Wisconsin-Madison" (or the user's campus name). The field should not be editable.
result: pass

## Summary

total: 9
passed: 3
issues: 6
pending: 0
skipped: 0

## Gaps

- truth: "Conversation persistence works — messages survive page reload, sidebar shows conversation"
  status: failed
  reason: "User reported: nope not storing anymore, it was earlier"
  severity: major
  test: 2
  root_cause: "Cookie setAll error in createServerComponentClient crashed getCurrentUser() in cribai/page.tsx, making isAuthenticated=false and skipping all persistence logic. Fixed in commit 7c98317 — needs re-test."
  artifacts:
    - path: "packages/supabase/src/server.ts"
      issue: "setAll threw in server component context"
  missing:
    - "Re-test after cookie fix to confirm persistence works"
  debug_session: ""

- truth: "Schedule tour tool proceeds directly after user specifies property"
  status: failed
  reason: "User reported: after specifying the property, CribAI showed 5 listings in the chat instead of proceeding with tour scheduling"
  severity: major
  test: 3
  root_cause: "search_listings tool description is too broad ('Use whenever user asks about apartments'), schedule_tour description lacks when-to-use guidance, system prompt missing 'skip search when listing already identified' instruction"
  artifacts:
    - path: "packages/ai/src/tools/schemas.ts"
      issue: "search_listings description too broad (lines 5-6), schedule_tour description vague (lines 84-85)"
    - path: "packages/ai/src/cribai.ts"
      issue: "System prompt lacks instruction to skip search when user already specified listing (lines 31-47)"
  missing:
    - "Narrow search_listings description to exclude cases where user already identified a listing"
    - "Add when-to-use guidance to schedule_tour description"
    - "Add system prompt instruction: if user specifies a listing, skip search and proceed to tool"
  debug_session: ""

- truth: "Favicon shows green CN logo"
  status: failed
  reason: "User reported: It's just a C"
  severity: cosmetic
  test: 5
  root_cause: "apps/web/app/icon.tsx line 23 renders 'C' instead of 'CN'"
  artifacts:
    - path: "apps/web/app/icon.tsx"
      issue: "Line 23 shows 'C' instead of 'CN'"
  missing:
    - "Change text content from 'C' to 'CN' and adjust font size if needed"
  debug_session: ""

- truth: "Share a Listing sub-pages have good design"
  status: failed
  reason: "User reported: Copy change is correct but design of the sub pages/tabs is very poor"
  severity: minor
  test: 6
  root_cause: "Single flat form with all 10 fields, no step grouping or section headers. Inconsistent styling (hardcoded emerald vs design tokens). No progress indicator. Poor input affordances (no currency symbol, vague helper text)."
  artifacts:
    - path: "apps/web/components/submit-listing-form.tsx"
      issue: "Flat form structure, no steps/sections, inconsistent styling (lines 100-339)"
    - path: "apps/web/app/(campus)/[campusSlug]/submit-listing/page.tsx"
      issue: "Wrapper may need step navigation support"
  missing:
    - "Add section grouping with visual headers (Basic Info, Details, Contact)"
    - "Use design tokens instead of hardcoded emerald colors in success state"
    - "Add currency symbol prefix to rent input"
    - "Standardize submit/share terminology"
  debug_session: ""

- truth: "Notifications mark-as-read works and saved button does not show false notification badge"
  status: failed
  reason: "User reported: Doesn't work, and also the saved button in the top nav bar incorrectly shows a red circle notification indicator"
  severity: major
  test: 7
  root_cause: "Two bugs: (1) mark-read API route.ts line 24 falls back to hardcoded 'dev-user-1' instead of actual dev UUID 'a0000000-...-0001', so update targets wrong user. (2) Layout lines 84-90 counts all unread notifications and shows badge on Saved nav link instead of notifications bell."
  artifacts:
    - path: "apps/web/app/api/notifications/mark-read/route.ts"
      issue: "Line 24: hardcoded 'dev-user-1' fallback instead of actual dev user UUID"
    - path: "apps/web/app/(campus)/[campusSlug]/layout.tsx"
      issue: "Lines 84-90, 181-185: notification count badge shown on Saved nav link"
    - path: "apps/web/components/mobile-nav.tsx"
      issue: "Lines 158-162: same false badge on mobile Saved link"
  missing:
    - "Fix dev auth fallback to use resolveDevUser() or read dev_user_id cookie"
    - "Move notification badge from Saved link to notifications bell icon"
  debug_session: ""

- truth: "Dashboard cards fill available grid space without awkward empty space"
  status: failed
  reason: "User reported: Two cards in a three-column grid, left-aligned with awkward empty space on the right"
  severity: minor
  test: 8
  root_cause: "Dashboard page.tsx line 51 uses lg:grid-cols-3 but only has 2 cards (Saved Items, Upcoming Appointments)"
  artifacts:
    - path: "apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx"
      issue: "Line 51: lg:grid-cols-3 with only 2 cards"
  missing:
    - "Change lg:grid-cols-3 to lg:grid-cols-2"
  debug_session: ""
