# Phase 27 — Housing Search Mission

## Position in v2.0 Phase Arc

- Phase 25 ✅ — Wire Real Data + Tech Debt Clearance
- Phase 26 ✅ — MissionExecutor Core + API Routes
- **Phase 27 ← THIS PHASE — Housing Search Mission**
- Phase 28 — Tour Outreach Mission
- Phase 29 — Chat-to-Mission Bridge + Concierge UI Wiring

## Goal

Implement the Housing Search Mission end-to-end: the 6-step agentic pipeline that takes
a student's preferences and returns a ranked shortlist of research-backed listing recommendations.

This is the first real mission that runs through the MissionExecutor. After Phase 27:
- A `housing_search` mission can be created via POST /api/missions
- The executor runs all 6 steps and stores the shortlist in mission state
- The Concierge UI renders the result card with ranked listings

## What Phase 26 Built (assumed available)

Phase 26 created:
- `packages/ai/src/missions/executor.ts` — MissionStep/StepContext/StepResult interfaces + executeMission()
- `packages/ai/src/missions/registry.ts` — empty registry, getMissionSteps(type) throws for unknown types
- `packages/ai/src/missions/index.ts` — re-exports
- API routes: POST /api/missions, GET /api/missions, GET /api/missions/[id],
  POST /api/missions/[id]/steer, POST /api/missions/[id]/drafts/[draftId]/approve,
  POST /api/missions/[id]/drafts/[draftId]/reject

## Phase 27 Scope

**27-01** (Wave 1): Housing search types + input/output Zod schemas
**27-02** (Wave 2): Steps 1-2 — search listings + deduplicate/normalize
**27-03** (Wave 2): Steps 3-4 — research per listing + rank/score (parallel with 27-02)
**27-04** (Wave 3): Steps 5-6 + registration + Concierge result card UI

## Key Interfaces (from Phase 26 executor)

```typescript
// packages/ai/src/missions/executor.ts

export interface MissionStep {
  id: string            // slug e.g. 'search_listings'
  label: string         // human-readable e.g. 'Searching listings'
  tool?: string         // CribAI tool name if this step calls a tool
  run: (ctx: StepContext) => Promise<StepResult>
}

export interface StepContext {
  missionId: string
  userId: string
  campusId: string
  campusSlug: string
  input: Record<string, unknown>   // original mission input (HousingSearchInput)
  state: Record<string, unknown>   // accumulated state from prior steps
  supabase: SupabaseClient
}

export interface StepResult {
  output: Record<string, unknown>  // merged into state for next steps
  draft?: MissionDraft             // if step generates a HITL draft
  done?: boolean                   // true = mission complete after this step
}
```

## Key Interfaces (existing tool infrastructure)

```typescript
// packages/ai/src/tools/types.ts

export interface ToolContext {
  readonly supabase: SupabaseClient
  readonly campusId: string
  readonly campusSlug: string
  readonly userId?: string
}

export interface ToolResult {
  readonly modelContext: string
  readonly clientBlock: ChatBlock
  readonly mapBlock?: ChatBlock
}
```

## Scoring Model

Housing search step 4 computes a weighted composite score:

| Dimension        | Weight | Source                           | Normalization     |
|------------------|--------|----------------------------------|-------------------|
| Price fairness   | 30%    | listing.fairness_score (1-10)    | (score-1)/9 → 0-1 |
| Review rating    | 25%    | Google Places avg rating (1-5)   | (rating-1)/4 → 0-1|
| Walkability      | 20%    | Walk Score (0-100)               | score/100 → 0-1   |
| Preference match | 25%    | Gemini scoring (0-10 scale)      | score/10 → 0-1    |

composite = 0.30×fairness + 0.25×reviews + 0.20×walkability + 0.25×preference

Listings with no review data: reviews component = 0.5 (neutral).
Listings with no Walk Score: walkability component = 0.5 (neutral).

## Execution Wave Order

Wave 1: 27-01 (types — no code deps)
Wave 2: 27-02 + 27-03 (steps 1-2 and steps 3-4 — can run in parallel, no shared files)
Wave 3: 27-04 (steps 5-6 + registration + UI — depends on wave 2 step files existing)
