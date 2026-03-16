# CampusNest UX Audit

**Date:** 2026-03-09
**Auditor:** Agent 2 (Code-Based UX Audit)
**Scope:** Full frontend — all routes, components, layouts, and shared UI

---

## 1. Executive Summary

### Issue Counts by Severity

| Severity | Count |
|----------|-------|
| Critical | 5 |
| High | 12 |
| Medium | 16 |
| Low | 9 |
| **Total** | **42** |

### Top 5 Most Impactful Fixes

1. **No loading.tsx or error.tsx files exist anywhere** (Critical) — Every server-rendered page shows a blank white screen during data fetches and crashes silently on errors. Adding loading skeletons and error boundaries across all routes would dramatically improve perceived performance and resilience.

2. **Homepage is a hard redirect with no landing page** (Critical) — `app/page.tsx` does `redirect('/uw-madison/cribai')`, meaning there is no onboarding, no campus selector, no value proposition. First-time visitors land directly in a chat interface with no context.

3. **Login redirect URL is malformed in submit-listing** (Critical) — `submit-listing/page.tsx` line 18 redirects to `/(auth)/login?redirect=...` which is a route group prefix that will 404. Should be `/login`.

4. **Dashboard and Saved pages are accessible in nav without auth but redirect on load** (High) — Unauthenticated users can click "Dashboard" and "Saved" in the navbar, only to be bounced to login. These nav items should be hidden or show an inline auth prompt.

5. **Chat component uses fixed 600px height, broken on mobile** (High) — `cribai-chat.tsx` line 406 uses `h-[600px]` which overflows on small screens. Should use `h-[calc(100dvh-200px)]` or similar responsive approach.

---

## 2. Route Map

| Route | Purpose | Auth Required | Has loading.tsx | Has error.tsx |
|-------|---------|--------------|-----------------|---------------|
| `/` | Home — redirects to `/uw-madison/cribai` | No | No | No |
| `/login` | Email OTP authentication | No | No | No |
| `/verify-edu` | .edu email verification | Yes (soft) | No | No |
| `/settings/profile` | Edit user profile | Yes (hard redirect) | No | No |
| `/:campusSlug/dashboard` | User dashboard (saved, tours, recent) | Yes (hard redirect) | No | No |
| `/:campusSlug/listings` | Listing search with filters | No | No | No |
| `/:campusSlug/listings/:id` | Listing detail page | No | No | No |
| `/:campusSlug/cribai` | CribAI chat interface | No (degraded) | No | No |
| `/:campusSlug/saved` | Saved listings | Yes (hard redirect) | No | No |
| `/:campusSlug/notifications` | Price change notifications | Yes (hard redirect) | No | No |
| `/:campusSlug/submit-listing` | Submit a new listing | Yes (hard redirect) | No | No |

---

## 3. Issues by Severity

### CRITICAL

#### C1: No loading.tsx files anywhere in the app
- **Route/Component:** All routes under `app/`
- **Category:** Performance, Empty States
- **Description:** There are zero `loading.tsx` files in the entire application. Every server component page (dashboard, listings, saved, notifications, settings) fetches data during render. Users see nothing (blank white area) until the full page renders.
- **Impact:** Poor perceived performance. Users may think the app is broken, especially on slow connections. This is the single biggest UX gap.
- **Recommendation:** Add `loading.tsx` with skeleton UIs to: `(campus)/[campusSlug]/loading.tsx`, `(campus)/[campusSlug]/listings/loading.tsx`, `(campus)/[campusSlug]/listings/[id]/loading.tsx`, `(campus)/[campusSlug]/dashboard/loading.tsx`, `(campus)/[campusSlug]/saved/loading.tsx`, `(campus)/[campusSlug]/notifications/loading.tsx`, `settings/profile/loading.tsx`. Use shimmer/skeleton patterns that match the layout of each page.

#### C2: No error.tsx files anywhere in the app
- **Route/Component:** All routes under `app/`
- **Category:** Error Handling
- **Description:** There are zero `error.tsx` error boundary files. If any server component throws (database down, invalid data, network timeout), the user sees Next.js's default error page or a blank screen.
- **Impact:** Unrecoverable errors with no way for the user to retry or navigate away gracefully. Especially dangerous on data-heavy pages like listings and dashboard.
- **Recommendation:** Add `error.tsx` files at minimum to `(campus)/[campusSlug]/error.tsx` (catches all campus sub-routes) and `app/error.tsx` (global fallback). Each should show a friendly message with a "Try again" button that calls `reset()`.

#### C3: Homepage is a hard redirect — no landing page
- **Route/Component:** `apps/web/app/page.tsx` (line 4)
- **Category:** Navigation, Content/Copy
- **Description:** The root route immediately does `redirect('/uw-madison/cribai')`. There is no landing page, no campus selector, no value proposition, no onboarding flow.
- **Impact:** First-time visitors have zero context about what CampusNest is. The campus is hardcoded to UW-Madison, making the app appear single-campus only. There's no way to select a different campus.
- **Recommendation:** Create a landing page with: (a) hero section explaining CampusNest's value proposition, (b) campus selector dropdown or search, (c) "Sign in" and "Explore as guest" CTAs, (d) feature highlights (True Cost Calculator, Fairness Scores, CribAI).

#### C4: Malformed login redirect URL in submit-listing
- **Route/Component:** `apps/web/app/(campus)/[campusSlug]/submit-listing/page.tsx` (line 18)
- **Category:** Navigation, Error Handling
- **Description:** The redirect path is `/(auth)/login?redirect=...` — the `(auth)` route group prefix is not part of the URL path. This will result in a 404.
- **Impact:** Unauthenticated users who navigate to submit-listing get a 404 instead of being redirected to login.
- **Recommendation:** Change to `redirect(\`/login?returnTo=/${campusSlug}/submit-listing\`)` to match the pattern used in other pages (saved, notifications).

#### C5: Login success redirects to hardcoded path
- **Route/Component:** `apps/web/app/(auth)/login/page.tsx` (line 65)
- **Category:** Navigation
- **Description:** After successful OTP verification, `window.location.href = '/uw-madison/cribai'` is hardcoded. The `returnTo` query parameter from other pages (saved, notifications) is never consumed.
- **Impact:** Users who were redirected to login from `/uw-madison/saved` are sent to `/uw-madison/cribai` after login instead of back to their intended destination. Breaks the auth redirect flow.
- **Recommendation:** Read the `returnTo` search parameter and redirect there after login. Validate it's a relative path for security.

---

### HIGH

#### H1: Chat container has fixed height that breaks on mobile
- **Route/Component:** `apps/web/components/cribai-chat.tsx` (line 406)
- **Category:** Mobile, Visual Design
- **Description:** The chat container uses `h-[600px]` which is taller than most mobile viewports (~667px minus nav bar and page padding). This causes the chat to overflow the viewport.
- **Impact:** On mobile, users can't see the full chat interface. The input field may be pushed below the fold or overlap with the browser chrome.
- **Recommendation:** Use a responsive height: `h-[calc(100dvh-220px)] md:h-[600px]` or similar, accounting for the nav bar, page title, and padding.

#### H2: Dashboard "Saved" link visible in nav for unauthenticated users
- **Route/Component:** `apps/web/app/(campus)/[campusSlug]/layout.tsx` (lines 168-184)
- **Category:** Navigation
- **Description:** The "Dashboard" and "Saved" nav links are always visible, regardless of auth state. Only "Submit Listing" is conditionally shown. Clicking Dashboard or Saved as an unauthenticated user triggers a server-side redirect to login.
- **Impact:** Users experience a jarring redirect. On the mobile nav, the notification link is also shown but requires auth.
- **Recommendation:** Wrap Dashboard, Saved, and Notifications links in `{userId && (...)}` conditionals, matching how Submit Listing is handled.

#### H3: Notifications page doesn't work in dev mode
- **Route/Component:** `apps/web/app/(campus)/[campusSlug]/notifications/page.tsx` (lines 81-88)
- **Category:** Error Handling
- **Description:** The notifications page uses `createServerComponentClient(cookieStore)` and `supabase.auth.getUser()` directly. In dev mode (BYPASS_AUTH), this won't find a real user session and will redirect to login, even though the user is "logged in" via the dev switcher.
- **Impact:** Dev users can never access the notifications page. Same issue exists for the saved listings page (line 16-24 of saved/page.tsx).
- **Recommendation:** Use the `getCurrentUser()` helper (already used in dashboard and cribai pages) instead of directly calling `supabase.auth.getUser()`. This helper handles dev mode correctly.

#### H4: Listing card has no photo placeholder
- **Route/Component:** `apps/web/components/listing-card.tsx` (lines 57-73)
- **Category:** Empty States, Visual Design
- **Description:** When `heroPhoto` is null (no photos available), the card renders no image section at all. The card collapses to just text, creating inconsistent card heights in the grid.
- **Impact:** Grid layout becomes visually uneven. Cards without photos look broken compared to those with photos.
- **Recommendation:** Add a placeholder div with the same `aspect-video` dimensions: a gray background with a home icon and "No photo available" text.

#### H5: Listing filters don't show active state or reset option
- **Route/Component:** `apps/web/components/listing-filters.tsx`
- **Category:** Interaction Design
- **Description:** When filters are applied, there's no visual indication of which filters are active and no "Clear all" button. Users must manually reset each filter.
- **Impact:** Users lose track of which filters are applied, leading to confusion when listings seem limited. They can't quickly reset to see all listings.
- **Recommendation:** Add a filter count badge, highlight active filters with a colored border, and add a "Clear all filters" link that appears when any filter is active.

#### H6: No pagination on listings page
- **Route/Component:** `apps/web/app/(campus)/[campusSlug]/listings/page.tsx`
- **Category:** Performance, Navigation
- **Description:** The listings query has no `.limit()` or pagination. All matching listings are fetched at once and rendered in a single grid.
- **Impact:** As the listing database grows, this page will become increasingly slow. Users also have no way to navigate through large result sets.
- **Recommendation:** Add cursor-based or offset pagination with `.range(from, to)`. Show a "Load more" button or infinite scroll. Display total result count.

#### H7: Settings layout has hardcoded campus slug
- **Route/Component:** `apps/web/app/settings/layout.tsx` (line 28)
- **Category:** Navigation
- **Description:** The "CampusNest" link in the settings nav bar links to `/uw-madison/cribai`. This is hardcoded and won't work if the user belongs to a different campus.
- **Impact:** Users from non-UW-Madison campuses (if/when supported) will be sent to the wrong campus.
- **Recommendation:** Store the user's campus slug in context or derive it from their profile, and use that for the navigation link.

#### H8: No "not-found.tsx" files for dynamic routes
- **Route/Component:** All dynamic route segments
- **Category:** Error Handling
- **Description:** While `[campusSlug]/layout.tsx` calls `notFound()` for invalid campus slugs and listing detail calls `notFound()` for invalid IDs, there are no custom `not-found.tsx` files to render a branded 404 page.
- **Impact:** Users who hit an invalid URL see Next.js's default 404 page, which is generic and provides no navigation back to the app.
- **Recommendation:** Add `app/not-found.tsx` with CampusNest branding, navigation links, and a search prompt.

#### H9: CribAI chat messages use array index as key
- **Route/Component:** `apps/web/components/cribai-chat.tsx` (line 421)
- **Category:** Performance
- **Description:** `messages.map((msg, i) => <div key={i}>...)` uses the array index as the React key. When messages are prepended or the array is mutated during streaming, this causes incorrect reconciliation.
- **Impact:** During streaming, React may re-render the wrong message bubbles, causing visual glitches. In edge cases, old messages may briefly show wrong content.
- **Recommendation:** Generate unique IDs for each message (e.g., `crypto.randomUUID()` or a counter) and use those as keys.

#### H10: No keyboard shortcut to close mobile nav
- **Route/Component:** `apps/web/components/mobile-nav.tsx`
- **Category:** Accessibility
- **Description:** The mobile nav overlay has no Escape key handler. The overlay does not trap focus, so keyboard users can tab through elements behind the menu.
- **Impact:** Keyboard and assistive technology users have a degraded experience. The menu is not dismissible via keyboard except by clicking the hamburger button.
- **Recommendation:** Add an `onKeyDown` handler for Escape, implement focus trapping within the menu, and add `role="dialog"` and `aria-modal="true"`.

#### H11: Conversation sidebar overlay has no Escape key handling
- **Route/Component:** `apps/web/components/chat/conversation-sidebar.tsx` (lines 121-126)
- **Category:** Accessibility
- **Description:** The mobile backdrop overlay uses `onClick` to close but has no keyboard event handler. The sidebar itself doesn't trap focus.
- **Impact:** Same accessibility issue as mobile nav — keyboard users can't dismiss the overlay.
- **Recommendation:** Add Escape key handler and focus trapping. Add `role="dialog"` and `aria-modal` to the sidebar container when open on mobile.

#### H12: Chat listing cards use Tailwind gray instead of design system tokens
- **Route/Component:** `apps/web/components/chat/chat-listing-card.tsx`, `chat-comparison-table.tsx`, `chat-tool-indicator.tsx`, `chat-legal-disclaimer.tsx`, `chat-web-result.tsx`, `chat-map-block.tsx`
- **Category:** Visual Design
- **Description:** All chat block components use raw Tailwind colors (`gray-200`, `blue-600`, `green-50`, etc.) instead of the CSS custom property design tokens (`var(--surface-200)`, `var(--primary-600)`, etc.) used by all other components.
- **Impact:** Chat blocks look visually inconsistent with the rest of the app. If the design tokens are ever updated (e.g., for a dark mode or rebrand), the chat components won't reflect the changes.
- **Recommendation:** Replace all Tailwind color utilities in chat components with the corresponding CSS custom properties from `globals.css`.

---

### MEDIUM

#### M1: Verify-edu page "Back" link goes to root redirect
- **Route/Component:** `apps/web/app/(auth)/verify-edu/page.tsx` (line 71)
- **Category:** Navigation
- **Description:** The back link points to `/` which immediately redirects to `/uw-madison/cribai`. Users expect "Back" to return them to the previous page.
- **Impact:** Unexpected navigation. Users who came from settings or the profile modal can't return to where they were.
- **Recommendation:** Use `router.back()` or pass a `returnTo` parameter.

#### M2: Dashboard "Recently Viewed" section is a placeholder
- **Route/Component:** `apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx` (lines 144-153)
- **Category:** Empty States
- **Description:** The "Recently Viewed" card always shows "No recently viewed listings" because the feature isn't implemented — there's no tracking of viewed listings.
- **Impact:** The card takes up dashboard space with zero utility, making the dashboard feel incomplete.
- **Recommendation:** Either implement view tracking (store in localStorage or DB) or remove the card until the feature is built. If kept, add a CTA like "Browse listings to start tracking."

#### M3: Submit listing form CTA says "Submit Listing" instead of value-oriented copy
- **Route/Component:** `apps/web/components/submit-listing-form.tsx` (line 296)
- **Category:** Content/Copy
- **Description:** The submit button reads "Submit Listing" which is generic. The page header says "Submit a Listing" with subtext "Help fellow students."
- **Impact:** Missed opportunity to reinforce the community value proposition.
- **Recommendation:** Change to "Share This Listing with Students" or "Help Fellow Students Find Housing."

#### M4: No success state after submitting a listing
- **Route/Component:** `apps/web/components/submit-listing-form.tsx` (lines 85-86)
- **Category:** Interaction Design
- **Description:** After successful submission, the form resets and shows a toast. There's no dedicated success state, no link to view the submission, no next action suggested.
- **Impact:** Users don't know what happens next. Was the listing immediately published? Is there a review process?
- **Recommendation:** Replace the form with a success view that shows: (a) confirmation message, (b) what happens next (review process if any), (c) "Submit another" and "Browse listings" CTAs.

#### M5: Profile form university field is hardcoded
- **Route/Component:** `apps/web/components/profile-form.tsx` (line 149)
- **Category:** Content/Copy
- **Description:** The university field is hardcoded to "University of Wisconsin-Madison" and disabled. It should derive from the user's verified .edu domain or campus association.
- **Impact:** If the platform expands to other campuses, this field will be wrong for non-UW-Madison users.
- **Recommendation:** Pass the university name as a prop from the campus context or user profile.

#### M6: Notification page auto-marks all as read with no undo
- **Route/Component:** `apps/web/app/(campus)/[campusSlug]/notifications/page.tsx` (lines 101-105)
- **Category:** Interaction Design
- **Description:** Visiting the notifications page immediately marks all unread notifications as read via a server-side UPDATE. There's no way to mark individual items, no "mark as unread" option, and no undo.
- **Impact:** Users who glance at notifications lose their unread state. The notification bell count drops to 0 immediately, even if the user didn't actually review all items.
- **Recommendation:** Add individual "mark as read" buttons per notification. Consider marking as read only when scrolled into view, or after a delay.

#### M7: Price filter inputs have no currency symbol or formatting
- **Route/Component:** `apps/web/components/listing-filters.tsx` (lines 45-59)
- **Category:** Interaction Design
- **Description:** The min/max price inputs are bare `<input type="number">` with placeholder text only. No `$` prefix, no formatting guidance.
- **Impact:** Users may be unsure whether to enter 1200 or 1,200. The input accepts any number including negatives.
- **Recommendation:** Add a `$` prefix label, set `min="0"`, and optionally show formatted values as the user types.

#### M8: Listing detail page has no share functionality
- **Route/Component:** `apps/web/app/(campus)/[campusSlug]/listings/[id]/page.tsx`
- **Category:** Interaction Design
- **Description:** There's no share button on the listing detail page. Students commonly share listings with roommates or friends.
- **Impact:** Users must manually copy the URL. Missed engagement and viral loop opportunity.
- **Recommendation:** Add a "Share" button with options for clipboard copy, native share sheet (via `navigator.share()`), and direct messaging.

#### M9: No confirmation before scheduling a tour via CribAI
- **Route/Component:** `apps/web/components/chat/chat-tour-confirmation.tsx`
- **Category:** Interaction Design
- **Description:** The tour confirmation block only shows after the tour is already submitted. There's no preview/confirmation step before the `schedule_tour` tool executes.
- **Impact:** Users may accidentally schedule tours without reviewing the details (date, time, address).
- **Recommendation:** Add a confirmation card with "Confirm" and "Cancel" buttons before executing the tool server-side.

#### M10: Listing card "True Cost" is cryptic without explanation
- **Route/Component:** `apps/web/components/listing-card.tsx` (lines 106-113)
- **Category:** Content/Copy
- **Description:** The listing card shows "True Cost: $X/mo" with no tooltip or explanation of what True Cost means. It appears below the rent price with no visual hierarchy distinguishing the two.
- **Impact:** New users don't understand the difference between rent and True Cost. The value proposition of CampusNest's signature feature is lost.
- **Recommendation:** Add an info icon with a tooltip explaining "True Cost includes estimated utilities, parking, internet, and other fees" or link to the calculator.

#### M11: Saved listings can't be sorted or filtered
- **Route/Component:** `apps/web/app/(campus)/[campusSlug]/saved/page.tsx`
- **Category:** Navigation, Interaction Design
- **Description:** Saved listings are displayed in chronological order with no ability to sort (by price, fairness, date saved) or filter.
- **Impact:** Users with many saved listings have difficulty comparing or finding specific ones.
- **Recommendation:** Reuse the `ListingFilters` component or add a simpler sort dropdown.

#### M12: Fairness badge popup doesn't close on outside click
- **Route/Component:** `apps/web/components/fairness-badge.tsx` (lines 39-86)
- **Category:** Interaction Design
- **Description:** The fairness details popup opens on click but only closes via the explicit "Close" button or clicking the badge again. There's no outside click handler.
- **Impact:** The popup can obscure other content and users may not realize they need to click "Close."
- **Recommendation:** Add a `useEffect` with a click-outside handler, or use a focus-based approach that dismisses on blur.

#### M13: Photo gallery has no fullscreen/lightbox view
- **Route/Component:** `apps/web/components/listing-photo-gallery.tsx`
- **Category:** Interaction Design
- **Description:** Photos are displayed in a horizontal scroll with small thumbnails. There's no way to view photos in fullscreen or a lightbox modal.
- **Impact:** Users can't inspect property photos in detail, which is critical for housing decisions.
- **Recommendation:** Add a lightbox modal triggered on thumbnail click, with next/previous navigation and pinch-to-zoom on mobile.

#### M14: Search/filter changes cause full page navigation
- **Route/Component:** `apps/web/components/listing-filters.tsx`
- **Category:** Performance
- **Description:** Every filter change calls `router.push()` which triggers a full server-side re-render of the listings page. There's no debouncing on the price inputs.
- **Impact:** Rapid typing in price fields causes multiple rapid navigations. Each keystroke fetches a new page.
- **Recommendation:** Add debouncing (300-500ms) to the price inputs. Consider client-side filtering for small datasets or use `startTransition` for non-blocking updates.

#### M15: CribAI has no suggested prompts/quick actions
- **Route/Component:** `apps/web/components/cribai-chat.tsx` (lines 409-418)
- **Category:** Content/Copy, Interaction Design
- **Description:** The empty state shows one example prompt ("Find me a 2-bedroom under $1200") as static text, but it's not clickable. No quick action buttons for common queries.
- **Impact:** Users must type their queries from scratch. Many won't know the full range of CribAI's capabilities.
- **Recommendation:** Add 3-4 clickable suggestion chips below the welcome text (e.g., "Compare my saved listings", "Explain security deposits", "Find studios near campus", "What's fair rent for a 2BR?"). Make them call `sendMessage()` on click.

#### M16: No footer across the application
- **Route/Component:** `apps/web/app/(campus)/[campusSlug]/layout.tsx`
- **Category:** Navigation, Content/Copy
- **Description:** There is no footer anywhere in the application. No links to about, terms, privacy, contact, or help resources.
- **Impact:** Missing trust signals, missing legal compliance (privacy policy, terms of service), and no secondary navigation for discovery.
- **Recommendation:** Add a minimal footer with: About CampusNest, Terms of Service, Privacy Policy, Contact/Support, and the current campus name.

---

### LOW

#### L1: Login OTP input allows paste but doesn't auto-submit
- **Route/Component:** `apps/web/app/(auth)/login/page.tsx` (lines 92-111)
- **Category:** Interaction Design
- **Description:** The OTP input accepts paste but doesn't auto-submit when all 8 digits are entered.
- **Impact:** Minor friction — users must paste and then click "Verify code."
- **Recommendation:** Add an `useEffect` that auto-submits when `otp.length === 8`.

#### L2: Resend OTP button creates invalid event
- **Route/Component:** `apps/web/app/(auth)/login/page.tsx` (line 115)
- **Category:** Error Handling
- **Description:** The "Resend code" button calls `handleSendOtp(new Event('submit') as unknown as React.FormEvent)`. This creates a native Event and force-casts it, which is fragile.
- **Impact:** Works but is a code smell. Could break if `handleSendOtp` ever accesses event-specific properties.
- **Recommendation:** Extract the OTP-sending logic into a separate function that doesn't depend on the event parameter.

#### L3: Listing card source display has inconsistent capitalization
- **Route/Component:** `apps/web/components/listing-card.tsx` (lines 116-122)
- **Category:** Content/Copy
- **Description:** Source names are mapped manually: `apartments.com` shows as "Apartments.com" but `web_search` shows as "web search" (lowercase). The fallback just renders the raw source string.
- **Impact:** Minor visual inconsistency. Unknown sources may appear as database slugs.
- **Recommendation:** Create a `formatSourceName()` utility that handles all known sources and title-cases unknown ones.

#### L4: Toggle switch has redundant aria-label
- **Route/Component:** `apps/web/components/true-cost-calculator.tsx` (line 163)
- **Category:** Accessibility
- **Description:** The checkbox inside the toggle has `aria-label={label}` but is already wrapped in a `<label>` element that contains the text. This creates duplicate announcements for screen readers.
- **Impact:** Minor screen reader verbosity.
- **Recommendation:** Remove the `aria-label` from the input since the wrapping `<label>` already provides the accessible name.

#### L5: Map component renders without a Mapbox token fallback
- **Route/Component:** `apps/web/components/listing-location-map.tsx`, `chat/chat-map-block.tsx`
- **Category:** Error Handling
- **Description:** Both map components pass `process.env.NEXT_PUBLIC_MAPBOX_TOKEN` directly to the Map component. If the token is missing or invalid, the map will fail with an error.
- **Impact:** Missing or expired Mapbox token will crash the listing detail page and chat map block.
- **Recommendation:** Check if the token exists before rendering. If missing, show a static map image or a "Map unavailable" placeholder.

#### L6: Conversation sidebar fetch errors are silently swallowed
- **Route/Component:** `apps/web/components/chat/conversation-sidebar.tsx` (lines 29-30)
- **Category:** Error Handling
- **Description:** The `fetchConversations` catch block is empty. If the API is down, users see an empty conversation list with no error indication.
- **Impact:** Users may think they have no conversations when the API is actually failing.
- **Recommendation:** Show a subtle error state like "Couldn't load conversations. Tap to retry."

#### L7: Graduation year list starts from 2024
- **Route/Component:** `apps/web/components/profile-form.tsx` (line 28)
- **Category:** Content/Copy
- **Description:** `GRADUATION_YEARS` starts at 2024 and generates 12 years (2024-2035). Since it's now 2026, the 2024 option is irrelevant for most new students.
- **Impact:** Minor clutter. Alumni who graduated in 2024 could still use it, but current students won't need years before the current date.
- **Recommendation:** Dynamically generate starting from `currentYear - 1` through `currentYear + 6`.

#### L8: Heart button has inconsistent toast messages
- **Route/Component:** `apps/web/components/heart-button.tsx` (lines 63, 76)
- **Category:** Content/Copy
- **Description:** Save shows "Saved to favorites" but unsave shows "Removed from favorites." The nav calls this section "Saved" not "Favorites."
- **Impact:** Minor terminology inconsistency.
- **Recommendation:** Use consistent terminology: "Added to Saved" / "Removed from Saved."

#### L9: Mobile nav active state detection is too broad
- **Route/Component:** `apps/web/components/mobile-nav.tsx` (lines 56-57)
- **Category:** Navigation
- **Description:** Active state uses `pathname?.includes('/listings')` which means `/listings/some-id` also highlights the "Listings" nav item. More importantly, `includes('/saved')` would match any path containing "saved."
- **Impact:** Minor — false positive active states are unlikely with current routes but could occur with future routes.
- **Recommendation:** Use `pathname === \`/${campusSlug}/listings\`` for exact match, or `pathname?.startsWith(\`/${campusSlug}/listings\`)`.

---

## 4. Recommendations Prioritized by Impact/Effort Ratio

### Quick Wins (High Impact, Low Effort)

| # | Issue | Estimated Effort |
|---|-------|-----------------|
| C4 | Fix malformed login redirect in submit-listing | 5 min |
| C5 | Consume `returnTo` parameter in login page | 15 min |
| H2 | Conditionally show auth-required nav items | 10 min |
| H12 | Replace Tailwind grays with design tokens in chat components | 30 min |
| M15 | Add clickable suggestion chips to CribAI empty state | 20 min |

### Medium Effort, High Impact

| # | Issue | Estimated Effort |
|---|-------|-----------------|
| C1 | Add loading.tsx skeletons to all routes | 2-3 hours |
| C2 | Add error.tsx boundaries to all routes | 1-2 hours |
| H1 | Make chat container responsive | 15 min |
| H3 | Fix notifications and saved pages for dev mode | 30 min |
| H4 | Add photo placeholder to listing cards | 20 min |
| H5 | Add filter active state indicators and clear button | 45 min |
| M14 | Add debouncing to filter inputs | 20 min |

### Larger Efforts, Strategic Value

| # | Issue | Estimated Effort |
|---|-------|-----------------|
| C3 | Build a proper landing page with campus selector | 1-2 days |
| H6 | Add pagination to listings page | 2-3 hours |
| H8 | Add custom not-found.tsx pages | 1 hour |
| M8 | Add share functionality to listing detail | 1-2 hours |
| M13 | Add photo lightbox/fullscreen viewer | 2-3 hours |
| M16 | Add application footer | 1 hour |
