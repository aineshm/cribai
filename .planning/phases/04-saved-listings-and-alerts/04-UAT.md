---
status: complete
phase: 04-saved-listings-and-alerts
source: 04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md
started: 2026-03-06T19:35:00Z
updated: 2026-03-06T18:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Run `pnpm run build` from repo root. Build completes (pre-existing e2e typecheck errors acceptable). Run dev server, load app — homepage redirects to /uw-madison/cribai without crashes.
result: pass

### 2. Heart Button on Listing Cards
expected: Navigate to /uw-madison/listings. Listing cards show a heart icon overlaid on the hero photo (top-right, semi-transparent background). Clicking the heart when logged in fills it red with a scale animation and shows a "Saved to favorites" toast. Clicking again unfills it and shows "Removed from favorites" toast. If not logged in, clicking redirects to login page.
result: pass

### 3. Listing Detail Page — Photo Gallery
expected: Click any listing card to open /uw-madison/listings/[id]. The top of the page shows the photo gallery (horizontal scroll with dot indicators if multiple photos, or single photo, or "View on source" link if no photos). Below: title, price, heart button (inline variant), and fairness badge.
result: pass

### 4. Listing Detail Page — Map and Info
expected: On the detail page, there is a details section (beds/baths/sqft/available date), amenities tags, and a Mapbox map showing the listing location with a marker (if the listing has coordinates). There's a True Cost Calculator section. There's an "Ask CribAI about this place" button that links to /uw-madison/cribai with a listingId query param.
result: pass

### 5. Listing Detail Page — Similar Listings
expected: At the bottom of the detail page, a "Similar Nearby" section shows up to 3 listings with similar price range. Each rendered as a ListingCard with heart overlay. If no similar listings exist, this section may be empty or hidden.
result: skipped
reason: All rent_monthly values are null (data issue from scrape), so similar listings query returns nothing. Code is correct — section hidden when empty.

### 6. Listing Detail Page — Freshness Badge
expected: The detail page shows a FreshnessBadge indicating when the listing was last verified (emerald/amber/red coloring based on recency). If first_seen_at data exists, it shows "Posted X days ago".
result: pass

### 7. Saved Listings Page
expected: Navigate to /uw-madison/saved (or click "Saved" in the nav). If logged in with saved listings, shows a grid of saved listing cards sorted by most recently saved. If no saved listings, shows "No saved listings yet" message with a CTA button to CribAI. If not logged in, redirects to login.
result: pass

### 8. Saved Nav Link
expected: The desktop nav and mobile hamburger menu both show a "Saved" link. Clicking it navigates to /uw-madison/saved. The link appears whether logged in or not (the saved page itself handles auth).
result: pass

### 9. Notification Bell in Nav
expected: When logged in, the desktop nav shows a bell icon (NotificationBell). If there are unread notifications, a red badge with the count appears on the bell. Clicking the bell navigates to /uw-madison/notifications. The mobile nav shows a "Notifications" link with badge count if unread.
result: pass

### 10. Notifications Page
expected: Navigate to /uw-madison/notifications. Shows notification items grouped by date (Today, Yesterday, This Week, Earlier). Price change notifications show the listing address, old price with strikethrough, new price, and a color-coded arrow (green down for decrease, red up for increase). Unread items have a blue dot. After loading the page, unread count resets (bell badge clears).
result: pass

### 11. CribAI — "Show My Saved Listings"
expected: In CribAI chat (/uw-madison/cribai), type "show me my saved listings" or "what are my favorites". CribAI invokes the get_saved_listings tool and displays saved listing cards in the chat. If no saves, CribAI suggests searching and saving. If not logged in, CribAI prompts to sign in.
result: pass

### 12. Saved Badge Shows Price-Changed Count
expected: The "Saved" nav link shows a red badge with a number when there are unread price-change notifications for saved listings. This is NOT the total saved count — it specifically counts saved listings that had price changes the user hasn't seen yet. After visiting the notifications page, this badge should clear.
result: skipped
reason: Can't verify badge behavior right now

## Summary

total: 12
passed: 9
issues: 0
pending: 0
skipped: 3

## Gaps

[none yet]
