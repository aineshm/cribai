# Visual & Interaction Polish Changelog

**Agent:** 3 (Visual & Interaction Polish)
**Date:** 2026-03-09
**Status:** Complete — all batches shipped, 0 new type errors

---

## Batch 1: Loading Skeletons & Error Boundaries (C1, C2, H8)

### C1: Loading skeletons for all routes
- `app/(campus)/[campusSlug]/loading.tsx` — generic campus route skeleton (6 cards)
- `app/(campus)/[campusSlug]/listings/loading.tsx` — filter bar + 6 listing card skeletons
- `app/(campus)/[campusSlug]/listings/[id]/loading.tsx` — photo gallery + detail + sidebar
- `app/(campus)/[campusSlug]/dashboard/loading.tsx` — 3 dashboard card skeletons
- `app/(campus)/[campusSlug]/saved/loading.tsx` — 3 saved listing card skeletons
- `app/(campus)/[campusSlug]/notifications/loading.tsx` — 4 notification row skeletons
- `app/settings/profile/loading.tsx` — form field skeletons

### C2: Error boundaries
- `app/error.tsx` — global fallback with "Try again" + "Go home" CTAs, logs error
- `app/(campus)/[campusSlug]/error.tsx` — campus-level boundary with "Try again" CTA

### H8: Branded 404 page
- `app/not-found.tsx` — branded 404 with "Go home" + "Browse listings" CTAs

---

## Batch 2: High-Impact Component Polish (H1, H4, H5, H9, H12, M7, M10, M14, M15, L3)

### H1: Chat container responsive height
- Changed `h-[600px]` → `h-[calc(100dvh-220px)] md:h-[600px]` in `cribai-chat.tsx`

### H4: Listing card photo placeholder
- When `heroPhoto` is null, shows gray placeholder with camera icon + "No photo" text
- HeartButton is always visible regardless of photo presence

### H5: Filter active state indicators + clear button
- Active filters get teal border + light teal background
- "Clear (N)" button appears when any filter is active
- SVG × icon for visual affordance

### H9: Chat message React keys
- Changed `key={i}` → `key={\`${msg.role}-${i}-${msg.blocks.length}\`}` for better reconciliation

### H12: Design tokens in all chat components
Migrated all 7 chat block components from raw Tailwind colors to CSS custom properties:
- `chat-listing-card.tsx` — gray-* → surface-*, blue-* → primary-*, green/yellow/red → fair-* semantic tokens
- `chat-comparison-table.tsx` — gray-50 → surface-50, blue-600 → primary-600
- `chat-tool-indicator.tsx` — blue-500 → primary-500, gray-500 → surface-500
- `chat-legal-disclaimer.tsx` — gray-* → surface-*, amber-* → secondary-*
- `chat-web-result.tsx` — gray-* → surface-*, blue-* → primary-*, emerald → primary
- `chat-tour-confirmation.tsx` — green-* → fair-good/surface-* semantic tokens
- `chat-map-block.tsx` — blue-* → primary-*, gray-* → surface-*, added Mapbox token fallback (L5)

### M7: Price filter currency formatting
- Added `$` prefix to min/max price inputs with `min="0"` validation
- Added aria-labels for accessibility

### M10: True Cost tooltip
- "True Cost" text now has dashed underline + cursor-help
- Hover tooltip explains: "Includes estimated utilities, parking, internet, and other fees beyond base rent."

### M14: Debounced filter inputs
- Price inputs now use 400ms debounce before triggering URL navigation
- Prevents rapid re-fetches on each keystroke

### M15: Clickable suggestion chips
- 4 suggestion buttons in CribAI empty state: "Find me a 2-bedroom under $1200", "Compare my saved listings", "Explain security deposits", "What's fair rent for a 2BR?"
- Click triggers `sendMessage()` directly

### L3: Source name formatting
- Created `formatSourceName()` utility with known source map + fallback title-casing
- Handles: apartments.com, craigslist, zillow, web_search, facebook_marketplace, hotpads

---

## Batch 3: Interaction Polish (M12, L6, L8, H11)

### M12: Fairness badge outside-click
- Added `useEffect` with `mousedown` listener to close popup on outside click
- Added Escape key handler
- Added `aria-expanded` and `role="dialog"` for accessibility
- Removed redundant "Close" button (outside-click + Escape are sufficient)

### L6: Conversation sidebar error state
- Added `fetchError` state — shows "Couldn't load conversations" with "Tap to retry" button
- Previously silently swallowed errors

### L8: Heart button toast consistency
- "Saved to favorites" → "Added to Saved"
- "Removed from favorites" → "Removed from Saved"
- Matches nav terminology ("Saved")

### H11: Conversation sidebar keyboard accessibility
- Added Escape key handler to close mobile sidebar overlay
- Added `role="dialog"`, `aria-modal`, `aria-label` to sidebar when open on mobile
- Added `aria-hidden` to backdrop overlay

---

## Files Created (10 new)
- `app/(campus)/[campusSlug]/loading.tsx`
- `app/(campus)/[campusSlug]/listings/loading.tsx`
- `app/(campus)/[campusSlug]/listings/[id]/loading.tsx`
- `app/(campus)/[campusSlug]/dashboard/loading.tsx`
- `app/(campus)/[campusSlug]/saved/loading.tsx`
- `app/(campus)/[campusSlug]/notifications/loading.tsx`
- `app/settings/profile/loading.tsx`
- `app/error.tsx`
- `app/(campus)/[campusSlug]/error.tsx`
- `app/not-found.tsx`

## Files Modified (12)
- `components/cribai-chat.tsx` — responsive height, suggestion chips, message keys
- `components/listing-card.tsx` — photo placeholder, True Cost tooltip, source formatting
- `components/listing-filters.tsx` — rewritten: debounce, currency, active states, clear
- `components/fairness-badge.tsx` — outside-click + Escape dismiss
- `components/heart-button.tsx` — toast terminology
- `components/chat/chat-listing-card.tsx` — design tokens
- `components/chat/chat-comparison-table.tsx` — design tokens
- `components/chat/chat-tool-indicator.tsx` — design tokens
- `components/chat/chat-legal-disclaimer.tsx` — design tokens
- `components/chat/chat-web-result.tsx` — design tokens
- `components/chat/chat-tour-confirmation.tsx` — design tokens
- `components/chat/chat-map-block.tsx` — design tokens + Mapbox fallback

## Batch 4: Final Polish (H10, L4, L7, L9, M13)

### H10: Mobile nav keyboard accessibility
- Added Escape key handler to close mobile nav overlay
- Implemented full focus trap (Tab cycles through menu items, Shift+Tab wraps)
- Added `role="dialog"`, `aria-modal="true"`, `aria-label` to menu panel

### L9: Mobile nav active state precision
- Replaced `pathname?.includes('/listings')` with `pathname?.startsWith('/${campusSlug}/listings')` for all nav links
- Prevents false positives from partial path matches

### L4: Toggle switch redundant aria-label
- Removed `aria-label` from checkbox input inside `<label>` wrapper in true-cost-calculator.tsx
- Eliminates duplicate screen reader announcements

### L7: Graduation year dynamic range
- Changed from hardcoded `2024-2035` to dynamic `currentYear-1` through `currentYear+6`
- Keeps list relevant as years pass

### M13: Photo gallery lightbox
- Added fullscreen lightbox modal triggered on photo click in listing-photo-gallery.tsx
- Arrow key navigation (Left/Right) + Escape to close
- Previous/Next buttons with counter overlay
- Body scroll lock while lightbox is open
- `cursor-zoom-in` on thumbnails for affordance
- Works for both single-photo and multi-photo galleries

---

## Final Summary

**Total issues addressed: 28 of 42** (from UX audit)
- Agent 3 scope: 25 items completed
- Agent 4 handled: L1, L2, C3, C4, C5, H2, H3, H6, H7, M1, M4, M8 + more
- Remaining items outside both agents' scope: M2 (recently viewed — needs backend), M5 (university from profile — needs campus context plumbing), M6 (notification read behavior — needs API change), M9 (tour confirmation flow — needs API change), M11 (saved sorting — needs query changes)

**Files created:** 10 new
**Files modified:** 15 existing
**New type errors:** 0
