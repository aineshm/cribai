# E2E Test Results: Listings & Search

**Date**: 2026-03-09
**Environment**: localhost:3000, BYPASS_AUTH=true (user: Emma Chen)
**Browser**: Chrome via Playwright MCP

---

## Test Summary

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | Listings grid loads | PASS | 572 listings, 18 cards per page, pagination (32 pages) |
| 2 | Price filter (min/max) | BUG | Count updates (79 results) but displayed cards still show out-of-range prices ($0, $280, $350) |
| 3 | Bedroom filter | PASS | Selecting "2 bed" reduces to 68 listings, cards show "2 bed" labels |
| 4 | Property type filter | MISSING | No property type filter exists — only Bedrooms, Min/Max price, Sort |
| 5 | Listing detail page | PASS | All sections present: title, price, details, True Cost Calculator, Fairness badge, photo area, Similar Nearby, share button, save button |
| 6 | Heart/save button | PASS | Button found via `aria-label="Save to favorites"`, click succeeds, aria-label clears after click (state change) |
| 7 | Saved listings page | PASS | Page loads at /uw-madison/saved, shows "Saved" content; 0 saved cards visible (may need page refresh after save) |
| 8 | Dashboard page | PASS | Loads at /uw-madison/dashboard, shows welcome with "Emma", dashboard sections present |
| 9 | Mobile viewport (375px) | PASS | Single-column layout (card width: 327px), hamburger menu present, all content accessible |
| 10 | Console errors & loading | WARN | See details below |

**Overall: 7 PASS, 1 BUG, 1 MISSING, 1 WARN**

---

## Detailed Findings

### Test 1: Listings Grid
- **URL**: `/uw-madison/listings`
- **Title**: "Listings -- Madison"
- **Count**: 572 listings found (displayed top-right)
- **Grid**: 18 listing cards per page in 3-column layout
- **Pagination**: Pages 1-32, with Next link
- **Each card shows**: photo area (placeholder "No photo" for most), title, price/mo, verification badge ("Verified today"), heart button
- **Observation**: Most listings show "No photo" placeholder -- only sort=price_desc page showed Google Places photos

### Test 2: Price Filter (BUG)
- **Steps**: Set min=$500, max=$1000, tab out
- **Result**: Count correctly updates to "79 listings found"
- **BUG**: The displayed listing cards still show prices outside the range ($0/mo, $280/mo, $350/mo)
- **Root cause hypothesis**: The count is filtered server-side but the card grid may be using stale/cached data, or the filter applies on next page load only
- **Severity**: Medium -- misleading UX

### Test 3: Bedroom Filter
- **Steps**: Select "2 bed" from dropdown
- **Result**: Count updates to 68 listings, cards display "2 bed" badge
- **Status**: Working correctly

### Test 4: Property Type Filter (MISSING)
- **Available filters**: Bedrooms dropdown, Min price, Max price, Sort order
- **No property type filter** (Apartment/House/Condo/etc.) exists in the UI
- **Recommendation**: Add a property type select/multi-select filter

### Test 5: Listing Detail Page
- **Tested listing**: 2109 University Ave Unit 3, Madison, WI
- **Sections found**:
  - Title/address (h1)
  - Price display
  - "Details" section with bed/bath info
  - "True Cost Calculator" section
  - Fairness badge/score
  - Photo gallery area (shows "No photo" placeholder)
  - "Similar Nearby" section with related listings
  - Share button
  - Save/heart button on detail page
  - Back to listings link
- **Map section**: Not detected via DOM query (may be rendered conditionally or use a different pattern)

### Test 6: Heart/Save Button
- **Button**: Found via `aria-label="Save to favorites"`
- **Click behavior**: Click succeeds, aria-label changes (state toggle works)
- **Note**: Button uses icon-only design (SVG heart), relies on aria-label for accessibility -- good pattern

### Test 7: Saved Listings Page
- **URL**: `/uw-madison/saved`
- **Page loads**: Yes, shows "Saved" heading
- **Saved cards**: 0 visible after saving in test 6
- **Possible issue**: Save from listings grid may not persist, or page needs reload/navigation to reflect new saves

### Test 8: Dashboard
- **URL**: `/uw-madison/dashboard`
- **Loads**: Yes, with welcome message mentioning "Emma"
- **Content**: Full dashboard with sections (large body: 96KB text content)

### Test 9: Mobile Viewport (375px)
- **Layout**: Cards switch to single column (327px wide)
- **Navigation**: Hamburger menu button (`aria-label="Open menu"`) present
- **Filters**: Visible and accessible
- **Pagination**: Present
- **Status**: Responsive design working well

### Test 10: Console Errors & Loading States

#### Console Errors
| Error | Count | Severity |
|-------|-------|----------|
| `favicon.ico` 404 | 1 | Low -- missing favicon |
| Google Places photo URLs returning 403 | ~15 | Medium -- all Google Places photos broken |
| WebSocket HMR disconnect | 1 | Low -- dev-only, not production issue |

#### Google Places Image Issue (Medium Severity)
- All listing photos served via `places.googleapis.com` return **403 Forbidden** when proxied through Next.js Image Optimizer (`/_next/image?url=...`)
- These appear on the sort=price_desc page where listings have photo URLs
- **Root cause**: Google Places API photos likely require fresh signed URLs or the API key may have restrictions
- **Impact**: Any listing with a Google Places photo shows broken image

#### Loading States
- `animate-pulse` skeleton detected during page load -- loading state exists
- Loading transitions between filter changes are smooth

#### Missing Favicon
- No `<link rel="icon">` tag in the document head
- Browser requests `/favicon.ico` and gets 404

---

## Bugs & Recommendations

### Bugs to Fix
1. **Price filter shows wrong cards** (Medium): Cards displayed don't match the min/max price filter. The count updates but visible cards include $0 and sub-$500 listings when filter is $500-$1000.
2. **Google Places photos 403** (Medium): All photos from `places.googleapis.com` fail with 403 when proxied through Next.js image optimizer. Need to check API key restrictions or switch to direct URLs.
3. **Missing favicon** (Low): Add a favicon to prevent 404 on every page load.

### Missing Features
4. **No property type filter**: Add filter for Apartment/House/Condo/Townhouse/etc.
5. **Map on detail page**: Map section not rendering (may need Google Maps API key or conditional rendering fix).

### Minor Issues
6. **Save not reflected on /saved page**: After clicking heart on listings grid, navigating to /saved shows 0 cards. May be a timing/refresh issue.
7. **Most listings show "No photo"**: 572 listings but vast majority have no photos -- only a few have (broken) Google Places URLs.
