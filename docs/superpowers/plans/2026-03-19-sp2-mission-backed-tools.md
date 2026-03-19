# Sub-project 2: Mission-Backed Tools Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure tool calls so significant actions create missions automatically, add two new mission pipelines (listing_deep_dive, sublease_post), and update the agent page launcher with all mission types.

**Architecture:** Tool handlers return an optional `missionRequest` signal in `ToolResult`. The SSE route detects this signal and creates missions via the existing mission API. New mission pipelines follow the established step-based pattern in `packages/ai/src/missions/`. The MissionLauncher dropdown gets new mission types.

**Tech Stack:** TypeScript, Gemini 2.5 Flash, Supabase, Next.js App Router SSE, Zod

**Spec:** `docs/superpowers/specs/2026-03-18-cribai-redesign-design.md` (Section 2)

---

### Task 1: Add `missionRequest` to ToolResult type

**Files:**
- Modify: `packages/ai/src/tools/types.ts`
- Test: `packages/ai/src/tools/__tests__/types.test.ts`

- [ ] **Step 1: Update ToolResult interface**

Add optional `missionRequest` field to ToolResult:

```typescript
export interface ToolResult {
  readonly modelContext: string;
  readonly clientBlock: ChatBlock;
  readonly mapBlock?: ChatBlock;
  readonly missionRequest?: {
    readonly type: string;
    readonly input: Readonly<Record<string, unknown>>;
  };
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm run build`
Expected: PASS (additive type change, no consumers break)

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/tools/types.ts
git commit -m "feat: add missionRequest field to ToolResult interface"
```

---

### Task 2: Update intent classifier + propose_mission with new mission types

**Files:**
- Modify: `packages/ai/src/intent-classifier.ts`
- Modify: `packages/ai/src/tools/handlers/propose-mission.ts`
- Modify: `packages/ai/src/tools/schemas.ts`
- Test: existing tests in `packages/ai/src/tools/__tests__/`

- [ ] **Step 1: Write failing test for new intents**

Create test in `packages/ai/src/tools/__tests__/propose-mission-intents.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('propose-mission intents', () => {
  it('should accept listing_deep_dive intent', async () => {
    // Import the handler and verify it doesn't throw for listing_deep_dive
    const { handleProposeMission } = await import('../handlers/propose-mission');
    // ... test that listing_deep_dive is a valid intent
  });

  it('should accept sublease_post intent', async () => {
    const { handleProposeMission } = await import('../handlers/propose-mission');
    // ... test that sublease_post is a valid intent
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm -F @campusnest/ai test -- --run propose-mission-intents`
Expected: FAIL

- [ ] **Step 3: Update intent-classifier.ts**

Add `listing_deep_dive` and `sublease_post` to the IntentResultSchema enum:

```typescript
intent: z.enum([
  'housing_search',
  'tour_outreach',
  'listing_deep_dive',
  'sublease_post',
  'lease_analysis',
  'general_chat',
]),
```

- [ ] **Step 4: Update propose-mission handler**

Add new intents to the propose_mission schema enum in `packages/ai/src/tools/handlers/propose-mission.ts` and in `packages/ai/src/tools/schemas.ts`.

- [ ] **Step 5: Update SSE route registered intents**

In `apps/web/app/api/ai/cribai/route.ts`, add new types to `REGISTERED_MISSION_INTENTS` set (or equivalent guard).

- [ ] **Step 6: Run tests**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm -F @campusnest/ai test -- --run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ai/src/intent-classifier.ts packages/ai/src/tools/handlers/propose-mission.ts packages/ai/src/tools/schemas.ts apps/web/app/api/ai/cribai/route.ts packages/ai/src/tools/__tests__/
git commit -m "feat: add listing_deep_dive and sublease_post to mission intents"
```

---

### Task 3: SSE route — detect missionRequest and create missions

**Files:**
- Modify: `apps/web/app/api/ai/cribai/route.ts`
- Test: integration test (manual SSE verification)

- [ ] **Step 1: Write missionRequest detection logic**

After processing each tool result in the SSE stream handler, check for `missionRequest`:

```typescript
// After tool result is processed
if (toolResult.missionRequest && userId) {
  const { type, input } = toolResult.missionRequest;
  // Create mission via service-role client
  const { data: mission, error } = await serviceClient
    .from('missions')
    .insert({
      user_id: userId,
      campus_id: campusId,
      type,
      title: `${type.replace(/_/g, ' ')} mission`,
      goal: toolResult.modelContext.slice(0, 200),
      input,
      status: 'pending',
    })
    .select('id')
    .single();

  if (mission) {
    // Emit mission_created event
    writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'mission_created', missionId: mission.id })}\n\n`));

    // Fire executor async
    after(async () => {
      const { executeMission } = await import('@campusnest/ai/missions');
      await executeMission(mission.id, serviceClient);
    });
  }
}
```

- [ ] **Step 2: Build check**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/ai/cribai/route.ts
git commit -m "feat: SSE route auto-creates missions from tool missionRequest signals"
```

---

### Task 4: Update search_listings with deep search CTA

**Files:**
- Modify: `packages/ai/src/tools/handlers/search-listings.ts`

- [ ] **Step 1: Update modelContext in search_listings handler**

Append deep search CTA to the `modelContext` returned by `search_listings`:

```typescript
const deepSearchCta = listings.length > 0
  ? "\n\nAlways end your response by offering: 'Want me to run a deep search? I'll research reviews, compare prices, and find the best matches for your specific needs.'"
  : '';

return {
  modelContext: `${existingModelContext}${deepSearchCta}`,
  clientBlock,
  mapBlock,
};
```

- [ ] **Step 2: Run existing search-listings tests**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm -F @campusnest/ai test -- --run search-listings`
Expected: PASS (additive change to modelContext)

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/tools/handlers/search-listings.ts
git commit -m "feat: search_listings offers deep search CTA in model context"
```

---

### Task 5: Create listing_deep_dive mission pipeline

**Files:**
- Create: `packages/ai/src/missions/listing-deep-dive/index.ts`
- Create: `packages/ai/src/missions/listing-deep-dive/steps/01-fetch-detail.ts`
- Create: `packages/ai/src/missions/listing-deep-dive/steps/02-pull-reviews.ts`
- Create: `packages/ai/src/missions/listing-deep-dive/steps/03-compare-similar.ts`
- Create: `packages/ai/src/missions/listing-deep-dive/steps/04-true-cost.ts`
- Create: `packages/ai/src/missions/listing-deep-dive/steps/05-generate-report.ts`
- Create: `packages/ai/src/missions/listing-deep-dive/__tests__/pipeline.test.ts`
- Modify: `packages/ai/src/missions/index.ts` (register import)

- [ ] **Step 1: Write pipeline integration test**

```typescript
// packages/ai/src/missions/listing-deep-dive/__tests__/pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMissionDefinition, clearRegistry } from '../../registry';

describe('listing_deep_dive pipeline', () => {
  beforeEach(() => { clearRegistry(); });

  it('should register with 5 steps', async () => {
    await import('../index');
    const def = getMissionDefinition('listing_deep_dive');
    expect(def).toBeDefined();
    expect(def!.steps).toHaveLength(5);
    expect(def!.steps.map(s => s.id)).toEqual([
      'fetch_detail', 'pull_reviews', 'compare_similar', 'calculate_true_cost', 'generate_report'
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm -F @campusnest/ai test -- --run listing-deep-dive`
Expected: FAIL (module doesn't exist)

- [ ] **Step 3: Implement step 1 — fetch_detail**

Fetches full listing data from DB using service-role client. Reuses logic from `get-listing-detail.ts` handler.

- [ ] **Step 4: Implement step 2 — pull_reviews**

Aggregates reviews from DB + optional web search. Reuses logic from `get-reviews.ts` handler.

- [ ] **Step 5: Implement step 3 — compare_similar**

Finds similar listings by price range and location. Queries listings table with filters.

- [ ] **Step 6: Implement step 4 — calculate_true_cost**

Uses existing cost calculator from `packages/utils/`. Adds utilities estimate.

- [ ] **Step 7: Implement step 5 — generate_report**

Compiles findings into a structured report via Gemini. Follows pattern from housing-search `05-report.ts`.

- [ ] **Step 8: Create index.ts to register pipeline**

```typescript
// packages/ai/src/missions/listing-deep-dive/index.ts
import { registerMission } from '../registry';
import { fetchDetailStep } from './steps/01-fetch-detail';
import { pullReviewsStep } from './steps/02-pull-reviews';
import { compareSimilarStep } from './steps/03-compare-similar';
import { trueCostStep } from './steps/04-true-cost';
import { generateReportStep } from './steps/05-generate-report';

registerMission({
  type: 'listing_deep_dive',
  steps: [fetchDetailStep, pullReviewsStep, compareSimilarStep, trueCostStep, generateReportStep],
});
```

- [ ] **Step 9: Import in missions/index.ts**

Add `import './listing-deep-dive/index';` to the barrel export.

- [ ] **Step 10: Run tests**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm -F @campusnest/ai test -- --run`
Expected: ALL PASS

- [ ] **Step 11: Commit**

```bash
git add packages/ai/src/missions/listing-deep-dive/ packages/ai/src/missions/index.ts
git commit -m "feat: add listing_deep_dive 5-step mission pipeline"
```

---

### Task 6: Create sublease_post mission pipeline

**Files:**
- Create: `packages/ai/src/missions/sublease-post/index.ts`
- Create: `packages/ai/src/missions/sublease-post/steps/01-validate.ts`
- Create: `packages/ai/src/missions/sublease-post/steps/02-geocode.ts`
- Create: `packages/ai/src/missions/sublease-post/steps/03-insert.ts`
- Create: `packages/ai/src/missions/sublease-post/steps/04-confirm.ts`
- Create: `packages/ai/src/missions/sublease-post/__tests__/pipeline.test.ts`
- Modify: `packages/ai/src/missions/index.ts` (register import)

- [ ] **Step 1: Write pipeline integration test**

```typescript
describe('sublease_post pipeline', () => {
  beforeEach(() => { clearRegistry(); });

  it('should register with 4 steps', async () => {
    await import('../index');
    const def = getMissionDefinition('sublease_post');
    expect(def).toBeDefined();
    expect(def!.steps).toHaveLength(4);
    expect(def!.steps.map(s => s.id)).toEqual([
      'validate_fields', 'geocode_address', 'insert_listing', 'confirm'
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement 4 steps**

Extract and refactor logic from existing `create-sublease.ts` handler into mission steps. Each step follows the `MissionStep` interface pattern.

- [ ] **Step 4: Register pipeline**

- [ ] **Step 5: Run all tests**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm -F @campusnest/ai test -- --run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/missions/sublease-post/ packages/ai/src/missions/index.ts
git commit -m "feat: add sublease_post 4-step mission pipeline"
```

---

### Task 7: Wire get_listing_detail + create_sublease to emit missionRequest

**Files:**
- Modify: `packages/ai/src/tools/handlers/get-listing-detail.ts`
- Modify: `packages/ai/src/tools/handlers/create-sublease.ts`
- Test: existing handler tests

- [ ] **Step 1: Update get_listing_detail to return missionRequest**

After returning listing details, include a `missionRequest` for `listing_deep_dive`:

```typescript
return {
  modelContext: '...',
  clientBlock: { ... },
  missionRequest: {
    type: 'listing_deep_dive',
    input: { listingId: args.listing_id },
  },
};
```

- [ ] **Step 2: Update create_sublease Phase 2 to return missionRequest**

When `confirmed=true` and listing is created, include `missionRequest` for `sublease_post`:

```typescript
missionRequest: {
  type: 'sublease_post',
  input: { listingId: newListing.id, address: args.address },
},
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm -F @campusnest/ai test -- --run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/tools/handlers/get-listing-detail.ts packages/ai/src/tools/handlers/create-sublease.ts
git commit -m "feat: wire get_listing_detail + create_sublease to emit missionRequest"
```

---

### Task 8: Update MissionLauncher with all mission types

**Files:**
- Modify: `apps/web/components/messages/MissionLauncher.tsx`

- [ ] **Step 1: Add new mission types to dropdown**

```tsx
<select value={intent} onChange={(e) => setIntent(e.target.value as MissionType)}>
  <option value="housing_search">Housing Search</option>
  <option value="listing_deep_dive">Listing Deep Dive</option>
  <option value="sublease_post">Post Sublease</option>
</select>
```

- [ ] **Step 2: Add conditional fields per mission type**

Show different input fields based on selected mission type:
- `housing_search`: bedrooms, budget, location, move_in_date
- `listing_deep_dive`: listing ID or address search
- `sublease_post`: address, rent, bedrooms, description

- [ ] **Step 3: Build check**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/messages/MissionLauncher.tsx
git commit -m "feat: MissionLauncher supports all mission types with conditional fields"
```

---

### Task 9: Full build + test verification

- [ ] **Step 1: Run full build**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm run build`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm test -- --run`
Expected: ALL PASS

- [ ] **Step 3: Run E2E tests**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm -F @campusnest/web e2e`
Expected: ALL PASS
