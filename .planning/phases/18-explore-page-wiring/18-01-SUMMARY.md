---
phase: 18-explore-page-wiring
plan: "01"
subsystem: explore-page
tags: [chat, navigation, sse, streaming, explore]
dependency_graph:
  requires: []
  provides: [listing-card-navigation, scoped-chat-button, sse-chat-streaming]
  affects: [explore-page, chat-panel, listing-detail-flow]
tech_stack:
  added: []
  patterns: [buffer-based-sse-parsing, immutable-state-updates, context-loading-state]
key_files:
  created: []
  modified:
    - apps/web/components/explore/ListingCard.tsx
    - apps/web/app/layout.tsx
    - apps/web/app/(main)/explore/page.tsx
    - apps/web/components/chat/ChatProvider.tsx
    - apps/web/components/chat/AIChatPanel.tsx
    - apps/web/app/auth/confirm/route.ts
    - apps/web/middleware.ts
decisions:
  - campusSlug hardcoded to uw-madison in ChatProvider for Phase 18 scope
  - Moved AIChatButton/AIChatPanel to explore page directly (Option A from research), not usePathname guard
  - ChatProvider stays in root layout for context availability even when panel is page-scoped
metrics:
  duration: "~8 min"
  completed: "2026-03-11T21:45:45Z"
  tasks_completed: 2
  files_modified: 7
---

# Phase 18 Plan 01: Explore Page Wiring Summary

**One-liner:** Wired Explore-to-Detail navigation via next/link, scoped AIChatButton to Explore page only, and replaced hardcoded chat stub with buffer-based SSE consumer calling /api/ai/cribai.

## What Was Built

Three broken Explore page integrations from the v1.1 milestone audit (EXPL-04, EXPL-05) are now fixed:

1. **ListingCard navigation**: Added `Link` from `next/link` wrapping `<Card>` inside the `motion.div`, with `href={/listing/${listing.id}}`. Save button already had `e.stopPropagation()` so no navigation conflict.

2. **Scoped AIChatButton**: Removed `AIChatButton` and `AIChatPanel` from root `layout.tsx`. Moved both to `app/(main)/explore/page.tsx` directly. `ChatProvider` stays in root layout so context is still available. This means chat button only appears on the Explore page.

3. **Real SSE streaming**: Replaced `DEFAULT_RESPONSE` stub in `ChatProvider` with an async `sendMessage` that:
   - POSTs to `/api/ai/cribai` with `{ query, campusSlug: 'uw-madison', history: [] }`
   - Reads the response as a `ReadableStream` via `getReader()`
   - Uses buffer-based SSE parsing (split on `\n\n`, retain trailing partial chunk)
   - Accumulates text chunks immutably via `setMessages(prev => prev.map(...))`
   - Exposes `loading: boolean` in context
   - `AIChatPanel` send button is disabled while `loading` is true

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Remove unused `lastCampus` variables blocking build**
- **Found during:** Overall build verification
- **Issue:** Two pre-existing unused variable declarations (`const lastCampus = ...`) in `app/auth/confirm/route.ts` and `middleware.ts` caused TypeScript build errors unrelated to this plan
- **Fix:** Removed both unused `lastCampus` declarations (variables were declared but never read in either file)
- **Files modified:** `apps/web/app/auth/confirm/route.ts`, `apps/web/middleware.ts`
- **Commit:** 6d37ece

## Commits

| Hash | Message |
|------|---------|
| 9444472 | feat(18-01): scope AIChatButton to Explore page and add ListingCard Link navigation |
| c0100a5 | feat(18-01): wire ChatProvider to real CribAI SSE endpoint with loading state |
| 6d37ece | fix(18-01): remove unused lastCampus variables blocking build |

## Self-Check: PASSED

All key files exist and all commits verified present.
