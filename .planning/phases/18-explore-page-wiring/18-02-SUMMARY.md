---
phase: 18-explore-page-wiring
plan: "02"
subsystem: testing
tags: [unit-tests, explore, chat, vitest, coverage]
dependency_graph:
  requires: [18-01]
  provides: [EXPL-01-verified, EXPL-02-verified, EXPL-03-verified, EXPL-04-verified, EXPL-05-verified]
  affects: [nyquist-compliance, wave-0-completion]
tech_stack:
  added: []
  patterns: [vitest, testing-library, mock-readable-stream, vi-mock-named-exports]
key_files:
  created:
    - apps/web/components/explore/__tests__/ViewToggle.test.tsx
    - apps/web/components/explore/__tests__/FilterChips.test.tsx
    - apps/web/lib/__tests__/filter-listings.test.ts
    - apps/web/components/explore/__tests__/ExploreLayout.test.tsx
    - apps/web/components/explore/__tests__/ListingCard.test.tsx
    - apps/web/components/chat/__tests__/AIChatButton.test.tsx
    - apps/web/components/chat/__tests__/ChatProvider.test.tsx
  modified:
    - apps/web/vitest.setup.ts
    - .planning/phases/18-explore-page-wiring/18-VALIDATION.md
decisions:
  - "Global framer-motion mock added to vitest.setup.ts using Proxy to forward motion.X to plain HTML elements"
  - "Global next/link mock renders plain anchor tags — avoids Next.js router dependency in unit tests"
  - "ExploreLayout mocks use named exports (ListingGrid, MapPanel, ViewToggle) matching source module structure"
  - "ChatProvider SSE tests use ReadableStream with TextEncoder to simulate real browser streaming behavior"
  - "Pre-existing test failures in freshness-badge, map-block, ProfilePage are out of scope — deferred"
metrics:
  duration: 12min
  completed: "2026-03-11"
  tasks_completed: 3
  files_created: 7
  files_modified: 2
  tests_added: 60
---

# Phase 18 Plan 02: Explore Page Unit Tests Summary

**One-liner:** 60 unit tests across 7 files covering all Explore + chat components using framer-motion proxy mock and SSE ReadableStream simulation.

## Tasks Completed

| Task | Name | Commit | Tests Added |
|------|------|--------|-------------|
| 1 | ViewToggle, FilterChips, filterListings tests | f8e7457 | 27 tests |
| 2 | ExploreLayout and ListingCard tests | 9d397ae | 21 tests |
| 3 | AIChatButton and ChatProvider tests | c868a99 | 12 tests |

## What Was Built

### Task 1: ViewToggle, FilterChips, filterListings (27 tests)

**ViewToggle (7 tests):** Radio button rendering, aria-checked state for active/inactive views, onViewChange callback with correct argument for Map and List buttons.

**FilterChips (8 tests):** All 6 chips render (Price, Beds, Distance, Move-in Date, Pet Friendly, Furnished), result count text with campus name, aria-pressed toggle state, onFiltersChange called with chip added/removed from Set.

**filterListings (12 tests):** Each filter type individually (price<=1500, beds>=2, distance<=0.5, move-in passthrough, pets amenity, furnished amenity), AND logic for multiple filters, unknown filter passthrough, impossible-combination empty result.

### Task 2: ExploreLayout, ListingCard (21 tests)

**ExploreLayout (8 tests):** Desktop grid has `lg:grid-cols-[3fr_2fr]` CSS class, `lg:hidden` mobile section, `hidden lg:grid` desktop section, ViewToggle rendered, listings prop captured via `vi.fn()` mock and verified via `toHaveBeenCalledWith`.

**ListingCard (13 tests):** Price formatted with comma and /mo suffix, Studio for 0-bed, bed count for 2+, baths label, distance text, rating, title, Link href to `/listing/[id]`, AI Verified badge conditional on `isVerified`, save button aria-pressed toggle.

### Task 3: AIChatButton, ChatProvider (12 tests)

**AIChatButton (4 tests):** Button renders with `aria-label="Open CribAI chat"`, `setOpen(true)` called on click via mocked `useChatContext`, renderable in isolation.

**ChatProvider (8 tests):** Initial state empty/loading false, user message appended immediately, fetch POST to `/api/ai/cribai` with `query` and `campusSlug: "uw-madison"`, loading false after stream completes, SSE text chunks accumulate to "Hello", SSE error event sets error text, network rejection appends error message, empty/whitespace sendMessage no-ops.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed filter-listings test: listing 3 distance 0.8 > 0.5 threshold**
- **Found during:** Task 1 test run
- **Issue:** Test expected listings 1, 2, 3 for distance filter but listing 3 has `distanceToCampus: 0.8` which exceeds the 0.5 threshold — test expectation was wrong
- **Fix:** Updated expected array to `['1', '2']` with explanatory comment
- **Files modified:** `apps/web/lib/__tests__/filter-listings.test.ts`

**2. [Rule 1 - Bug] Fixed ExploreLayout mock: named exports required**
- **Found during:** Task 2 test run
- **Issue:** `vi.mock('../ListingGrid', () => ({ default: ... }))` failed because ListingGrid uses named export, not default export
- **Fix:** Changed mock to `{ ListingGrid: ... }` and `{ MapPanel: ... }` matching actual source exports

**3. [Rule 1 - Bug] Fixed ExploreLayout: getByTestId fails when listing-grid appears twice**
- **Found during:** Task 2 test run
- **Issue:** Both mobile and desktop sections render `ListingGrid`, so `getByTestId('listing-grid')` throws "multiple elements found"
- **Fix:** Changed to `getAllByTestId('listing-grid')` and asserted `length >= 1`

### Out-of-Scope Pre-existing Failures (Deferred)

Three pre-existing test files fail independently of plan 18-02 changes:
- `__tests__/freshness-badge.test.tsx` (4 failures) — boundary condition mismatch
- `components/chat/__tests__/map-block.test.tsx` (5 failures) — map rendering issues
- `components/profile/__tests__/ProfilePage.test.tsx` (5 failures) — tab rendering issues

These failures existed before this plan. They are logged in `deferred-items.md`.

## Verification Results

```
Test Files:  23 passed (new: 7), 3 pre-existing failures (out of scope)
New Tests:   60 passed (0 failed)
VALIDATION.md: nyquist_compliant: true, wave_0_complete: true
```

All 7 new test files pass. All EXPL-01 through EXPL-05 requirements now have verified unit test coverage.

## Self-Check: PASSED

Files created:
- apps/web/components/explore/__tests__/ViewToggle.test.tsx — FOUND
- apps/web/components/explore/__tests__/FilterChips.test.tsx — FOUND
- apps/web/lib/__tests__/filter-listings.test.ts — FOUND
- apps/web/components/explore/__tests__/ExploreLayout.test.tsx — FOUND
- apps/web/components/explore/__tests__/ListingCard.test.tsx — FOUND
- apps/web/components/chat/__tests__/AIChatButton.test.tsx — FOUND
- apps/web/components/chat/__tests__/ChatProvider.test.tsx — FOUND

Commits verified:
- f8e7457 — Task 1: ViewToggle, FilterChips, filterListings
- 9d397ae — Task 2: ExploreLayout, ListingCard
- c868a99 — Task 3: AIChatButton, ChatProvider
