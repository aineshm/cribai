---
phase: 04-saved-listings-and-alerts
verified: 2026-03-10T16:05:40Z
status: passed
score: 4/4 must-haves verified
---

# Phase 4: Saved Listings & Alerts Verification Report

**Phase Goal:** Users can save listings, receive price-change alerts, view photos on detail pages, and see freshness indicators
**Verified:** 2026-03-10T16:05:40Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can favorite a listing from search results or detail page and view all saved listings on a dedicated page | VERIFIED | Migration `007_saved_listings_notifications.sql` creates `saved_listings` table with RLS. `heart-button.tsx` implements optimistic toggle with CSS keyframe animation and auth redirect. `/saved/page.tsx` serves the dedicated saved listings page with server-side auth check and empty state CTA. `get_saved_listings` CribAI tool enables AI-mediated access to saved listings. UAT tests 2, 7, 8, and 11 passed. Commits: b6389b6 (migration), c555ecb (HeartButton), b284e52 (ListingCard integration), f5f2076 (/saved page), 8eabf64 (CribAI tool tests). |
| 2 | User receives an alert when a saved listing's price changes | VERIFIED | `services/scraper/price-change-detector.ts` implements `detectPriceChanges` and `createPriceChangeNotifications` functions. Price detection runs before upsert in `run.ts` to compare against current DB prices. `notification-bell.tsx` subscribes to Supabase Realtime channel filtered by `user_id` for live unread count. `/notifications/page.tsx` groups alerts by date with color-coded price direction indicators. UAT tests 9 and 10 passed. Commits: b54e681 (detector module), 99847d3 (scraper integration), f9e44b5 (NotificationBell + notifications page), 6fba830 (nav wiring). |
| 3 | Listing detail pages show scraped photos in a gallery view | VERIFIED | `apps/web/app/(campus)/[campusSlug]/listings/[id]/page.tsx` rewritten with photo gallery section using horizontal scroll and dot indicators for multiple photos, single photo fallback, and "View on source" link when no photos. UAT test 3 passed. Commit: 2b576a8. |
| 4 | Listings display freshness indicators showing when they were last verified and how long ago they were posted | VERIFIED | `FreshnessBadge` component rendered on listing detail page with emerald/amber/red color coding based on recency. `first_seen_at` date displayed as "Posted X days ago". UAT test 6 passed. Commit: 2b576a8. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/007_saved_listings_notifications.sql` | saved_listings and notifications tables with RLS, indexes, and Realtime | VERIFIED | Creates `saved_listings` (user_id, listing_id, created_at, PK, FK, unique index) and `notifications` (user_id, listing_id, type CHECK 'price_change', old_rent, new_rent, is_read, created_at) with RLS policies enabling Realtime. Commit: b6389b6. |
| `packages/types/src/saved-listing.ts` | SavedListing Zod schema and TypeScript type | VERIFIED | `savedListingSchema` with uuid, timestamps, optional listing join. Exported from `@campusnest/types`. Commit: c46174d. |
| `packages/types/src/notification.ts` | Notification and PriceChangePayload Zod schemas | VERIFIED | `notificationSchema` with `price_change` type, old_rent/new_rent fields, is_read flag. `priceChangePayloadSchema` for scraper use. Commit: c46174d. |
| `packages/types/src/index.ts` | Re-exports for SavedListing and Notification types | VERIFIED | Updated to export new Phase 4 types. Commit: c46174d. |
| `apps/web/components/heart-button.tsx` | Client component with optimistic save toggle, animation, auth redirect, overlay and inline variants | VERIFIED | Calls `supabase.auth.getUser()` inline. Optimistic state flip with revert on API error. CSS `heart-pop` keyframe animation. `variant` prop ('overlay' | 'inline') for positioning. Auth redirect to login when unauthenticated. Commits: c555ecb (initial), 2b576a8 (inline variant). |
| `apps/web/lib/__tests__/heart-button.test.tsx` | Unit tests for HeartButton component | VERIFIED | 5 unit tests covering render, save toggle, unsave toggle, auth redirect, and optimistic revert. Commit: b284e52. |
| `apps/web/components/listing-card.tsx` | HeartButton overlay on hero photo | VERIFIED | HeartButton added as absolute-positioned overlay inside relative photo container. `savedListingIds` prop threaded from listing grid. Commit: b284e52. |
| `apps/web/components/listing-grid.tsx` | Threads savedListingIds to ListingCard | VERIFIED | Accepts `savedListingIds: Set<string>` prop and passes to each ListingCard. Commit: b284e52. |
| `apps/web/components/stale-section.tsx` | Threads savedListingIds to ListingCard | VERIFIED | Same savedListingIds threading as listing-grid. Commit: b284e52. |
| `apps/web/app/(campus)/[campusSlug]/listings/page.tsx` | Fetches user's saved listing IDs server-side | VERIFIED | Server component fetches authenticated user's saved_listings and passes Set of IDs to ListingGrid and StaleSection. Commit: b284e52. |
| `apps/web/app/globals.css` | heart-pop CSS keyframe animation | VERIFIED | `@keyframes heart-pop` with scale 1 → 1.35 → 1 and fill transition for save animation. Commit: b284e52. |
| `apps/web/vitest.config.ts` | Fixed include pattern for .tsx test files | VERIFIED | Pattern changed from `*.test.ts` to `*.test.{ts,tsx}` to match heart-button.test.tsx. Commit: b284e52. |
| `apps/web/app/(campus)/[campusSlug]/listings/[id]/page.tsx` | Enhanced detail page with photo gallery, HeartButton, FreshnessBadge, Mapbox map, CribAI CTA, similar listings | VERIFIED | Rewritten with ListingPhotoGallery (horizontal scroll, dot indicators), inline HeartButton variant, FreshnessBadge with emerald/amber/red coloring, first_seen_at "Posted X days ago", Mapbox map via ListingLocationMap, "Ask CribAI" CTA button, similar listings section (hidden when empty). Commit: 2b576a8. |
| `apps/web/app/(campus)/[campusSlug]/saved/page.tsx` | Saved listings page with auth redirect and empty state | VERIFIED | Server component with auth redirect to login. Supabase join query (saved_listings → listings). Responsive ListingGrid with savedListingIds. Friendly empty state with CTA to CribAI. Commit: f5f2076. |
| `apps/web/components/listing-location-map.tsx` | Single-listing Mapbox map component | VERIFIED | Uses react-map-gl/mapbox Map with single Marker at listing coordinates. Parsed from PostGIS WKB hex via parse-wkb-point utility. Commit: 2b576a8. |
| `apps/web/lib/parse-wkb-point.ts` | PostGIS WKB hex to lat/lng parser | VERIFIED | Parses PostGIS geography POINT WKB hex format to `{ lat: number, lng: number }` without new DB migrations or RPCs. Commit: 2b576a8. |
| `apps/web/components/heart-button.tsx` (inline variant) | Inline variant with currentColor stroke for non-overlay usage | VERIFIED | `variant="inline"` uses `bg-surface-100` background and `currentColor` stroke instead of white overlay styling. Added during 04-02 as bug fix (Rule 1). Commit: 2b576a8. |
| `apps/web/components/auth-nav.tsx` | Saved link with campusSlug prop | VERIFIED | Added `campusSlug` prop and Saved nav link visible to authenticated users. Commit: d711014. |
| `apps/web/components/mobile-nav.tsx` | Saved link and Notifications link with badge | VERIFIED | Saved link added; Notifications link with `priceChangedSavesCount` badge count. Updated again in 04-03 for bell integration. Commits: d711014 (Saved), 6fba830 (Notifications badge). |
| `apps/web/app/(campus)/[campusSlug]/layout.tsx` | Passes campusSlug to AuthNav; queries unread count; renders NotificationBell | VERIFIED | Threaded campusSlug to AuthNav in 04-02. Added unread notification count query and NotificationBell render in 04-03. Commits: d711014, 6fba830. |
| `services/scraper/price-change-detector.ts` | Price change detection and notification creation for scraper | VERIFIED | `detectPriceChanges(listings, supabase)` fetches current DB prices and returns array of price change objects. `createPriceChangeNotifications(changes, supabase)` creates per-user notifications for each saved listing with a price change. Commit: b54e681. |
| `services/scraper/__tests__/price-change-detector.test.ts` | Unit tests for price change detection | VERIFIED | 9 unit tests covering: no changes when prices unchanged, detects price decrease, detects price increase, handles missing listings, creates notifications for all savers, handles no saved users, handles errors. Commit: b54e681. |
| `services/scraper/run.ts` | Price detection integrated before upsert in scraper pipeline | VERIFIED | `detectPriceChanges` called before `upsertListings`, then `createPriceChangeNotifications` called after to create notifications for changed listings. Commit: 99847d3. |
| `apps/web/components/notification-bell.tsx` | Bell icon with Supabase Realtime subscription and unread badge | VERIFIED | Client component subscribing to `notifications:user_id=eq.${userId}` channel. Unread count from initial server prop, incremented on Realtime INSERT events. Badge hidden when count is zero. Commit: f9e44b5. |
| `apps/web/app/(campus)/[campusSlug]/notifications/page.tsx` | Notifications page with date grouping, color-coded price changes, mark-all-read on load | VERIFIED | Server component fetches notifications, marks all as read (UPDATE on load), groups by Today/Yesterday/This Week/Earlier. Price down = green arrow, price up = red arrow. Unread dot shown. Commit: f9e44b5. |
| `packages/ai/src/tools/schemas.ts` | get_saved_listings FunctionDeclaration in CRIBAI_TOOLS | VERIFIED | `get_saved_listings` schema with `sort` enum (saved_at | price_asc | price_desc) and optional `limit` integer parameter. Pre-existing before 04-04 execution. |
| `packages/ai/src/tools/handlers/get-saved-listings.ts` | get_saved_listings handler with Supabase join query and auth gate | VERIFIED | Handler checks `context.userId`, returns sign-in prompt block if unauthenticated (auth gate pattern). Queries `saved_listings` joined to `listings`, sorted and limited. Pre-existing before 04-04 execution. |
| `packages/ai/src/tools/executor.ts` | get_saved_listings registered in tool executor | VERIFIED | Tool registered in executor switch statement alongside other CribAI tools. Pre-existing before 04-04 execution. |
| `packages/ai/src/tools/__tests__/get-saved-listings.test.ts` | Integration tests for get_saved_listings handler | VERIFIED | 8 integration tests: auth gate (unauthenticated), empty state (no saves), happy path (returns listing cards), sort by price_asc, sort by price_desc, limit validation, error handling, defaults. Commit: 8eabf64. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `heart-button.tsx` | `supabase saved_listings` | Supabase client insert/delete | WIRED | `supabase.from('saved_listings').insert({user_id, listing_id})` on save; `.delete().eq('user_id', userId).eq('listing_id', listingId)` on unsave. Optimistic state managed via useState. |
| `listing-card.tsx` | `heart-button.tsx` | Component import, overlay variant | WIRED | `<HeartButton listingId={listing.id} initialSaved={savedListingIds.has(listing.id)} variant="overlay" />` inside photo container. |
| `listings/page.tsx` | `saved_listings` table | Supabase server client query | WIRED | `supabase.from('saved_listings').select('listing_id').eq('user_id', userId)` returns Set passed to ListingGrid and StaleSection. |
| `price-change-detector.ts` | `notifications` table | Supabase service client insert | WIRED | `supabase.from('notifications').insert(notificationRows)` where each row has `{user_id, listing_id, type: 'price_change', old_rent, new_rent, is_read: false}`. |
| `notification-bell.tsx` | Supabase Realtime | `supabase.channel()` subscription | WIRED | `supabase.channel('notifications:user_id=eq.${userId}').on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'notifications', filter: \`user_id=eq.${userId}\`}, handler)` triggers unread count increment. |
| `get-saved-listings.ts` handler | `saved_listings` joined to `listings` | Supabase server client join query | WIRED | `supabase.from('saved_listings').select('*, listings(*)').eq('user_id', userId).order(sortColumn, {ascending}).limit(limit)` returns listing cards as ToolResult. |
| `listings/[id]/page.tsx` | `listing-location-map.tsx` | Component import, coordinates prop | WIRED | `<ListingLocationMap lat={coords.lat} lng={coords.lng} />` rendered when WKB hex parsed successfully. `parse-wkb-point.ts` converts PostGIS hex to `{lat, lng}`. |
| `listings/[id]/page.tsx` | `FreshnessBadge` | Component import, listing prop | WIRED | `<FreshnessBadge listing={listing} />` renders emerald/amber/red badge based on `last_scraped_at` recency. `first_seen_at` displayed as "Posted X days ago" below badge. |
| `run.ts` (scraper) | `price-change-detector.ts` | Function imports, pre-upsert position | WIRED | `detectPriceChanges(normalizedListings, supabase)` called before `upsertListings`. `createPriceChangeNotifications(priceChanges, supabase)` called after upsert. |
| `layout.tsx` | `notification-bell.tsx` | Component import, unread count prop | WIRED | `supabase.from('notifications').select('id', {count: 'exact'}).eq('user_id', userId).eq('is_read', false).eq('type', 'price_change')` passed as `initialUnreadCount` to NotificationBell. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LIST-01 | 04-01, 04-02, 04-04 | User can save/favorite listings and view them from a saved listings page | SATISFIED | `saved_listings` table (007 migration, b6389b6). `HeartButton` with optimistic toggle (c555ecb). `/saved/page.tsx` dedicated saved listings page (f5f2076). `get_saved_listings` CribAI tool with auth gate (pre-existing + 8eabf64 tests). UAT tests 2, 7, 8, 11 passed (0 issues). |
| LIST-02 | 04-03 | User receives alerts when a saved listing's price changes | SATISFIED | `price-change-detector.ts` with `detectPriceChanges` and `createPriceChangeNotifications` (b54e681). Integrated into `run.ts` before upsert (99847d3). `NotificationBell` with Realtime subscription (f9e44b5). Notifications page with date grouping (f9e44b5). UAT tests 9, 10 passed (0 issues). |
| LIST-03 | 04-02 | Listing detail pages display photos scraped from source | SATISFIED | `listings/[id]/page.tsx` rewritten with photo gallery section: horizontal scroll with dot indicators, single photo fallback, "View on source" link when no photos (2b576a8). UAT test 3 passed. |
| LIST-04 | 04-02 | Listings show freshness indicators (last verified/updated, days since posted) | SATISFIED | `FreshnessBadge` on detail page with emerald/amber/red coloring based on `last_scraped_at` recency. `first_seen_at` displayed as "Posted X days ago" (2b576a8). UAT test 6 passed. |

No orphaned requirements found — all 4 LIST requirements mapped to Phase 4 in REQUIREMENTS.md are covered by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No TODO, FIXME, placeholder, or stub patterns found in any phase 4 files |

### Human Verification Required

#### 1. Photo Gallery Rendering with Real Images

**Test:** Navigate to any listing detail page `/uw-madison/listings/[id]` that has photo URLs scraped from the source.
**Expected:** Gallery renders scraped photos in horizontal scroll. Multiple photos show dot indicators. Single photo shows cleanly. Missing photos display "View on source" link.
**Why human:** Photo rendering quality, gallery scroll behavior, and dot indicator interaction require browser testing with real scraped image data.

#### 2. Price Change Notification End-to-End

**Test:** Save a listing. Trigger a price change scrape (or manually update `rent_monthly` in DB). Verify the notification bell shows an unread badge, clicking navigates to the notifications page, and the notification entry shows old vs new price with correct color-coded arrow.
**Why human:** Requires real Supabase Realtime connection, actual price change data in the DB, and end-to-end scraper execution with `SUPABASE_KEY` configured.

#### 3. Heart Animation Visual Quality

**Test:** Navigate to `/uw-madison/listings`, click a heart icon on a listing card. Verify the fill animation plays (scale pop + red fill), and clicking again reverses it.
**Why human:** CSS keyframe animation quality (`heart-pop`) and visual feedback require browser testing.

### Gaps Summary

No code gaps found. All 4 requirements are verified through artifact existence, substantive implementation, and wiring. The saved listings infrastructure (migration, HeartButton, /saved page), price change alerts (scraper detector, Realtime bell, notifications page), photo gallery (detail page rewrite), and freshness indicators (FreshnessBadge) are all fully implemented and connected.

Tests cover: 5 unit tests (HeartButton), 9 unit tests (price-change-detector), 8 integration tests (get_saved_listings). UAT: 9/12 passed, 3 skipped for data/env reasons (similar listings query with null rent data, badge timing verification) — these are data conditions, not code bugs.

---

_Verified: 2026-03-10T16:05:40Z_
_Verifier: Claude (gsd-executor)_
