---
phase: 07-fix-e2e-test-issues-and-complete-v1
plan: "04"
subsystem: ui
tags: [cribai, gemini, tool-descriptions, system-prompt, form-design, tailwind]

requires:
  - phase: 07-02
    provides: UX polish baseline — notifications, profile, Recently Viewed removal

provides:
  - Narrowed search_listings tool description (DISCOVERY only, explicit 'Do NOT use' for known listings)
  - Enhanced schedule_tour description (skip redundant search when listing already identified)
  - System prompt instruction to proceed directly with action tools when listing already known
  - Submit listing form redesigned with 3 section cards (Location & Basics, Listing Details, Contact Information)
  - Dollar sign prefix inside rent input for clear affordance
  - Design token colors replacing hardcoded emerald in success state

affects: [cribai-chat, ai-tool-selection]

tech-stack:
  added: []
  patterns:
    - "Tool description narrowing: explicit DO NOT use guards to prevent model from calling tools when user context already provides needed info"
    - "Form section grouping: multiple card-based sections with h3 headers instead of single flat card"
    - "Currency prefix: relative-positioned span with pl-7 padding on input for dollar sign affordance"

key-files:
  created: []
  modified:
    - packages/ai/src/tools/schemas.ts
    - packages/ai/src/cribai.ts
    - apps/web/components/submit-listing-form.tsx

key-decisions:
  - "Tool description narrowing is the primary mechanism to fix CribAI tour scheduling confusion — explicit DO NOT use guards in Gemini function descriptions steer model behavior without code changes"
  - "System prompt instruction reinforces tool description: belt-and-suspenders approach for LLM behavioral guardrails"
  - "3-section form layout uses same rounded-xl card pattern for visual consistency"
  - "Dollar sign prefix uses pointer-events-none absolute span + pl-7 padding (no new library, pure Tailwind)"
  - "Pre-existing web build failure (missing .next/types generated file) is out of scope — AI package typecheck passes cleanly"

patterns-established:
  - "Behavioral guardrails pattern: add explicit DO NOT use conditions to tool descriptions for LLM steering"
  - "Dual-reinforcement pattern: align tool descriptions AND system prompt for consistent AI behavior"

requirements-completed: []

duration: 3min
completed: "2026-03-10"
---

# Phase 07 Plan 04: CribAI Tool Steering and Submit Form Redesign Summary

**Gemini tool descriptions narrowed with explicit DO NOT use guards for known-listing actions, and submit listing form restructured into 3 labeled section cards with dollar-prefix rent input**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-10T04:35:02Z
- **Completed:** 2026-03-10T04:37:37Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- CribAI search_listings description now explicitly says "Do NOT use when user has already identified a listing" — prevents redundant search before tour scheduling
- schedule_tour description updated to say "Do NOT run search_listings first if listing already specified"
- SYSTEM_PROMPT in cribai.ts gained explicit instruction to skip search_listings for known listings, proceeding directly with action tools
- Submit listing form replaced single flat card with 3 distinct section cards: Location & Basics, Listing Details, Contact Information
- Rent input now shows a `$` prefix inside the field via absolute-positioned span and `pl-7` padding
- Success state icons replaced hardcoded `emerald-100`/`emerald-600` with `var(--primary-50)` and `var(--primary-600)` design tokens

## Task Commits

Each task was committed atomically:

1. **Task 1: Narrow search_listings and enhance schedule_tour tool descriptions + system prompt** - `12f84bc` (feat)
2. **Task 2: Redesign submit listing form with section grouping and input affordances** - `76b6e4b` (feat)

## Files Created/Modified

- `packages/ai/src/tools/schemas.ts` - Narrowed search_listings description, enhanced schedule_tour description with DO NOT use guards
- `packages/ai/src/cribai.ts` - Added system prompt instruction to skip search_listings when listing already identified
- `apps/web/components/submit-listing-form.tsx` - 3-section card layout, dollar prefix on rent, design token success colors

## Decisions Made

- Used belt-and-suspenders approach: both tool description guards AND system prompt instruction for LLM behavioral reliability
- Dollar sign prefix implemented with pure Tailwind (relative div + absolute span + pl-7) — no new dependency
- Pre-existing web build failure (`.next/types` generated file missing) documented as out-of-scope — AI package compiles cleanly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Web build (`pnpm turbo build --filter=@campusnest/web`) fails on a pre-existing issue: `File '...types/app/(auth)/login/page.ts' not found` (a Next.js generated types file). This failure pre-dates this plan and is unrelated to our changes. The `@campusnest/ai` package typecheck passes cleanly. Logged as out-of-scope per deviation scope boundary rules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All UAT gap closure plans (07-03 and 07-04) complete
- CribAI tool selection behavior improved: model will proceed directly to schedule_tour without redundant search
- Submit listing form has clear visual hierarchy with section grouping and currency affordance
- Phase 07 UAT items addressed; project ready for v1 milestone completion

---
*Phase: 07-fix-e2e-test-issues-and-complete-v1*
*Completed: 2026-03-10*
