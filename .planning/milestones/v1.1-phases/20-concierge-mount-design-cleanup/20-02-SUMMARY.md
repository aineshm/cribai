---
phase: 20-concierge-mount-design-cleanup
plan: "02"
subsystem: ui-components
tags: [design-system, icons, lucide, svg-cleanup, DESIGN-03]
dependency_graph:
  requires: []
  provides: [lucide-icon-system-complete]
  affects: [all-10-component-files]
tech_stack:
  added: []
  patterns: [lucide-react named imports, Tailwind fill/stroke class toggling]
key_files:
  created: []
  modified:
    - apps/web/components/notification-bell.tsx
    - apps/web/components/chat/conversation-sidebar.tsx
    - apps/web/components/listing-card.tsx
    - apps/web/components/listing-filters.tsx
    - apps/web/components/listing-location-map.tsx
    - apps/web/components/submit-listing-form.tsx
    - apps/web/components/share-button.tsx
    - apps/web/components/listing-photo-gallery.tsx
    - apps/web/components/cribai-chat.tsx
    - apps/web/components/heart-button.tsx
    - apps/web/lib/__tests__/heart-button.test.tsx
decisions:
  - "Heart button fill/stroke state now managed via Tailwind classes (fill-red-500/stroke-red-500) rather than inline SVG attributes — cn() utility used for conditional class application"
  - "MapPin uses fill=currentColor + strokeWidth=0 to reproduce filled-pin appearance from Heroicon original"
  - "Pre-existing test failures in freshness-badge, map-block, ProfilePage are out of scope — logged to deferred items"
metrics:
  duration: ~8min
  completed: "2026-03-11"
  tasks_completed: 2
  files_modified: 11
requirements: [DESIGN-03]
---

# Phase 20 Plan 02: SVG-to-Lucide Icon Migration Summary

**One-liner:** Replaced all 14 remaining inline Heroicon SVGs across 10 components with named Lucide imports, completing the DESIGN-03 icon system gap.

## What Was Done

Phase 10 established Lucide as the project icon system, but 14 inline SVG elements remained in legacy components. This plan eliminated all of them in two batches:

**Task 1 — 6 simple files (7 SVGs → Lucide):**

| File | Lucide Icon | Notes |
|------|-------------|-------|
| notification-bell.tsx | `Bell` | Direct replacement |
| chat/conversation-sidebar.tsx | `MessageSquare` | Mobile toggle button |
| listing-card.tsx | `ImageIcon` | No-photo placeholder |
| listing-filters.tsx | `X` | Clear-all button |
| listing-location-map.tsx | `MapPin` | `fill="currentColor" strokeWidth={0}` for filled-pin look |
| submit-listing-form.tsx | `Check` | Success state icon |

**Task 2 — 4 complex files (7 SVGs → Lucide):**

| File | Lucide Icons | Notes |
|------|-------------|-------|
| share-button.tsx | `Check`, `Share2` | Conditional copy/share toggle |
| listing-photo-gallery.tsx | `X`, `ChevronLeft`, `ChevronRight` | Lightbox controls |
| cribai-chat.tsx | `Sparkles`, `Send` | Empty state and send button |
| heart-button.tsx | `Heart` | Fill state via Tailwind classes, not SVG attributes |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated heart-button tests to match Tailwind class approach**
- **Found during:** Task 2
- **Issue:** Two tests in `lib/__tests__/heart-button.test.tsx` asserted `svg.getAttribute('fill')` and `svg.getAttribute('stroke')` with hardcoded color values (`#ef4444`, `white`). After migration to Lucide + Tailwind classes, these attributes no longer exist on the rendered SVG element.
- **Fix:** Updated assertions to check `svg.className` for `fill-red-500`, `stroke-red-500`, and `stroke-white` Tailwind utility classes instead.
- **Files modified:** `apps/web/lib/__tests__/heart-button.test.tsx`
- **Commit:** 568a64c

### Out-of-Scope Pre-existing Failures (Deferred)

The following test failures existed before this plan and are unrelated to SVG migration:
- `__tests__/freshness-badge.test.tsx` — 4 boundary condition failures
- `components/chat/__tests__/map-block.test.tsx` — 5 failures (Mapbox mock issues)
- `components/profile/__tests__/ProfilePage.test.tsx` — 5 failures (tab rendering)

These are logged as deferred and not fixed here.

## Verification

- `grep -rn "<svg" apps/web/components/ --include="*.tsx"` — returns empty (zero inline SVGs)
- All 10 files import from `lucide-react`
- Heart button fill/unfill toggle preserved via Tailwind `fill-red-500`/`stroke-red-500` classes
- Test suite: 168 passing, 14 pre-existing failures (unchanged from baseline), heart-button tests green

## Self-Check: PASSED

Files exist:
- FOUND: apps/web/components/notification-bell.tsx
- FOUND: apps/web/components/heart-button.tsx
- FOUND: apps/web/components/cribai-chat.tsx

Commits exist:
- 123a13a: feat(20-02): replace inline SVGs with Lucide icons in 6 simple components
- 568a64c: feat(20-02): replace inline SVGs with Lucide icons in 4 complex components
