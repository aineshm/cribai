---
phase: 29
plan: "01"
subsystem: ai
tags: [intent-classifier, chat-events, gemini, tdd, sse]
dependency_graph:
  requires: []
  provides: [intent-classifier, mission-proposal-event, mission-created-event]
  affects: [cribai-route, chat-event-union]
tech_stack:
  added: []
  patterns: [zod-boundary-validation, graceful-degradation-fallback, tdd-red-green]
key_files:
  created:
    - packages/ai/src/intent-classifier.ts
    - packages/ai/src/__tests__/intent-classifier.test.ts
    - apps/web/hooks/__tests__/use-missions-realtime.test.ts
  modified:
    - packages/ai/src/cribai.ts
    - packages/ai/src/index.ts
    - apps/web/app/api/ai/cribai/route.ts
decisions:
  - "Use responseMimeType JSON mode only (no tools config) — Gemini cannot combine tools + responseSchema"
  - "FALLBACK returns general_chat with confidence 0 — never throws, always degrades gracefully"
  - "shouldClassify gate (wordCount >= 5 + housing keyword) prevents unnecessary Gemini calls"
  - "confidence > 0.75 threshold for emitting mission_proposal SSE event"
metrics:
  duration: "~12 min"
  completed_date: "2026-03-12"
  tasks_completed: 6
  files_changed: 6
---

# Phase 29 Plan 01: Intent Classifier + ChatEvent Mission Events Summary

Intent classifier using Gemini JSON mode with Zod validation, mission_proposal/mission_created ChatEvent variants, and SSE wiring in the CribAI route.

## Objective

Create the Wave 0 foundation for the Chat-to-Mission Bridge: an intent classifier utility and extended ChatEvent union that Plans 29-02 and 29-03 depend on.

## What Was Built

### Intent Classifier (`packages/ai/src/intent-classifier.ts`)

- `shouldClassify(message)` — gate function: returns `false` for messages with fewer than 5 words or no housing keywords, preventing unnecessary Gemini API calls
- `classifyIntent(message, apiKey?)` — async classifier using Gemini `gemini-2.5-flash` with `responseMimeType: 'application/json'`; Zod validates the response shape; all errors return `FALLBACK` (intent: `general_chat`, confidence: 0)
- `IntentResult` type with four intents: `housing_search | tour_outreach | lease_analysis | general_chat`

### ChatEvent Union Extended (`packages/ai/src/cribai.ts`)

Added two new event variants:
- `mission_proposal` — carries `intent`, `confidence`, `extractedFields`
- `mission_created` — carries `missionId` (for use in 29-02)

### Route Wiring (`apps/web/app/api/ai/cribai/route.ts`)

- Imports `classifyIntent` and `shouldClassify` from `@campusnest/ai`
- Runs classification before the `ReadableStream` construction
- Emits a `mission_proposal` SSE event at the start of the stream (before the chat loop) when confidence > 0.75 and intent is not `general_chat`

### Tests

- 8 unit tests covering `shouldClassify` (4) and `classifyIntent` (4)
- All tests mock `createGeminiClient` — no real Gemini API calls
- `use-missions-realtime.test.ts` stub created for Plan 29-03

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| 1 | Create TDD test stubs | Done |
| 2 | Implement intent-classifier.ts | Done |
| 3 | Extend ChatEvent union | Done |
| 4 | Re-export from index.ts | Done |
| 5 | Wire classifyIntent into route | Done |
| 6 | Fill in classifier unit tests | Done |

## Verification

- `pnpm --filter @campusnest/ai test -- --run`: 215 tests, 31 test files, all passing
- `pnpm run build`: 7 tasks successful
- `pnpm --filter @campusnest/web exec tsc --noEmit`: no errors in app/ or hooks/

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock type assertions too strict**
- **Found during:** Task 6 / build verification
- **Issue:** `as ReturnType<typeof createGeminiClient>` cast failed because the mock object didn't implement all GoogleGenAI members
- **Fix:** Changed to `as unknown as ReturnType<typeof createGeminiClient>` — standard mock cast pattern
- **Files modified:** `packages/ai/src/__tests__/intent-classifier.test.ts`
- **Commit:** 33ecd86

**2. [Rule 3 - Blocking] resend package not installed**
- **Found during:** Build verification
- **Issue:** `packages/ai/package.json` listed `resend` as a dependency but it was not installed, causing `Cannot find module 'resend'` during build
- **Fix:** Ran `pnpm --filter @campusnest/ai install` — package was already in lockfile, just not installed
- **Files modified:** None (node_modules only)
- **Commit:** 33ecd86 (resolved before commit)

**3. [Rule 1 - Bug] Stub test file unused imports**
- **Found during:** Task 1 / web TS check
- **Issue:** `use-missions-realtime.test.ts` stub had `expect`, `vi`, `renderHook` imports that were unused with `.todo` tests; strict `noUnusedLocals` flag failed
- **Fix:** Stripped to only import `describe` and `it` from vitest
- **Files modified:** `apps/web/hooks/__tests__/use-missions-realtime.test.ts`
- **Commit:** 33ecd86

## Key Decisions

1. **JSON mode only (no tools):** Gemini cannot combine `responseMimeType: 'application/json'` with `tools` config. The classifier uses JSON mode only, consistent with existing codebase architecture decision.

2. **Graceful degradation is mandatory:** `classifyIntent` never throws. Errors return `FALLBACK` with `general_chat` intent and 0 confidence. The route only emits `mission_proposal` when confidence > 0.75.

3. **shouldClassify gate:** Prevents cold calls to Gemini for short or clearly non-housing messages. Requires both word count >= 5 AND a housing keyword match.

## Self-Check: PASSED

Files verified:
- FOUND: packages/ai/src/intent-classifier.ts
- FOUND: packages/ai/src/__tests__/intent-classifier.test.ts
- FOUND: apps/web/hooks/__tests__/use-missions-realtime.test.ts

Commit verified:
- FOUND: 33ecd86 — feat(29-01): intent classifier + ChatEvent mission events
