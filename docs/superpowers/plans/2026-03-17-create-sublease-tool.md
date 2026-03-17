# Create Sublease Tool — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `create_sublease` tool to CribAI so authenticated users can list subleases through conversation with a two-phase HITL confirmation flow, plus centralized agent run logging for all tools.

**Architecture:** Two-phase single tool — Phase 1 validates and previews, Phase 2 publishes. Direct Supabase insert (no HTTP call). Centralized fire-and-forget logging in executor wraps every tool invocation into an `agent_runs` table. Geocoding via existing Google Places API.

**Tech Stack:** TypeScript, Zod, Supabase (PostGIS), Google Places API, Vitest

**Spec:** `docs/superpowers/specs/2026-03-17-create-sublease-tool-design.md`

---

### Task 1: Supabase Migration — `agent_runs` Table

**Files:**
- Create: `supabase/migrations/023_agent_runs.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration 023: Agent run logging for CribAI tool observability
CREATE TABLE agent_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  campus_id        uuid REFERENCES campus_configs(id) ON DELETE SET NULL,
  conversation_id  uuid,
  tool_name        text NOT NULL,
  phase            smallint,
  args_summary     jsonb NOT NULL DEFAULT '{}',
  result_status    text NOT NULL
                   CHECK (result_status IN ('success', 'error', 'timeout')),
  result_summary   jsonb NOT NULL DEFAULT '{}',
  error_message    text,
  duration_ms      integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_runs_user_id    ON agent_runs (user_id, created_at DESC);
CREATE INDEX idx_agent_runs_tool_name  ON agent_runs (tool_name, created_at DESC);
CREATE INDEX idx_agent_runs_created_at ON agent_runs (created_at DESC);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
-- Service-role only — no permissive policies for end users
```

- [ ] **Step 2: Apply migration to Supabase**

Run: `npx supabase db push` or apply via Supabase MCP `apply_migration` tool.
Expected: Migration applies successfully, `agent_runs` table created.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/023_agent_runs.sql
git commit -m "feat: add agent_runs table for tool observability (migration 023)"
```

---

### Task 2: Make `rent_monthly` Nullable in Listing Submission Schema

**Files:**
- Modify: `packages/types/src/listing.ts:58`

- [ ] **Step 1: Update the schema**

In `packages/types/src/listing.ts`, change line 58 from:
```typescript
rent_monthly: z.number().positive('Rent must be positive').max(10000),
```
to:
```typescript
rent_monthly: z.number().positive('Rent must be positive').max(10000).nullable().optional(),
```

- [ ] **Step 2: Build types package to verify**

Run: `cd packages/types && pnpm run build`
Expected: Compiles with no errors.

- [ ] **Step 3: Run full build to check no downstream breakage**

Run: `pnpm run build`
Expected: All packages build. The PostWizard form always sends a number so existing flow is unaffected.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/listing.ts
git commit -m "feat: make rent_monthly nullable for negotiable subleases"
```

---

### Task 3: Extend `PlaceDetailsResult` with `location` Field

**Files:**
- Modify: `packages/ai/src/tools/lib/google-places.ts:16-23`

- [ ] **Step 1: Add location to the interface**

In `packages/ai/src/tools/lib/google-places.ts`, add `location` to `PlaceDetailsResult`:

```typescript
export interface PlaceDetailsResult {
  readonly id: string;
  readonly displayName: { readonly text: string };
  readonly rating: number;
  readonly userRatingCount: number;
  readonly reviews: readonly PlaceReview[];
  readonly location?: {
    readonly latitude: number;
    readonly longitude: number;
  };
}
```

- [ ] **Step 2: Build to verify**

Run: `cd packages/ai && pnpm run build`
Expected: Compiles. Existing callers unaffected (field is optional).

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/tools/lib/google-places.ts
git commit -m "feat: add location field to PlaceDetailsResult for geocoding"
```

---

### Task 4: Geocoding Helper

**Files:**
- Create: `packages/ai/src/tools/lib/geocode-address.ts`
- Create: `packages/ai/src/tools/__tests__/geocode-address.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/ai/src/tools/__tests__/geocode-address.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock google-places module before importing geocodeAddress
vi.mock('../lib/google-places', () => ({
  textSearchPlace: vi.fn(),
  getPlaceDetails: vi.fn(),
}));

import { geocodeAddress } from '../lib/geocode-address';
import { textSearchPlace, getPlaceDetails } from '../lib/google-places';

const mockTextSearch = vi.mocked(textSearchPlace);
const mockGetDetails = vi.mocked(getPlaceDetails);

describe('geocodeAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns lat/lng for a valid address', async () => {
    mockTextSearch.mockResolvedValue('place-id-123');
    mockGetDetails.mockResolvedValue({
      id: 'place-id-123',
      displayName: { text: 'Randall Station' },
      rating: 4.0,
      userRatingCount: 50,
      reviews: [],
      location: { latitude: 43.0731, longitude: -89.4012 },
    });

    const result = await geocodeAddress('Randall Station, Madison WI', 'test-key');

    expect(result).toEqual({ latitude: 43.0731, longitude: -89.4012 });
    expect(mockTextSearch).toHaveBeenCalledWith('Randall Station, Madison WI', 'test-key');
    expect(mockGetDetails).toHaveBeenCalledWith('place-id-123', 'test-key', 'location');
  });

  it('returns null when textSearchPlace finds no match', async () => {
    mockTextSearch.mockResolvedValue(null);

    const result = await geocodeAddress('Nonexistent Place', 'test-key');

    expect(result).toBeNull();
    expect(mockGetDetails).not.toHaveBeenCalled();
  });

  it('returns null when getPlaceDetails has no location', async () => {
    mockTextSearch.mockResolvedValue('place-id-456');
    mockGetDetails.mockResolvedValue({
      id: 'place-id-456',
      displayName: { text: 'Test' },
      rating: 0,
      userRatingCount: 0,
      reviews: [],
    });

    const result = await geocodeAddress('Vague Address', 'test-key');

    expect(result).toBeNull();
  });

  it('returns null on textSearchPlace API error', async () => {
    mockTextSearch.mockRejectedValue(new Error('API error'));

    const result = await geocodeAddress('Some Address', 'test-key');

    expect(result).toBeNull();
  });

  it('returns null on getPlaceDetails API error', async () => {
    mockTextSearch.mockResolvedValue('place-id-789');
    mockGetDetails.mockRejectedValue(new Error('Details API error'));

    const result = await geocodeAddress('Another Address', 'test-key');

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ai && pnpm vitest run src/tools/__tests__/geocode-address.test.ts`
Expected: FAIL — module `../lib/geocode-address` not found.

- [ ] **Step 3: Write the implementation**

Create `packages/ai/src/tools/lib/geocode-address.ts`:

```typescript
/**
 * Geocode an address to lat/lng coordinates using Google Places API.
 * Returns null on any failure (no match, API error, missing location).
 */
import { textSearchPlace, getPlaceDetails } from './google-places';

export interface GeocodeResult {
  readonly latitude: number;
  readonly longitude: number;
}

export async function geocodeAddress(
  address: string,
  apiKey: string,
): Promise<GeocodeResult | null> {
  try {
    // Step 1: Find the place ID from the address text
    const placeId = await textSearchPlace(address, apiKey);
    if (!placeId) {
      return null;
    }

    // Step 2: Get location coordinates from the place ID
    const details = await getPlaceDetails(placeId, apiKey, 'location');
    if (!details.location) {
      return null;
    }

    return {
      latitude: details.location.latitude,
      longitude: details.location.longitude,
    };
  } catch {
    // Graceful degradation: geocoding failure should not block listing creation
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ai && pnpm vitest run src/tools/__tests__/geocode-address.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/tools/lib/geocode-address.ts packages/ai/src/tools/__tests__/geocode-address.test.ts
git commit -m "feat: add geocodeAddress helper for address-to-coordinates"
```

---

### Task 5: Agent Run Logger

**Files:**
- Create: `packages/ai/src/tools/lib/agent-run-logger.ts`
- Create: `packages/ai/src/tools/__tests__/agent-run-logger.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/ai/src/tools/__tests__/agent-run-logger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeArgs, extractResultSummary } from '../lib/agent-run-logger';

describe('sanitizeArgs', () => {
  it('strips PII fields from create_sublease args', () => {
    const args = {
      address: '123 Langdon St, Madison, WI',
      contact_email: 'jane@wisc.edu',
      rent_monthly: 900,
      bedrooms_total: 3,
      bedrooms_available: 1,
      description: 'Great place near campus',
      confirmed: false,
    };

    const sanitized = sanitizeArgs('create_sublease', args);

    expect(sanitized).not.toHaveProperty('contact_email');
    expect(sanitized).not.toHaveProperty('description');
    expect(sanitized).toHaveProperty('rent_monthly', 900);
    expect(sanitized).toHaveProperty('bedrooms_total', 3);
    expect(sanitized).toHaveProperty('confirmed', false);
  });

  it('strips PII fields from schedule_tour args', () => {
    const args = {
      listing_id: 'uuid-123',
      student_name: 'Jane',
      student_email: 'jane@wisc.edu',
      preferred_dates: ['2026-04-01'],
      notes: 'Morning preferred',
    };

    const sanitized = sanitizeArgs('schedule_tour', args);

    expect(sanitized).not.toHaveProperty('student_name');
    expect(sanitized).not.toHaveProperty('student_email');
    expect(sanitized).not.toHaveProperty('notes');
    expect(sanitized).toHaveProperty('listing_id', 'uuid-123');
    expect(sanitized).toHaveProperty('preferred_dates_count', 1);
  });

  it('strips message from contact_pm args', () => {
    const args = { listing_id: 'uuid-123', message: 'Hey, is this available?' };
    const sanitized = sanitizeArgs('contact_pm', args);

    expect(sanitized).not.toHaveProperty('message');
    expect(sanitized).toHaveProperty('listing_id');
  });

  it('passes through structural args for unknown tools', () => {
    const args = { listing_id: 'uuid-123', sort: 'price_asc', limit: 5 };
    const sanitized = sanitizeArgs('search_listings', args);

    expect(sanitized).toEqual(args);
  });
});

describe('extractResultSummary', () => {
  it('extracts result_count from clientBlock listing_card', () => {
    const result = {
      modelContext: 'Found 3 listings',
      clientBlock: { type: 'listing_card' as const, listings: [{}, {}, {}] },
    };

    const summary = extractResultSummary('search_listings', result);

    expect(summary).toHaveProperty('result_count', 3);
  });

  it('returns empty object for text blocks', () => {
    const result = {
      modelContext: 'Some context',
      clientBlock: { type: 'text' as const, content: 'Hello' },
    };

    const summary = extractResultSummary('explain_lease_term', result);

    expect(summary).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ai && pnpm vitest run src/tools/__tests__/agent-run-logger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/ai/src/tools/lib/agent-run-logger.ts`:

```typescript
/**
 * Centralized agent run logging for CribAI tools.
 * Fire-and-forget — logging failures never break tool calls.
 */
import { createClient } from '@supabase/supabase-js';
import type { ToolResult } from '../types';

// PII fields to strip per tool
const PII_FIELDS: Record<string, readonly string[]> = {
  create_sublease: ['contact_email', 'description', 'roommate_info', 'gender_restriction'],
  schedule_tour: ['student_name', 'student_email', 'notes'],
  contact_pm: ['message'],
  web_search: ['query'],
};

/**
 * Remove PII/free-text fields from tool args.
 * Returns a new object with only structural, non-identifying fields.
 */
export function sanitizeArgs(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const fieldsToStrip = PII_FIELDS[toolName];
  if (!fieldsToStrip) {
    return { ...args };
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (fieldsToStrip.includes(key)) {
      continue;
    }
    sanitized[key] = value;
  }

  // Add count-based summaries for stripped array fields
  if (toolName === 'schedule_tour' && Array.isArray(args.preferred_dates)) {
    sanitized.preferred_dates_count = args.preferred_dates.length;
  }

  return sanitized;
}

/**
 * Extract key metrics from a tool result for the result_summary column.
 */
export function extractResultSummary(
  toolName: string,
  result: ToolResult,
): Record<string, unknown> {
  const block = result.clientBlock;

  // Listing card results: count the listings
  if (block.type === 'listing_card' && 'listings' in block) {
    return { result_count: (block.listings as unknown[]).length };
  }

  // Tour confirmation: extract tour ID
  if (block.type === 'tour_confirmation' && 'tourRequestId' in block) {
    return { tour_id: block.tourRequestId };
  }

  return {};
}

export interface AgentRunParams {
  readonly userId?: string;
  readonly campusId: string;
  readonly conversationId?: string;
  readonly toolName: string;
  readonly phase?: number;
  readonly argsSummary: Record<string, unknown>;
  readonly resultStatus: 'success' | 'error' | 'timeout';
  readonly resultSummary?: Record<string, unknown>;
  readonly errorMessage?: string;
  readonly durationMs: number;
}

/**
 * Log a tool invocation to the agent_runs table.
 * Fire-and-forget: never awaited by the caller, never throws.
 */
export function logAgentRun(params: AgentRunParams): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  // Silently skip if env vars missing (e.g., in tests without setup)
  if (!supabaseUrl || !secretKey) {
    return;
  }

  const client = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fire-and-forget: intentionally not awaited
  client
    .from('agent_runs')
    .insert({
      user_id: params.userId ?? null,
      campus_id: params.campusId,
      conversation_id: params.conversationId ?? null,
      tool_name: params.toolName,
      phase: params.phase ?? null,
      args_summary: params.argsSummary,
      result_status: params.resultStatus,
      result_summary: params.resultSummary ?? {},
      error_message: params.errorMessage ?? null,
      duration_ms: params.durationMs,
    })
    .then(({ error }) => {
      if (error) {
        console.error('[agent-run-logger] Failed to log:', error.message);
      }
    })
    .catch((err: unknown) => {
      console.error('[agent-run-logger] Unexpected error:', err);
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ai && pnpm vitest run src/tools/__tests__/agent-run-logger.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/tools/lib/agent-run-logger.ts packages/ai/src/tools/__tests__/agent-run-logger.test.ts
git commit -m "feat: add agent run logger with PII sanitization"
```

---

### Task 6: Wire Agent Run Logging into Executor

**Note:** `conversationId` is not available in `ToolContext` today. The `conversation_id` column in `agent_runs` will be null for now. Threading it requires changes to the chat route and CribAI class — deferred as a follow-up.

**Files:**
- Modify: `packages/ai/src/tools/executor.ts`
- Modify: `packages/ai/src/tools/__tests__/executor.test.ts`

- [ ] **Step 1: Update executor.test.ts with logging tests**

Add to `packages/ai/src/tools/__tests__/executor.test.ts`:

```typescript
// Add to existing imports/describe block:
import { logAgentRun, sanitizeArgs, extractResultSummary } from '../lib/agent-run-logger';

vi.mock('../lib/agent-run-logger', () => ({
  logAgentRun: vi.fn(),
  sanitizeArgs: vi.fn((_, args) => args),
  extractResultSummary: vi.fn(() => ({})),
}));

// Add test cases:
it('logs successful tool execution to agent_runs', async () => {
  // (use existing mock setup for a successful tool call)
  // After executeTool returns, verify logAgentRun was called:
  expect(logAgentRun).toHaveBeenCalledWith(
    expect.objectContaining({
      toolName: expect.any(String),
      resultStatus: 'success',
      durationMs: expect.any(Number),
    }),
  );
});

it('logs failed tool execution to agent_runs', async () => {
  // (use existing mock setup for a failing tool call)
  // After executeTool throws, verify logAgentRun was called with 'error':
  expect(logAgentRun).toHaveBeenCalledWith(
    expect.objectContaining({
      resultStatus: 'error',
      errorMessage: expect.any(String),
    }),
  );
});
```

- [ ] **Step 2: Run tests to verify the new tests fail**

Run: `cd packages/ai && pnpm vitest run src/tools/__tests__/executor.test.ts`
Expected: New tests FAIL — logAgentRun not called yet.

- [ ] **Step 3: Update executor.ts to wrap handler calls with logging**

Replace `packages/ai/src/tools/executor.ts` with:

```typescript
import type { ToolContext, ToolResult, ToolName } from './types';
import { logAgentRun, sanitizeArgs, extractResultSummary } from './lib/agent-run-logger';
import { searchListings } from './handlers/search-listings';
import { getListingDetail } from './handlers/get-listing-detail';
import { compareListings } from './handlers/compare-listings';
import { scheduleTour } from './handlers/schedule-tour';
import { explainLeaseTerm } from './handlers/explain-lease-term';
import { getLandlordInfo } from './handlers/get-landlord-info';
import { getSavedListings } from './handlers/get-saved-listings';
import { webSearch } from './handlers/web-search';
import { getReviews } from './handlers/get-reviews';
import { contactPm } from './handlers/contact-pm';
import { getNeighborhoodInfo } from './handlers/get-neighborhood-info';

const HANDLERS: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  search_listings: searchListings,
  get_listing_detail: getListingDetail,
  compare_listings: compareListings,
  schedule_tour: scheduleTour,
  explain_lease_term: explainLeaseTerm,
  get_landlord_info: getLandlordInfo,
  get_saved_listings: getSavedListings,
  web_search: webSearch,
  get_reviews: getReviews,
  contact_pm: contactPm,
  get_neighborhood_info: getNeighborhoodInfo,
};

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  if (
    context.allowedToolNames &&
    !context.allowedToolNames.includes(name as ToolName)
  ) {
    throw new Error('This action requires signing in.');
  }

  const handler = HANDLERS[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const startMs = Date.now();

  try {
    const result = await handler(args, context);

    // Fire-and-forget: log successful tool run
    logAgentRun({
      userId: context.userId,
      campusId: context.campusId,
      toolName: name,
      argsSummary: sanitizeArgs(name, args),
      resultStatus: 'success',
      resultSummary: extractResultSummary(name, result),
      durationMs: Date.now() - startMs,
    });

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    // Fire-and-forget: log failed tool run
    logAgentRun({
      userId: context.userId,
      campusId: context.campusId,
      toolName: name,
      argsSummary: sanitizeArgs(name, args),
      resultStatus: 'error',
      errorMessage,
      durationMs: Date.now() - startMs,
    });

    throw err;
  }
}
```

- [ ] **Step 4: Run all executor tests to verify they pass**

Run: `cd packages/ai && pnpm vitest run src/tools/__tests__/executor.test.ts`
Expected: All tests PASS (existing + new).

- [ ] **Step 5: Run full build**

Run: `pnpm run build`
Expected: All packages compile.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/tools/executor.ts packages/ai/src/tools/__tests__/executor.test.ts
git commit -m "feat: wrap tool executor with agent run logging"
```

---

### Task 7: Register `create_sublease` in Type System and Schemas

**Files:**
- Modify: `packages/ai/src/tools/types.ts:4-15`
- Modify: `packages/ai/src/tools/schemas.ts`
- Modify: `packages/ai/src/cribai.ts:35-58` and `:75-98`

- [ ] **Step 1: Add to ToolName union**

In `packages/ai/src/tools/types.ts`, add `'create_sublease'` to the union:

```typescript
export type ToolName =
  | 'search_listings'
  | 'get_listing_detail'
  | 'compare_listings'
  | 'schedule_tour'
  | 'explain_lease_term'
  | 'get_landlord_info'
  | 'get_saved_listings'
  | 'web_search'
  | 'get_reviews'
  | 'contact_pm'
  | 'get_neighborhood_info'
  | 'create_sublease';
```

- [ ] **Step 2: Add FunctionDeclaration to schemas.ts**

Append before the `CRIBAI_TOOLS_BY_NAME` export in `packages/ai/src/tools/schemas.ts`:

```typescript
const createSublease: FunctionDeclaration = {
  name: 'create_sublease',
  description:
    'Create a sublease listing on CampusNest. This is a two-phase tool:\n' +
    'Phase 1 (confirmed=false): Validates extracted fields and returns a formatted preview for the user to review.\n' +
    'Phase 2 (confirmed=true): Publishes the listing after user confirms. You MUST re-send ALL fields, not just confirmed=true.\n\n' +
    'Before calling this tool, collect the required fields from conversation:\n' +
    '- address (required)\n' +
    '- bedrooms_total + bedrooms_available (required)\n' +
    'For optional fields, ask naturally: rent ("Would you like to put a price?"), dates, unit number.\n' +
    'If the user does not provide contact_email, their account email will be used.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      address: {
        type: Type.STRING,
        description: 'Full address of the property (e.g., "Randall Station, 1-2 W Dayton St, Madison WI")',
      },
      bedrooms_total: {
        type: Type.INTEGER,
        description: 'Total bedrooms in the unit (0 for studio)',
      },
      bedrooms_available: {
        type: Type.INTEGER,
        description: 'Number of bedrooms being subleased',
      },
      contact_email: {
        type: Type.STRING,
        description: 'Contact email for inquiries. Omit to use the user\'s account email.',
      },
      rent_monthly: {
        type: Type.NUMBER,
        description: 'Monthly rent in dollars. Omit if rent is negotiable.',
      },
      bathrooms: {
        type: Type.NUMBER,
        description: 'Number of bathrooms',
      },
      available_from: {
        type: Type.STRING,
        description: 'Sublease start date in YYYY-MM-DD format',
      },
      available_to: {
        type: Type.STRING,
        description: 'Lease end date in YYYY-MM-DD format',
      },
      description: {
        type: Type.STRING,
        description: 'Description of the sublease — preserve details from conversation (amenities, roommates, vibe, included utilities)',
      },
      amenities: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of amenities (e.g., "furnished", "parking", "laundry", "AC", "heat included")',
      },
      unit_number: {
        type: Type.STRING,
        description: 'Unit number (only if user volunteers this information)',
      },
      furnished: {
        type: Type.BOOLEAN,
        description: 'Whether the unit is furnished',
      },
      parking: {
        type: Type.BOOLEAN,
        description: 'Whether parking is included',
      },
      property_type: {
        type: Type.STRING,
        description: 'Property type: "apartment", "house", or "room"',
      },
      gender_restriction: {
        type: Type.STRING,
        description: 'Gender restriction if any (e.g., "girls only", "any")',
      },
      roommate_info: {
        type: Type.STRING,
        description: 'Info about current roommates (e.g., "two senior girls")',
      },
      confirmed: {
        type: Type.BOOLEAN,
        description: 'false = preview mode (validate and show summary), true = publish the listing. Always include ALL fields when confirming.',
      },
    },
    required: ['address', 'bedrooms_total', 'bedrooms_available'],
  },
};
```

Add to `CRIBAI_TOOLS_BY_NAME`:
```typescript
create_sublease: createSublease,
```

- [ ] **Step 3: Add to TOOL_SUMMARIES and update system prompt in cribai.ts**

In `packages/ai/src/cribai.ts`, add to `TOOL_SUMMARIES`:

```typescript
create_sublease:
  'create_sublease — post a sublease listing through conversation (two-phase: preview then publish)',
```

Replace line 80:
```typescript
- Students can post subleases at /post using the PostWizard form — ALWAYS direct users there when they ask about posting or subletting their place
```
with:
```typescript
- Students can post subleases through this chat (use the create_sublease tool) or via the PostWizard form at /post. Prefer the conversational flow — collect fields naturally, confirm with the user, then publish.
```

- [ ] **Step 4: Build to verify (will fail until handler exists — that's expected)**

Run: `cd packages/ai && pnpm run build`
Expected: May fail on missing handler import in executor. That's OK — we'll add it in Task 8.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/tools/types.ts packages/ai/src/tools/schemas.ts packages/ai/src/cribai.ts
git commit -m "feat: register create_sublease in tool type system, schemas, and system prompt"
```

---

### Task 8: Create Sublease Tool Handler

**Files:**
- Create: `packages/ai/src/tools/handlers/create-sublease.ts`
- Create: `packages/ai/src/tools/__tests__/create-sublease.test.ts`
- Modify: `packages/ai/src/tools/executor.ts:1-26` (add import + handler entry)

- [ ] **Step 1: Write the failing tests**

Create `packages/ai/src/tools/__tests__/create-sublease.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSublease } from '../handlers/create-sublease';
import { createMockContext, createMockQueryBuilder } from './helpers';

// Mock geocoding
vi.mock('../lib/geocode-address', () => ({
  geocodeAddress: vi.fn(),
}));

import { geocodeAddress } from '../lib/geocode-address';
const mockGeocode = vi.mocked(geocodeAddress);

describe('createSublease', () => {
  const validArgs = {
    address: 'Randall Station, 1-2 W Dayton St, Madison WI',
    bedrooms_total: 3,
    bedrooms_available: 1,
    rent_monthly: 900,
    bathrooms: 1,
    available_from: '2026-01-15',
    available_to: '2026-05-15',
    description: 'Furnished room near campus. Heat included.',
    amenities: ['furnished', 'heat included', 'laundry'],
    confirmed: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGeocode.mockResolvedValue({ latitude: 43.0731, longitude: -89.4012 });
  });

  // --- Auth ---

  it('throws when userId is not present', async () => {
    const context = createMockContext({ userId: undefined });

    await expect(createSublease(validArgs, context)).rejects.toThrow(
      'This action requires signing in.',
    );
  });

  // --- Phase 1: Preview ---

  it('returns preview summary on Phase 1 (confirmed=false)', async () => {
    const context = createMockContext();

    const result = await createSublease(validArgs, context);

    expect(result.clientBlock.type).toBe('text');
    expect(result.modelContext).toContain('PREVIEW');
    expect(result.modelContext).toContain('Randall Station');
    expect(result.modelContext).toContain('$900');
    expect(result.modelContext).toContain('3 bed (1 available)');
  });

  it('shows "Negotiable" for missing rent in Phase 1', async () => {
    const context = createMockContext();
    const argsNoRent = { ...validArgs, rent_monthly: undefined };

    const result = await createSublease(argsNoRent, context);

    expect(result.modelContext).toContain('Negotiable');
  });

  it('includes geocode warning when geocoding fails in Phase 1', async () => {
    mockGeocode.mockResolvedValue(null);
    const context = createMockContext();

    const result = await createSublease(validArgs, context);

    expect(result.modelContext).toContain('could not verify the exact location');
  });

  // --- Phase 2: Publish ---

  it('inserts listing on Phase 2 (confirmed=true)', async () => {
    const insertBuilder = createMockQueryBuilder({
      id: 'new-listing-id',
      address: validArgs.address,
    });

    // Auth user email lookup
    const authBuilder = {
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { email: 'jane@wisc.edu' } },
            error: null,
          }),
        },
      },
    };

    const context = createMockContext();
    // Mock service client creation
    vi.mocked(context.supabase.from).mockReturnValue(insertBuilder as never);

    const publishArgs = { ...validArgs, confirmed: true };
    const result = await createSublease(publishArgs, context);

    expect(result.modelContext).toContain('published');
  });

  it('fails Phase 2 with duplicate external_id', async () => {
    const insertBuilder = createMockQueryBuilder(
      null,
      { code: '23505', message: 'duplicate' },
    );

    const context = createMockContext();
    vi.mocked(context.supabase.from).mockReturnValue(insertBuilder as never);

    const publishArgs = { ...validArgs, confirmed: true };
    await expect(createSublease(publishArgs, context)).rejects.toThrow();
  });

  // --- Validation ---

  it('throws on missing required fields', async () => {
    const context = createMockContext();
    const badArgs = { address: 'Some Place' };

    await expect(createSublease(badArgs, context)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ai && pnpm vitest run src/tools/__tests__/create-sublease.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the handler implementation**

Create `packages/ai/src/tools/handlers/create-sublease.ts`:

```typescript
/**
 * create_sublease — Two-phase HITL tool for posting subleases via CribAI chat.
 *
 * Phase 1 (confirmed=false): Validates fields, geocodes address, returns preview.
 * Phase 2 (confirmed=true): Inserts listing via service-role client.
 */
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import type { ToolContext, ToolResult } from '../types';
import { geocodeAddress } from '../lib/geocode-address';

// --- Input validation schema ---
const inputSchema = z.object({
  address: z.string().min(5).max(200),
  bedrooms_total: z.number().int().min(0).max(10),
  bedrooms_available: z.number().int().min(1).max(10),
  contact_email: z.string().email().optional(),
  rent_monthly: z.number().positive().max(10000).optional().nullable(),
  bathrooms: z.number().min(0).max(10).optional(),
  available_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  available_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().max(2000).optional(),
  amenities: z.array(z.string()).default([]),
  unit_number: z.string().max(20).optional(),
  furnished: z.boolean().optional(),
  parking: z.boolean().optional(),
  property_type: z.enum(['apartment', 'house', 'room']).optional(),
  gender_restriction: z.string().max(50).optional(),
  roommate_info: z.string().max(200).optional(),
  confirmed: z.boolean().default(false),
});

// --- Formatting helpers ---

function formatPreviewSummary(
  parsed: z.infer<typeof inputSchema>,
  geocodeSuccess: boolean,
): string {
  const lines = [
    '--- SUBLEASE LISTING PREVIEW ---',
    '',
    `Address: ${parsed.address}`,
    `Rent: ${parsed.rent_monthly ? `$${parsed.rent_monthly}/mo` : 'Negotiable'}`,
    `Bedrooms: ${parsed.bedrooms_total} bed (${parsed.bedrooms_available} available)`,
  ];

  if (parsed.bathrooms !== undefined) {
    lines.push(`Bathrooms: ${parsed.bathrooms}`);
  }
  if (parsed.available_from || parsed.available_to) {
    const from = parsed.available_from ?? 'TBD';
    const to = parsed.available_to ?? 'TBD';
    lines.push(`Dates: ${from} to ${to}`);
  }
  if (parsed.property_type) {
    lines.push(`Type: ${parsed.property_type}`);
  }
  if (parsed.furnished !== undefined) {
    lines.push(`Furnished: ${parsed.furnished ? 'Yes' : 'No'}`);
  }
  if (parsed.parking !== undefined) {
    lines.push(`Parking: ${parsed.parking ? 'Included' : 'Not included'}`);
  }
  if (parsed.amenities.length > 0) {
    lines.push(`Amenities: ${parsed.amenities.join(', ')}`);
  }
  if (parsed.gender_restriction) {
    lines.push(`Restriction: ${parsed.gender_restriction}`);
  }
  if (parsed.roommate_info) {
    lines.push(`Roommates: ${parsed.roommate_info}`);
  }
  if (parsed.unit_number) {
    lines.push(`Unit: ${parsed.unit_number}`);
  }
  if (parsed.description) {
    lines.push('', `Description: ${parsed.description}`);
  }
  if (parsed.contact_email) {
    lines.push(`Contact: ${parsed.contact_email}`);
  } else {
    lines.push('Contact: (your account email will be used)');
  }

  lines.push('');
  if (!geocodeSuccess) {
    lines.push('Note: I could not verify the exact location on the map. The listing will still be published but may not appear on map searches.');
  }

  return lines.join('\n');
}

// --- Analytics helper (fire-and-forget) ---

function fireAnalyticsEvent(
  eventName: string,
  payload: Record<string, unknown>,
): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) return;

  const client = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  client
    .from('analytics_events')
    .insert({ event_name: eventName, properties: payload })
    .then(({ error }) => {
      if (error) console.error('[create-sublease] analytics error:', error.message);
    })
    .catch(() => {});
}

// --- Phase 1: Preview ---

async function handlePreview(
  parsed: z.infer<typeof inputSchema>,
  context: ToolContext,
): Promise<ToolResult> {
  // Geocode the address
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  let geocodeSuccess = false;

  if (apiKey) {
    const coords = await geocodeAddress(parsed.address, apiKey);
    geocodeSuccess = coords !== null;
  }

  const summary = formatPreviewSummary(parsed, geocodeSuccess);

  // Fire analytics event: sublease draft created
  const fieldsPresent = Object.entries(parsed).filter(([, v]) => v !== undefined && v !== null);
  fireAnalyticsEvent('sublease_draft_created', {
    user_id: context.userId,
    fields_extracted_count: fieldsPresent.length,
    geocode_success: geocodeSuccess,
  });

  const modelContext = [
    summary,
    '',
    'INSTRUCTIONS: Present this preview to the user and ask "Does this look right? Any changes before I publish it?"',
    'If they confirm, call create_sublease again with ALL the same fields plus confirmed=true.',
    'If they want changes, update the fields and call create_sublease again with confirmed=false.',
  ].join('\n');

  return {
    modelContext,
    clientBlock: {
      type: 'text' as const,
      content: summary,
    },
  };
}

// --- Phase 2: Publish ---

async function handlePublish(
  parsed: z.infer<typeof inputSchema>,
  context: ToolContext,
): Promise<ToolResult> {
  // Create service-role client for insert (bypasses RLS)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error('Server configuration error. Please try again later.');
  }

  const serviceClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve contact email: provided > user's auth email > null
  let contactEmail = parsed.contact_email ?? null;
  if (!contactEmail && context.userId) {
    const { data: authData } = await serviceClient.auth.admin.getUserById(
      context.userId,
    );
    contactEmail = authData?.user?.email ?? null;
  }

  // Geocode the address
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  let locationSql: string | null = null;
  if (apiKey) {
    const coords = await geocodeAddress(parsed.address, apiKey);
    if (coords) {
      // PostGIS point: ST_MakePoint(longitude, latitude)
      locationSql = `SRID=4326;POINT(${coords.longitude} ${coords.latitude})`;
    }
  }

  const externalId = `sublease-${context.userId}-${Date.now()}`;

  const insertData: Record<string, unknown> = {
    campus_id: context.campusId,
    address: parsed.address,
    rent_monthly: parsed.rent_monthly ?? null,
    bedrooms: parsed.bedrooms_total,
    bathrooms: parsed.bathrooms ?? null,
    amenities: parsed.amenities,
    available_date: parsed.available_from ?? null,
    description: parsed.description ?? null,
    contact_email: contactEmail,
    source: 'sublease',
    external_id: externalId,
    creator_id: context.userId,
    is_active: true,
    last_embedded_at: null,
    photo_urls: [],
    raw_data: {
      submitted_by: context.userId,
      is_sublease: true,
      bedrooms_available: parsed.bedrooms_available,
      lease_end: parsed.available_to ?? null,
      furnished: parsed.furnished ?? null,
      parking: parsed.parking ?? null,
      property_type: parsed.property_type ?? null,
      unit_number: parsed.unit_number ?? null,
      gender_restriction: parsed.gender_restriction ?? null,
      roommate_info: parsed.roommate_info ?? null,
    },
  };

  // Add location if geocoded
  if (locationSql) {
    insertData.location = locationSql;
  }

  const { data: listing, error: insertError } = await serviceClient
    .from('listings')
    .insert(insertData)
    .select('id, address')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      throw new Error(
        'A listing with this information already exists. Please wait a moment and try again.',
      );
    }
    console.error('[create-sublease] Insert error:', insertError);
    throw new Error('Failed to publish your sublease. Please try again.');
  }

  const listingId = listing.id as string;
  const listingAddress = listing.address as string;

  // Fire analytics event: sublease published
  fireAnalyticsEvent('sublease_published', {
    user_id: context.userId,
    listing_id: listingId,
  });

  const modelContext = [
    `Sublease published successfully!`,
    `Listing ID: ${listingId}`,
    `Address: ${listingAddress}`,
    `View it at: /listing/${listingId}`,
    '',
    'Tell the user their sublease is now live on CampusNest and share the link.',
  ].join('\n');

  return {
    modelContext,
    clientBlock: {
      type: 'text' as const,
      content: [
        '**Your sublease is live on CampusNest!**',
        '',
        `**${listingAddress}**`,
        parsed.rent_monthly ? `$${parsed.rent_monthly}/mo` : 'Rent: Negotiable',
        `${parsed.bedrooms_total} bed (${parsed.bedrooms_available} available)`,
        '',
        `[View your listing](/listing/${listingId})`,
      ].join('\n'),
    },
  };
}

// --- Main handler ---

export async function createSublease(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  // Auth guard — must be signed in
  if (!context.userId) {
    throw new Error('This action requires signing in.');
  }

  const parsed = inputSchema.parse(args);

  if (parsed.confirmed) {
    return handlePublish(parsed, context);
  }

  return handlePreview(parsed, context);
}
```

- [ ] **Step 4: Register in executor.ts**

Add to the imports in `packages/ai/src/tools/executor.ts`:

```typescript
import { createSublease } from './handlers/create-sublease';
```

Add to the `HANDLERS` map:

```typescript
create_sublease: createSublease,
```

- [ ] **Step 5: Run create-sublease tests**

Run: `cd packages/ai && pnpm vitest run src/tools/__tests__/create-sublease.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Run full test suite**

Run: `cd packages/ai && pnpm run test`
Expected: All existing tests still pass.

- [ ] **Step 7: Run full build**

Run: `pnpm run build`
Expected: All packages compile with zero errors.

- [ ] **Step 8: Commit**

```bash
git add packages/ai/src/tools/handlers/create-sublease.ts packages/ai/src/tools/__tests__/create-sublease.test.ts packages/ai/src/tools/executor.ts
git commit -m "feat: add create_sublease two-phase HITL tool handler"
```

---

### Task 9: Exclude from Guest Tools in CribAI Route

**Files:**
- Modify: `apps/web/app/api/ai/cribai/route.ts:57-69`

- [ ] **Step 1: Verify GUEST_ALLOWED_TOOLS does NOT include create_sublease**

Read `apps/web/app/api/ai/cribai/route.ts` around lines 57-69. The `GuestToolName` type and `GUEST_ALLOWED_TOOLS` array should NOT include `create_sublease`. Since we only added it to the `ToolName` union (not the guest subset), it should already be excluded. Verify this is the case — no code change needed if the guest list is a manually maintained subset.

If `GUEST_ALLOWED_TOOLS` is derived from `ToolName` (it shouldn't be), then explicitly exclude `create_sublease`.

- [ ] **Step 2: Run full build to verify**

Run: `pnpm run build`
Expected: Compiles. No type errors from the route file.

- [ ] **Step 3: Commit (only if changes were needed)**

```bash
git add apps/web/app/api/ai/cribai/route.ts
git commit -m "chore: verify create_sublease excluded from guest tools"
```

---

### Task 10: Full Verification

- [ ] **Step 1: Run all tests**

Run: `cd packages/ai && pnpm run test`
Expected: All tests pass, including new ones for geocode-address, agent-run-logger, create-sublease, and executor.

- [ ] **Step 2: Run full build**

Run: `pnpm run build`
Expected: Zero errors across all packages.

- [ ] **Step 3: Verify branch is clean**

Run: `git status && git log --oneline -10`
Expected: Clean working tree. Commits in order:
1. `feat: add agent_runs table for tool observability (migration 023)`
2. `feat: make rent_monthly nullable for negotiable subleases`
3. `feat: add location field to PlaceDetailsResult for geocoding`
4. `feat: add geocodeAddress helper for address-to-coordinates`
5. `feat: add agent run logger with PII sanitization`
6. `feat: wrap tool executor with agent run logging`
7. `feat: register create_sublease in tool type system, schemas, and system prompt`
8. `feat: add create_sublease two-phase HITL tool handler`

- [ ] **Step 4: Run code reviewer agent**

Dispatch `code-reviewer` agent on the full diff vs `main`.
Expected: No CRITICAL or HIGH issues.
