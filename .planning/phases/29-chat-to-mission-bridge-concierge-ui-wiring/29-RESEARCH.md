# Phase 29: Chat-to-Mission Bridge + Concierge UI Wiring — Research

**Researched:** 2026-03-12
**Domain:** Intent detection (Gemini classify), Supabase Realtime channels, React context migration, Next.js after(), HITL wiring
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| V2-BRIDGE-01 | CribAI detects housing search intent with confidence > 0.75 and proposes mission in chat | Intent classifier using Gemini `generateContent` with JSON response (no tools); confidence threshold gate |
| V2-BRIDGE-02 | Student confirms in chat → POST /api/missions → executor fires via after() | ChatProvider intercepts `confirm_mission` SSE event type; calls POST /api/missions; API route fires executor via after() |
| V2-BRIDGE-03 | SteeringBar wired to POST /api/missions/[id]/steer | SteeringBar must receive missionId prop from ConciergeContext; POST to /api/missions/[id]/steer |
| V2-CONCIERGE-01 | Concierge sidebar shows real missions from DB (no mock-missions.ts) | ConciergeProvider refactored to fetch from GET /api/missions on mount; LegacyMission replaced with DB Mission type |
| V2-CONCIERGE-02 | Mission status, logs, and drafts update live via Supabase Realtime without page refresh | supabase-js v2 channel per user watching missions+mission_logs+mission_drafts tables; postgres_changes filter |
</phase_requirements>

---

## Summary

Phase 29 is the integration capstone for v2.0. It has two orthogonal workstreams that must land together:

**Workstream A — Chat-to-Mission Bridge:** The existing CribAI chat loop must gain a pre-response intent classify step. Before streaming a normal reply, the route calls Gemini with `generateContent` (no tools, JSON response) to classify the user's message into `housing_search | tour_outreach | lease_analysis | general_chat` with a confidence score. When confidence > 0.75 and the intent is actionable, the SSE stream emits a new `mission_proposal` event type. The frontend handles this by rendering a confirmation card inside the chat message. When the user confirms, `sendMessage` in `ChatProvider` calls `POST /api/missions`, which fires the executor via `after()` and emits a `mission_created` SSE event. `ChatProvider` then needs to forward the new mission ID to `ConciergeProvider.addMission()`. The two providers must be wired together, or a new bridge hook must be added.

**Workstream B — Concierge UI Live Wiring:** `ConciergeProvider` currently initialises from `mockMissions`. This must be replaced with: (1) a fetch from `GET /api/missions` on mount, and (2) a Supabase Realtime subscription on channel `missions:${userId}` watching `missions`, `mission_logs`, and `mission_drafts` tables via `postgres_changes`. The `Mission` DB type (snake_case) replaces `LegacyMission` throughout all Concierge components. `MissionDetail` must pass `missionId` to `SteeringBar`, and `MissionActionCard` `DraftReadyCard` must call the real draft approve/reject API routes. The API routes themselves (Phases 26-28 prerequisite) are expected to exist by the time Phase 29 executes.

**Primary recommendation:** Implement intent classification as a standalone `classifyIntent()` utility in `packages/ai/src/intent-classifier.ts` (pure Gemini call, no tools, JSON output), wire it into the `/api/ai/cribai` route before the main chat loop, and emit `mission_proposal` as a new `ChatEvent` type. Handle the full Realtime subscription lifecycle in a custom `useMissionsRealtime` hook that ConciergeProvider calls.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @google/genai | ^1.43.0 | Gemini classify call — `generateContent` (non-streaming) with JSON responseConfig | Already in packages/ai; same client used throughout codebase |
| @supabase/supabase-js | ^2.47.0 | Realtime channel subscription, postgres_changes filter | Already in project; v2 Realtime stable |
| next | ^15.1.0 | `after()` for background executor dispatch | Already in use; `after()` decision locked in STATE.md |
| vitest | ^2.1.0 | Unit tests for classifier, hooks, API routes | Already configured |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | Already in packages/types | Validate Gemini JSON classify response before use | Whenever parsing AI output at system boundary |
| @supabase/ssr | ^0.5.0 | Server-side Supabase client for API routes | Already used in all API routes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Gemini classify (separate call) | Parse user intent inside main chat loop | Separate call is cleaner and testable; avoids entangling intent detection with response generation |
| postgres_changes Realtime | Polling GET /api/missions every N seconds | Realtime is zero-latency; polling adds latency and load |
| LegacyMission-to-Mission adapter | Rewrite all concierge components | Adapter is safe and testable; full rewrite touches more files |

---

## Architecture Patterns

### Recommended Project Structure (new files this phase)

```
packages/ai/src/
├── intent-classifier.ts         # NEW: classifyIntent() — pure Gemini call
├── intent-classifier.test.ts    # NEW: unit tests

apps/web/
├── app/api/missions/            # Built in Phase 26 — routes consumed here
├── components/chat/
│   └── ChatProvider.tsx         # MODIFY: handle mission_proposal SSE event, call POST /api/missions
├── components/concierge/
│   ├── ConciergeProvider.tsx    # MODIFY: fetch real missions, subscribe Realtime
│   ├── MissionDetail.tsx        # MODIFY: pass missionId to SteeringBar
│   ├── SteeringBar.tsx          # MODIFY: accept missionId prop, POST /steer
│   └── MissionActionCard.tsx    # MODIFY: DraftReadyCard calls approve/reject API
├── hooks/
│   └── use-missions-realtime.ts # NEW: encapsulates Realtime subscription lifecycle
└── lib/
    └── mock-missions.ts         # DELETE after migration
```

### Pattern 1: Gemini Intent Classify (Non-Streaming, JSON Response)

**What:** Call `generateContent` (not `generateContentStream`) with a `responseMimeType: 'application/json'` config. This is a distinct capability from `tools` — it forces structured JSON output without function calling.

**When to use:** Pre-response classify step in the CribAI route. The classify call completes before the main streaming call begins.

**Critical constraint from STATE.md:** Gemini cannot combine `tools` + `responseSchema` — use function calling only for the main chat loop. The classify call must NOT use `tools`.

**Example:**
```typescript
// Source: packages/ai — @google/genai v1.43.0 generateContent API
const result = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  config: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: ['housing_search', 'tour_outreach', 'lease_analysis', 'general_chat'] },
        confidence: { type: 'number' },
        extracted_fields: { type: 'object' }
      },
      required: ['intent', 'confidence', 'extracted_fields']
    }
  },
  contents: [{ role: 'user', parts: [{ text: classifyPrompt }] }]
});
const raw = result.text ?? '{}';
const parsed = IntentResultSchema.safeParse(JSON.parse(raw));
```

**Zod validation schema:**
```typescript
// Validate AI output at system boundary — never trust raw JSON from Gemini
const IntentResultSchema = z.object({
  intent: z.enum(['housing_search', 'tour_outreach', 'lease_analysis', 'general_chat']),
  confidence: z.number().min(0).max(1),
  extracted_fields: z.record(z.unknown()),
});
```

### Pattern 2: ChatEvent Extension for Mission Proposals

**What:** Add two new event types to the `ChatEvent` union in `packages/ai/src/cribai.ts`. The API route emits `mission_proposal` when classifier fires. After user confirmation, the route emits `mission_created`.

```typescript
// Extend ChatEvent union — packages/ai/src/cribai.ts
export type ChatEvent =
  | { readonly type: 'text'; readonly content: string }
  | { readonly type: 'tool_call'; readonly name: string; readonly args: Record<string, unknown> }
  | { readonly type: 'tool_result'; readonly name: string; readonly block: ChatBlock }
  | { readonly type: 'mission_proposal'; readonly intent: string; readonly confidence: number; readonly extractedFields: Record<string, unknown> }
  | { readonly type: 'mission_created'; readonly missionId: string }
  | { readonly type: 'done' };
```

**ChatProvider SSE handler extension:**
```typescript
// apps/web/components/chat/ChatProvider.tsx — in the SSE read loop
} else if (event.type === 'mission_proposal') {
  // Store pending proposal in state for confirmation UI
  setPendingProposal({ intent: event.intent, confidence: event.confidence, extractedFields: event.extractedFields });
} else if (event.type === 'mission_created') {
  // Forward to ConciergeProvider via shared callback
  onMissionCreated?.(event.missionId);
}
```

### Pattern 3: Supabase Realtime — One Channel Per User

**What:** Subscribe to a single channel watching three tables filtered by `user_id`. The decision to use one channel per user (not per mission) is locked in STATE.md due to the 200 concurrent channel limit.

**Critical:** Supabase Realtime `postgres_changes` filters work at the DB level. The filter `user_id=eq.${userId}` on the `missions` table works because `missions.user_id` exists. For `mission_logs` and `mission_drafts`, which only have `mission_id` (not `user_id`), the filter must be omitted and filtering done client-side, OR a Supabase function/view with user_id column must be used. The simplest approach: filter missions by user_id, and for logs/drafts filter by `mission_id=in.(${activeMissionIds})` — but this requires re-subscribing when missions change. The recommended simpler approach: subscribe to all three tables without user_id filter (Supabase RLS blocks non-owned rows anyway), but this is only safe if Realtime respects RLS.

**Supabase Realtime + RLS (MEDIUM confidence):** As of supabase-js v2, Realtime channels can be configured with `{config: {private: true}}` to enforce RLS on `postgres_changes`. Without this flag, Realtime does NOT enforce RLS by default — all users would receive all changes. This is a critical security concern.

```typescript
// hooks/use-missions-realtime.ts
import { useEffect } from 'react';
import { createClient } from '@campusnest/supabase/client';

export function useMissionsRealtime(userId: string | null, onMissionChange: (payload: unknown) => void) {
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`missions:${userId}`, { config: { private: true } })  // RLS enforcement
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions', filter: `user_id=eq.${userId}` }, onMissionChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_logs' }, onMissionChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_drafts' }, onMissionChange)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId, onMissionChange]);
}
```

**Warning:** The `{config: {private: true}}` JWT pattern needs SDK version verification — this was flagged as a known blocker in STATE.md. The hook must be tested against the actual Supabase project.

### Pattern 4: LegacyMission to Mission Migration

**What:** `ConciergeProvider`, `MissionCard`, `MissionDetail`, `ExecutionLogs`, `AgentSummary`, and `SteeringBar` all use `LegacyMission` (camelCase, embedded logs). The DB `Mission` type (snake_case) has separate `mission_logs` and `mission_drafts`. A view type is needed that merges them for the UI.

**Recommended approach:** Define a `MissionWithDetails` view type in `apps/web/lib/concierge-types.ts` that combines the DB types, and update all concierge components to use it. Delete `LegacyMission` after migration.

```typescript
// apps/web/lib/concierge-types.ts — NEW
import type { Mission, MissionLog, MissionDraft } from '@campusnest/types';

export interface MissionWithDetails extends Mission {
  readonly logs: readonly MissionLog[];
  readonly currentDraft: MissionDraft | null;
}
```

**Field mapping (LegacyMission → MissionWithDetails):**
| LegacyMission field | MissionWithDetails source |
|--------------------|--------------------------|
| `id` | `id` |
| `type` | `type` |
| `title` | `title` |
| `status` | `status` |
| `listingTitle` | Must be fetched via `listing_id` join or stored in `goal` |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |
| `summary` | Derived from `goal` or last log entry |
| `logs` | `logs: readonly MissionLog[]` |
| `actionCard` | Derived from `currentDraft` |

**Key insight:** `LegacyMission.listingTitle` has no direct DB equivalent. The `missions` table has `listing_id` (UUID) but no denormalized title. The `goal` field (TEXT) can serve as the mission description visible in the card subtitle. Or the API `GET /api/missions` can join listings and return a `listing_title` field. The API shape decision affects what `MissionWithDetails` looks like.

### Pattern 5: ConciergeProvider Data Fetch on Mount

**What:** Replace `useState(mockMissions)` with an async fetch from `GET /api/missions` on component mount.

```typescript
// ConciergeProvider.tsx
useEffect(() => {
  async function loadMissions() {
    const res = await fetch('/api/missions', {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    if (!res.ok) return;
    const data = await res.json() as { missions: Mission[] };
    setMissions(data.missions);
  }
  void loadMissions();
}, [userToken]);
```

**User token access:** ConciergeProvider needs access to the auth token. Options: (1) use `useSession` from Supabase browser client, (2) thread token down from a parent server component. The existing pattern in the app uses `createClient()` from `@campusnest/supabase/client` (browser client) for auth state. Use `supabase.auth.getSession()` to get the token.

### Anti-Patterns to Avoid

- **Classifying inside the main Gemini chat loop:** The main chat loop uses `tools` configuration. Adding `responseSchema` to the same call will break function calling (locked decision: Gemini cannot combine `tools` + `responseSchema`). Always use a separate preliminary `generateContent` call for classification.
- **Per-mission Realtime channels:** STATE.md explicitly forbids this due to 200 concurrent channel limit. One channel per user, regardless of how many missions are active.
- **Mutating the missions array in Realtime handler:** The Realtime `postgres_changes` payload contains `new`, `old`, and `eventType`. Always return a new array (immutable update). Use `map`, `filter`, or spread, never `push` or `splice`.
- **Firing executor synchronously in POST /api/missions:** The executor must use `after()` so the API route returns 201 immediately. A synchronous executor call would block the route and likely timeout.
- **Skipping Zod parse on Gemini JSON output:** AI output at system boundaries must always be validated. A malformed or unexpected JSON response from the classifier should degrade gracefully (treat as `general_chat` with confidence 0) rather than crash.
- **Keeping mock-missions.ts import in ConciergeProvider:** The entire point of this phase is to eliminate mock data. The file should be deleted and any remaining test fixtures that needed it should inline their own mock data.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Intent detection | Custom regex/keyword matching | Gemini `generateContent` with JSON responseSchema | Handles paraphrasing, multi-lingual, context — regex misses "looking for a place near campus" |
| Realtime subscription management | Custom WebSocket or polling | Supabase Realtime `postgres_changes` | Built-in reconnection, JWT auth, filter pushdown, already in supabase-js |
| JSON output coercion from Gemini | String parsing, regex extraction | `responseMimeType: 'application/json'` + Zod validation | Forces structured output at the SDK level; Zod catches schema drift |
| Optimistic mission list update | Complex local state machinery | Realtime INSERT event → `setMissions(prev => [newMission, ...prev])` | Realtime event arrives within milliseconds of DB write; optimistic + realtime is sufficient |

**Key insight:** The Gemini JSON mode (`responseMimeType: 'application/json'`) is the right tool here — it forces structured output without enabling function calling, which preserves the invariant that the main chat call uses function calling only.

---

## Common Pitfalls

### Pitfall 1: Gemini JSON Mode vs Tools Mode Conflict
**What goes wrong:** Developer adds `responseSchema` to the main `generateContentStream` call (which already has `tools: [{ functionDeclarations: CRIBAI_TOOLS }]`), causing Gemini to throw or return malformed output.
**Why it happens:** Confusion between the two Gemini structured-output mechanisms — `responseSchema` (forces JSON) and `tools` (function calling). They are mutually exclusive in Gemini 2.5 Flash.
**How to avoid:** The classify call must be a separate `generateContent` invocation on a new request object with NO `tools` config and with `responseMimeType: 'application/json'`. Locked decision from STATE.md.
**Warning signs:** TypeScript compiler won't catch this; Gemini will return an error or empty response at runtime.

### Pitfall 2: Realtime Channel Not Enforcing RLS
**What goes wrong:** All users receive all mission updates (data leak), because the Supabase Realtime channel was created without `{config: {private: true}}`.
**Why it happens:** Supabase Realtime `postgres_changes` does NOT enforce RLS by default as of supabase-js v2. Private channels require the `private: true` flag AND the user must have a valid JWT in the channel subscription.
**How to avoid:** Always pass `{ config: { private: true } }` when creating the channel. This requires the browser Supabase client to have an active session. Verify this works in integration testing.
**Warning signs:** In dev, all test users see each other's missions in the concierge sidebar.

### Pitfall 3: MissionCard/MissionDetail Still Using LegacyMission Fields
**What goes wrong:** After ConciergeProvider is migrated to `Mission` DB type, the render components still expect `listingTitle` (camelCase) and `logs` (embedded array) from `LegacyMission` — causing TypeScript errors or silent undefined renders.
**Why it happens:** The migration has two parts: the data layer (ConciergeProvider) and the render layer (MissionCard, MissionDetail). Doing only one half silently breaks the other.
**How to avoid:** Define `MissionWithDetails` (the enriched DB type with embedded `logs` and `currentDraft`) first, then update all consuming components in the same task before deleting `LegacyMission`.
**Warning signs:** `pnpm build` typecheck errors; components rendering empty strings for title and listing.

### Pitfall 4: useEffect Dependency Array Causing Realtime Re-subscribe Loops
**What goes wrong:** The `onMissionChange` callback is defined inline in ConciergeProvider's render function, causing `useMissionsRealtime` to unsubscribe and resubscribe on every render.
**Why it happens:** Object/function references change on every render; `useEffect` with `[onMissionChange]` dependency sees a new reference each time.
**How to avoid:** Wrap the callback with `useCallback` in ConciergeProvider. The callback should be memoized with only stable deps (`setMissions`).
**Warning signs:** Network tab shows repeated subscribe/unsubscribe WebSocket messages; mission list flickers.

### Pitfall 5: Missing User ID for Realtime Subscription
**What goes wrong:** `useMissionsRealtime` receives `null` for `userId` because the auth session hasn't loaded yet, and the subscription is never established.
**Why it happens:** `ConciergeProvider` is a client component that renders before auth hydration completes.
**How to avoid:** Gate the subscription on `userId !== null`. Use Supabase `onAuthStateChange` or `getSession()` to derive `userId`, and include it in the effect dependency array so the subscription fires after auth resolves.
**Warning signs:** Concierge sidebar loads correctly on page render but never updates when missions change.

### Pitfall 6: Classifier Called for Every Chat Message (Latency)
**What goes wrong:** The classify call adds ~200-500ms to every message, even simple questions like "What is a security deposit?".
**Why it happens:** The classifier runs unconditionally before the main chat loop.
**How to avoid:** Add a simple heuristic pre-filter: skip the classify call if the message is < 10 words OR contains no housing-related keywords (`find`, `search`, `apartment`, `tour`, `lease`, etc.). Only call the classifier when the heuristic passes. This reduces unnecessary API calls without sacrificing accuracy on real intent messages.
**Warning signs:** Users report chat feeling slow for short messages.

### Pitfall 7: Concierge Tests Break After LegacyMission Removal
**What goes wrong:** `concierge.test.tsx` uses `LegacyMission` fixtures directly; deleting the type causes import errors across all concierge tests.
**Why it happens:** The test file has 30+ fixture objects typed as `LegacyMission`. After migration, these must be updated to `MissionWithDetails` shape.
**How to avoid:** Update test fixtures in the same task as the component migration. Do not delete `LegacyMission` until all tests pass with `MissionWithDetails` fixtures.
**Warning signs:** `vitest run` fails on `concierge.test.tsx` with type import errors.

---

## Code Examples

Verified patterns from project codebase and @google/genai v1.43.0:

### Intent Classifier — Full Structure
```typescript
// packages/ai/src/intent-classifier.ts
import { z } from 'zod';
import { createGeminiClient } from './gemini-client';

const IntentResultSchema = z.object({
  intent: z.enum(['housing_search', 'tour_outreach', 'lease_analysis', 'general_chat']),
  confidence: z.number().min(0).max(1),
  extracted_fields: z.record(z.unknown()),
});

export type IntentResult = z.infer<typeof IntentResultSchema>;

const FALLBACK: IntentResult = {
  intent: 'general_chat',
  confidence: 0,
  extracted_fields: {},
};

// Simple keyword pre-filter to avoid unnecessary Gemini calls
const HOUSING_KEYWORDS = ['find', 'search', 'apartment', 'housing', 'tour', 'lease', 'rent', 'bedroom', 'studio', 'looking for'];

export function shouldClassify(message: string): boolean {
  const lower = message.toLowerCase();
  return message.split(/\s+/).length >= 5 &&
    HOUSING_KEYWORDS.some(kw => lower.includes(kw));
}

export async function classifyIntent(message: string, apiKey?: string): Promise<IntentResult> {
  if (!shouldClassify(message)) return FALLBACK;

  const ai = createGeminiClient(apiKey);
  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        responseMimeType: 'application/json',
        // NOTE: NO tools config here — responseSchema + tools are mutually exclusive
      },
      contents: [{
        role: 'user',
        parts: [{ text: buildClassifyPrompt(message) }],
      }],
    });
    const parsed = IntentResultSchema.safeParse(JSON.parse(result.text ?? '{}'));
    return parsed.success ? parsed.data : FALLBACK;
  } catch {
    return FALLBACK; // Graceful degradation — never block chat on classify failure
  }
}

function buildClassifyPrompt(message: string): string {
  return `Classify this student housing message into exactly one intent.

Message: "${message}"

Return JSON with:
- intent: one of housing_search | tour_outreach | lease_analysis | general_chat
- confidence: 0.0–1.0 (how confident you are)
- extracted_fields: relevant fields (e.g. bedrooms, budget, location)

Examples:
- "Find me a 2BR under $1,500 near campus" → housing_search, confidence ~0.95
- "Book a tour for the Maple Ridge listing" → tour_outreach, confidence ~0.90
- "What does this lease clause mean?" → lease_analysis, confidence ~0.85
- "What time does the leasing office open?" → general_chat, confidence ~0.90`;
}
```

### CribAI Route — Classifier Integration
```typescript
// apps/web/app/api/ai/cribai/route.ts — ADD to POST handler before stream creation
import { classifyIntent, shouldClassify } from '@campusnest/ai/intent-classifier';

// After building toolContext, before creating the ReadableStream:
let intentProposal: { intent: string; confidence: number; extractedFields: Record<string, unknown> } | null = null;
if (shouldClassify(query)) {
  const intent = await classifyIntent(query);
  if (intent.confidence > 0.75 && intent.intent !== 'general_chat') {
    intentProposal = { intent: intent.intent, confidence: intent.confidence, extractedFields: intent.extracted_fields };
  }
}

// Inside the ReadableStream start(), emit proposal before chat loop:
if (intentProposal) {
  controller.enqueue(encoder.encode(sseEncode({ type: 'mission_proposal', ...intentProposal })));
}
// Then continue with cribai.chat(chatArgs) as before
```

### Realtime Hook
```typescript
// apps/web/hooks/use-missions-realtime.ts
import { useEffect, useCallback } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@campusnest/supabase/client';

type ChangeHandler = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;

export function useMissionsRealtime(userId: string | null, onChange: ChangeHandler): void {
  const stableOnChange = useCallback(onChange, []); // caller must memoize

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`missions:${userId}`, { config: { private: true } })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'missions',
        filter: `user_id=eq.${userId}`,
      }, stableOnChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_logs' }, stableOnChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_drafts' }, stableOnChange)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId, stableOnChange]);
}
```

### Realtime Payload Reducer (Immutable)
```typescript
// Immutable state update in ConciergeProvider's Realtime handler
const handleRealtimeChange = useCallback((payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
  if (payload.table === 'missions') {
    if (payload.eventType === 'INSERT') {
      setMissions(prev => [payload.new as Mission, ...prev]);
    } else if (payload.eventType === 'UPDATE') {
      setMissions(prev => prev.map(m => m.id === (payload.new as Mission).id ? payload.new as Mission : m));
    } else if (payload.eventType === 'DELETE') {
      setMissions(prev => prev.filter(m => m.id !== (payload.old as Mission).id));
    }
  }
  // For mission_logs and mission_drafts: update selectedMissionDetails if matching mission_id
}, []);
```

### SteeringBar with missionId Prop
```typescript
// apps/web/components/concierge/SteeringBar.tsx — wired version
interface SteeringBarProps {
  readonly missionId: string;
}

export function SteeringBar({ missionId }: SteeringBarProps) {
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    const res = await fetch(`/api/missions/${missionId}/steer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: message.trim() }),
    });
    if (res.ok) {
      toast.success('Instruction sent to agent');
      setMessage('');
    } else {
      toast.error('Failed to send instruction');
    }
  }, [message, missionId]);
  // ...
}
```

### Draft Approve/Reject Wiring in MissionActionCard
```typescript
// DraftReadyCard — replace showMockToast with real API calls
async function handleApprove(draftId: string, missionId: string) {
  const res = await fetch(`/api/missions/${missionId}/drafts/${draftId}/approve`, {
    method: 'POST',
  });
  if (res.ok) toast.success('Draft approved and sent');
  else toast.error('Failed to approve draft');
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mock missions from mock-missions.ts | Real missions from DB + Realtime | Phase 29 | Eliminates all fake data from Concierge UI |
| LegacyMission (camelCase, embedded logs) | Mission + MissionWithDetails (snake_case, DB-aligned) | Phase 29 | Full type consistency with DB schema |
| SteeringBar fires toast only | SteeringBar POSTs to /api/missions/[id]/steer | Phase 29 | Real steering actually queues in DB |
| MissionActionCard approve buttons show toast | Approve/reject call real draft API routes | Phase 29 | HITL loop is complete end-to-end |
| Chat has no mission awareness | Chat classifies intent, proposes missions, emits mission_created | Phase 29 | Chat becomes entry point for mission creation |

**Deprecated/outdated:**
- `LegacyMission` type: deprecated since Phase 16, removed in Phase 29
- `mockMissions` from `mock-missions.ts`: deleted in Phase 29
- `addMission` in `ConciergeProvider` with camelCase shape: replaced by Realtime INSERT handler

---

## Open Questions

1. **Supabase Realtime private channel JWT behavior in supabase-js v2**
   - What we know: `{config: {private: true}}` is the documented way to enforce RLS on Realtime. Flagged as blocker in STATE.md.
   - What's unclear: Does the browser Supabase client automatically send the session JWT when subscribing? Does the current `createClient()` from `@campusnest/supabase/client` set up auth correctly for Realtime?
   - Recommendation: In the first Wave of Phase 29, add an integration smoke test that subscribes a test user's channel and verifies only their mission updates arrive.

2. **`listingTitle` display in MissionCard**
   - What we know: `LegacyMission.listingTitle` has no direct equivalent in `missions` table. `listing_id` is a UUID FK.
   - What's unclear: Should `GET /api/missions` join listings and return `listing_title`? Or should `MissionWithDetails` derive the subtitle from `goal` text?
   - Recommendation: Use `goal` as the subtitle in `MissionCard` (it contains the mission description). The `GET /api/missions` API route (Phase 26) should be checked to see if it already joins listings. If it does, use `listing_title`. If not, use `goal` to avoid requiring a schema change.

3. **ChatProvider ↔ ConciergeProvider bridge**
   - What we know: After mission creation, `ChatProvider` needs to trigger `ConciergeProvider.addMission()` (or equivalent). But these two providers are siblings in the layout tree, not parent-child.
   - What's unclear: The exact wiring. Options: (a) thread a callback from a shared root ancestor, (b) use a shared event bus (React context with callback), (c) have `ChatProvider` dispatch to `ConciergeProvider` via a thin bridge context.
   - Recommendation: The cleanest approach — add an optional `onMissionCreated` callback prop to `ChatProvider`, and wire it from a root layout component that has access to both contexts. The `(main)/layout.tsx` currently mounts both `ChatProvider` and `ConciergeShell` (which contains `ConciergeProvider`) — add a bridge layer there.

4. **Classifier latency at 30s total timeout**
   - What we know: The main CribAI loop has a 30s total timeout. Adding a classify call consumes ~200-500ms of that budget.
   - What's unclear: Whether the classify call should be included in the 30s budget or run with its own separate timeout.
   - Recommendation: Run the classify call before starting the main timeout timer. It's a fast non-streaming call and should complete well within 1s. The existing 30s TOTAL_TIMEOUT_MS covers the main agentic loop only.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.0 |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @campusnest/web test -- --run --reporter=verbose` |
| Full suite command | `pnpm --filter @campusnest/ai test -- --run && pnpm --filter @campusnest/web test -- --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| V2-BRIDGE-01 | `classifyIntent()` returns housing_search/tour_outreach with confidence > 0.75 for housing messages | unit | `pnpm --filter @campusnest/ai test -- --run --reporter=verbose packages/ai/src/__tests__/intent-classifier.test.ts` | ❌ Wave 0 |
| V2-BRIDGE-01 | `shouldClassify()` returns false for short/non-housing messages | unit | same file | ❌ Wave 0 |
| V2-BRIDGE-01 | `classifyIntent()` returns `general_chat` fallback on Gemini error | unit (mocked) | same file | ❌ Wave 0 |
| V2-BRIDGE-02 | ChatProvider emits `setPendingProposal` on `mission_proposal` SSE event | unit | `pnpm --filter @campusnest/web test -- --run components/chat/__tests__/ChatProvider.test.tsx` | ✅ (needs new test case) |
| V2-BRIDGE-03 | SteeringBar POSTs to correct URL with missionId prop | unit | `pnpm --filter @campusnest/web test -- --run components/concierge/__tests__/concierge.test.tsx` | ✅ (needs new test case) |
| V2-CONCIERGE-01 | ConciergeProvider fetches from GET /api/missions on mount | unit (fetch mock) | same concierge.test.tsx | ✅ (needs new test case) |
| V2-CONCIERGE-02 | `useMissionsRealtime` subscribes to channel with userId; unsubscribes on unmount | unit (supabase mock) | `apps/web/hooks/__tests__/use-missions-realtime.test.ts` | ❌ Wave 0 |
| V2-CONCIERGE-02 | ConciergeProvider updates missions list immutably on Realtime INSERT/UPDATE/DELETE | unit | same concierge.test.tsx | ✅ (needs new test case) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @campusnest/web test -- --run`
- **Per wave merge:** `pnpm --filter @campusnest/ai test -- --run && pnpm --filter @campusnest/web test -- --run && pnpm build`
- **Phase gate:** Full suite green + `pnpm build` exits zero before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/ai/src/__tests__/intent-classifier.test.ts` — covers V2-BRIDGE-01 (classifier unit tests with mocked Gemini client)
- [ ] `apps/web/hooks/__tests__/use-missions-realtime.test.ts` — covers V2-CONCIERGE-02 (hook unit test with mocked supabase-js channel)
- [ ] Create `apps/web/hooks/` directory if it doesn't exist

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read — `packages/ai/src/cribai.ts` — ChatEvent types, CribAI class, tool loop
- Codebase direct read — `apps/web/components/concierge/ConciergeProvider.tsx` — current mock state
- Codebase direct read — `apps/web/components/chat/ChatProvider.tsx` — SSE handling, message structure
- Codebase direct read — `supabase/migrations/013_missions_schema.sql` — DB schema, RLS policies, Realtime publications
- Codebase direct read — `packages/types/src/mission.ts` — Zod schemas, DB type shapes
- Codebase direct read — `.planning/STATE.md` — locked architectural decisions
- Codebase direct read — `packages/ai/src/gemini-client.ts` — createGeminiClient, Vertex/AI Studio detection
- `@google/genai` v1.43.0 — `generateContent` non-streaming API, `responseMimeType: 'application/json'` for JSON output

### Secondary (MEDIUM confidence)
- Supabase Realtime docs pattern — `{config: {private: true}}` for RLS-enforced channels in supabase-js v2; known blocker flagged in STATE.md (needs integration verification)
- `@supabase/supabase-js` v2 `postgres_changes` channel pattern — standard usage, stable API

### Tertiary (LOW confidence)
- Gemini 2.5 Flash classify latency estimate (~200-500ms) — based on typical LLM classify call performance; actual latency under load unknown
- Supabase Realtime filter behavior for `mission_logs`/`mission_drafts` (no `user_id` column) — requires integration test to confirm RLS private channel enforces ownership correctly

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, no new dependencies needed
- Architecture: HIGH — patterns drawn directly from existing codebase and locked STATE.md decisions
- Pitfalls: HIGH — most pitfalls identified from direct code inspection (LegacyMission field gap, tools+responseSchema conflict is documented decision)
- Realtime RLS private channel: MEDIUM — flagged as known blocker in STATE.md; needs integration verification

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable stack; @google/genai minor versions may shift JSON output API)
