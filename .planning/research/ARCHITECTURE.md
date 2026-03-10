# Architecture Research

**Domain:** Native agent backend for AI Concierge — CampusNest v1.2
**Researched:** 2026-03-10
**Confidence:** HIGH — based on direct codebase inspection of all relevant files; no speculation

---

## Standard Architecture

### System Overview — v1.2 Target State

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Next.js 15 App Router (Vercel)                        │
│                                                                              │
│  ┌──────────────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  ConciergeProvider       │  │  SteeringBar     │  │  MissionDetail    │  │
│  │  MODIFY: Supabase RT sub │  │  MODIFY: POST    │  │  NO CHANGE needed │  │
│  │  remove mockMissions     │  │  /api/steering   │  │  (props-based)    │  │
│  └───────────┬──────────────┘  └────────┬─────────┘  └─────────┬─────────┘  │
│              │ Realtime push             │ HTTP POST             │ RT push    │
├──────────────┼───────────────────────────┼───────────────────────┼────────────┤
│                              Next.js API Routes                              │
│                                                                              │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌───────────────────┐   │
│  │ POST /api/missions  │  │ POST /api/missions/  │  │ POST /api/steering│   │
│  │ create + 202 Accept │  │ [id]/approve (HITL)  │  │ intent parsing    │   │
│  └──────────┬──────────┘  └──────────┬───────────┘  └─────────┬─────────┘   │
│             │ void (fire+forget)      │ DB write               │ DB write    │
│  ┌──────────▼──────────────────────────────────────────────────▼──────────┐  │
│  │              packages/ai — MissionExecutor (NEW)                         │  │
│  │   runMission(missionId, serviceClient) → agentic loop                  │  │
│  │   Reuses existing: executeTool(), ToolContext, all 11 handlers          │  │
│  │   New real tools: getReviews (Yelp), contactPm (Resend),               │  │
│  │   getNeighborhoodInfo (Walk Score + Tavily)                             │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │
┌───────────────────────────────────────▼──────────────────────────────────────┐
│                                   Supabase                                   │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │  missions (NEW)  │  │ mission_logs     │  │ mission_drafts           │   │
│  │  status, type,   │  │ (NEW) append-only│  │ (NEW) versioned HITL     │   │
│  │  idempotency_key │  │ Realtime pub     │  │ approve/reject flow      │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │  Supabase Realtime (existing pattern — same as notifications table)  │    │
│  │  ALTER PUBLICATION supabase_realtime ADD TABLE mission_logs;         │    │
│  │  ALTER PUBLICATION supabase_realtime ADD TABLE mission_drafts;       │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  External: Yelp Fusion API, Walk Score API, Resend email, Tavily (exists)   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|---------------|--------|
| `ConciergeProvider` | State owner for missions list — remove `mockMissions`, add Supabase initial fetch + Realtime sub | MODIFY |
| `SteeringBar` | Textarea that posts instructions — wire from toast-only to `POST /api/steering` | MODIFY |
| `MissionDetail` | Shows logs + action cards + steering bar — prop-based, zero changes when fed real data | NO CHANGE |
| `MissionCard` | Renders single mission summary + status badge — prop-based, zero changes | NO CHANGE |
| `ExecutionLogs` | Renders array of log entries — prop-based, zero changes | NO CHANGE |
| `MissionActionCard` | Renders HITL draft approval card + Approve/Reject buttons — needs approve handler wired | MINOR |
| `POST /api/missions` | Auth check, idempotency guard, DB insert, `void runMission()`, return 202 | NEW |
| `POST /api/missions/[id]/approve` | Flip `mission_drafts.status`, unblock executor via Realtime | NEW |
| `POST /api/steering` | Single Gemini function-calling turn, classify intent, write to `mission_steerings` | NEW |
| `MissionExecutor` | Async agentic loop in `packages/ai` — calls tools, appends logs, creates drafts, waits for HITL | NEW |
| `missions` table | Source of truth for mission state — status, type, idempotency key, expiration | NEW DB |
| `mission_logs` table | Append-only execution journal — Realtime-published, UI streams live | NEW DB |
| `mission_drafts` table | HITL draft versioning — draft text, approve/reject flags | NEW DB |
| `mission_steerings` table | Parsed steering intents queue — executor polls/subscribes | NEW DB |
| `getReviews` handler | Replace stub with Yelp Fusion API + Google Places fallback | MODIFY |
| `contactPm` handler | Replace stub with Resend API email using `listings.contact_email` | MODIFY |
| `getNeighborhoodInfo` handler | Replace stub with Walk Score API + existing Tavily `web_search` tool | MODIFY |

---

## Recommended Project Structure

```
packages/ai/src/
├── cribai.ts                        # NO CHANGE — existing chat engine
├── mission-executor.ts              # NEW — async agentic loop for missions
├── mission-types.ts                 # NEW — MissionContext, SteeringIntent types
├── tools/
│   ├── executor.ts                  # NO CHANGE
│   ├── handlers/
│   │   ├── get-reviews.ts           # MODIFY — replace stub with Yelp API
│   │   ├── contact-pm.ts            # MODIFY — replace stub with Resend
│   │   ├── get-neighborhood-info.ts # MODIFY — replace stub with Walk Score
│   │   └── ...8 existing handlers   # NO CHANGE

apps/web/
├── app/api/
│   ├── ai/cribai/route.ts           # NO CHANGE — existing SSE endpoint
│   ├── missions/
│   │   ├── route.ts                 # NEW — POST create + GET list
│   │   └── [id]/
│   │       ├── route.ts             # NEW — GET single mission with logs
│   │       └── approve/route.ts     # NEW — POST HITL approve/reject
│   └── steering/route.ts            # NEW — POST intent parse + DB write
├── components/concierge/
│   ├── ConciergeProvider.tsx        # MODIFY — drop mock, add RT subscription
│   ├── SteeringBar.tsx              # MODIFY — wire POST /api/steering
│   ├── MissionActionCard.tsx        # MINOR — wire approve handler
│   └── ...6 other components        # NO CHANGE
└── lib/
    ├── concierge-types.ts           # MODIFY — align with DB column names
    └── mock-missions.ts             # DELETE — replaced by real DB data

supabase/migrations/
└── 013_missions_schema.sql          # NEW — 4 tables + RLS + Realtime pubs
```

### Structure Rationale

- **`mission-executor.ts` in `packages/ai/`:** Keeps all AI logic colocated with CribAI. The executor reuses the existing `executeTool()`, `ToolContext`, and `createGeminiClient()` — zero duplication. It can be unit-tested independently of the web app.
- **API routes under `/api/missions/`:** Thin HTTP layer only. Route does auth check + idempotency guard + DB insert + `void runMission()` + returns 202. No AI logic lives in the route.
- **Separate `/api/steering/`:** Intent parsing is a distinct concern. One Gemini call classifies free-text → structured `SteeringIntent` (pause/redirect/adjust/abort/accelerate) written to DB. The executor consumes it asynchronously.
- **`mock-missions.ts` deleted:** The `ConciergeProvider` currently initializes with `useState(mockMissions)`. This is the primary wiring debt. All child components (`MissionCard`, `MissionDetail`, `ExecutionLogs`, `MissionActionCard`, `AgentSummary`) accept typed props and require zero structural changes once fed real data.

---

## Architectural Patterns

### Pattern 1: Fire-and-Forget Async Mission with 202 Accepted

**What:** `POST /api/missions` writes a `missions` row, calls `void runMission(id, context)` without awaiting, and immediately returns HTTP 202 with the mission ID. The client does not wait for completion — it subscribes to Realtime updates.

**When to use:** Any operation where the AI agent loop may exceed Vercel function timeout (25s hobby / 60s pro). Mission pipelines (search → shortlist → contact → schedule) easily exceed 25s.

**Trade-offs:** The executor runs as a detached async call within the Vercel function's event loop. Vercel allows the event loop to drain after `Response` is returned — this works for v1.2 missions expected to complete within ~60s. For missions that consistently exceed 60s, move the executor to a Supabase Edge Function (note: requires validating `@google/genai` Deno compatibility — see Anti-Patterns).

**Example:**
```typescript
// apps/web/app/api/missions/route.ts
export async function POST(request: NextRequest) {
  const { missionType, listingId, idempotencyKey } = await request.json();

  // Idempotency: prevent double-submit from client retry
  const { data: existing } = await supabase
    .from('missions')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .single();

  if (existing) {
    return Response.json({ missionId: existing.id }, { status: 200 });
  }

  const { data: mission } = await supabase
    .from('missions')
    .insert({ type: missionType, listing_id: listingId, user_id, status: 'active', idempotency_key: idempotencyKey })
    .select('id')
    .single();

  // Fire async — do not await — return immediately
  void runMission(mission.id, { supabase: serviceClient, userId, campusId });

  return Response.json({ missionId: mission.id }, { status: 202 });
}
```

### Pattern 2: Append-Only Execution Log with Realtime Push

**What:** The mission executor writes each step to `mission_logs` as it runs. The table is Realtime-published. `ConciergeProvider` subscribes and appends incoming rows to local state — `ExecutionLogs` renders them incrementally.

**When to use:** All mission progress. This is exactly how the existing `notifications` table works in v1.0 (`notification-bell.tsx` already demonstrates this pattern — study it before writing the new subscription).

**Trade-offs:** On mobile networks, Realtime WebSocket may disconnect and miss rows. Mitigation: on reconnect, re-fetch all `mission_logs` for the active mission and merge by `id` (dedup by primary key, then sort by `created_at`). The append-only log makes reconciliation trivial — just union by PK.

**Example — executor writes:**
```typescript
// packages/ai/src/mission-executor.ts
async function appendLog(supabase, missionId: string, log: {
  action: string; detail: string; status: 'success' | 'pending' | 'error';
}) {
  await supabase.from('mission_logs').insert({
    mission_id: missionId,
    action: log.action,
    detail: log.detail,
    status: log.status,
  });
  // Supabase Realtime publishes INSERT automatically — no extra code needed
}
```

**Example — UI subscribes:**
```typescript
// apps/web/components/concierge/ConciergeProvider.tsx
supabase
  .channel(`mission-logs-${activeMissionId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'mission_logs',
    filter: `mission_id=eq.${activeMissionId}`,
  }, (payload) => {
    setLogs(prev => [...prev, payload.new as ExecutionLog]);
  })
  .subscribe();
```

### Pattern 3: HITL Draft Approval with Realtime Unblock

**What:** When the executor is about to take an irreversible external action (send email, submit form), it writes a `mission_drafts` row with `status = 'pending_approval'` and updates `missions.status = 'waiting_approval'`. The executor then subscribes to updates on that draft row. The UI shows the draft in a `MissionActionCard` with Approve/Reject buttons. The user clicks Approve → `POST /api/missions/[id]/approve` updates the draft to `approved` → Realtime fires on the executor's channel → executor unblocks and proceeds.

**When to use:** Mandatory for `contactPm` (sends real email). Optional gating for tour scheduling if PM is contacted on the student's behalf.

**Trade-offs:** The executor holds a Supabase Realtime subscription open while waiting. This is cheap (WebSocket, no polling, no Gemini calls during wait). A `expires_at` on `missions` (24h default) prevents indefinite blocking if the user disappears.

**Example:**
```typescript
// packages/ai/src/mission-executor.ts
async function waitForApproval(
  supabase: SupabaseClient,
  draftId: string,
): Promise<'approved' | 'rejected' | 'timeout'> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      channel.unsubscribe();
      resolve('timeout');
    }, 10 * 60 * 1000); // 10 minutes max wait

    const channel = supabase
      .channel(`draft-${draftId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'mission_drafts',
        filter: `id=eq.${draftId}`,
      }, (payload) => {
        const newStatus = payload.new.status as string;
        if (newStatus === 'approved' || newStatus === 'rejected') {
          clearTimeout(timeout);
          channel.unsubscribe();
          resolve(newStatus as 'approved' | 'rejected');
        }
      })
      .subscribe();
  });
}
```

### Pattern 4: Steering Bar Intent Parsing

**What:** `SteeringBar.onSubmit` POSTs raw user text to `/api/steering`. The route runs a single Gemini function-calling turn (one inference call, no agentic loop) to classify the instruction into a typed `SteeringIntent`. The intent is written to `mission_steerings`. The executor reads pending steerings at the top of each loop iteration and acts on them before proceeding.

**When to use:** Any free-text instruction from the user to a running or waiting mission. Classifying intent before acting on it prevents the executor from blindly executing arbitrary natural language.

**Trade-offs:** Adds one Gemini 2.5 Flash call per steering instruction (~$0.0001). Cost is negligible. The alternative — passing raw text to executor — is ambiguous and harder to test.

**Steering intent schema:**
```typescript
type SteeringIntent =
  | { action: 'pause' }
  | { action: 'abort' }
  | { action: 'redirect'; newListingId: string }
  | { action: 'adjust'; instruction: string }  // narrow in-scope modification
  | { action: 'accelerate' };                   // skip HITL for this mission

// Gemini function declaration for the classifier
const CLASSIFY_STEERING: FunctionDeclaration = {
  name: 'classify_steering_intent',
  description: 'Classify the user steering instruction into a structured intent for the agent to act on',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['pause', 'abort', 'redirect', 'adjust', 'accelerate'] },
      newListingId: { type: 'string', description: 'Required when action is redirect' },
      instruction: { type: 'string', description: 'Required when action is adjust' },
    },
    required: ['action'],
  },
};
```

### Pattern 5: Real Tool Integration — Replacing Stubs

**What:** Three existing tool handlers return hardcoded "coming soon" strings. For v1.2, each is replaced with a real external API call while keeping the same `ToolResult` return shape. No changes to the executor, tool router, or CribAI engine are needed.

**Integration map:**

| Handler | Replace with | API Key Env Var | Notes |
|---------|-------------|-----------------|-------|
| `getReviews` | Yelp Fusion `GET /v3/businesses/search` | `YELP_API_KEY` | Search by name + lat/lng from listing. Fall back to Google Places if no Yelp results. |
| `contactPm` | Resend `POST /emails` | `RESEND_API_KEY` | Send to `listings.contact_email`. Requires verified sender domain. Draft text is HITL-approved before this fires. |
| `getNeighborhoodInfo` | Walk Score `GET /score` | `WALKSCORE_API_KEY` | Provides walk/bike/transit scores by lat/lng. Supplement with a Tavily `web_search` call using the existing `webSearch` handler for "live near campus" context. |

**Key constraint:** The `listings` table has a `contact_email` column (migration `011_add_contact_email_to_listings.sql`). Use it directly — no scraping needed for PM contact.

---

## Data Flow

### Mission Creation Flow

```
User clicks "Start Mission" in Concierge UI
    ↓
ConciergeProvider generates idempotency_key (client-side UUID)
POST /api/missions { missionType, listingId, idempotencyKey }
    ↓ (auth check → idempotency guard → DB insert)
missions.INSERT { status: 'active', idempotency_key, expires_at: +24h }
    ↓ (fire-and-forget — does not block HTTP response)
void runMission(id, { supabase: serviceClient, userId, campusId })
    ↓ (202 Accepted returns immediately with missionId)
ConciergeProvider.addMission() → optimistic UI update with new mission
    ↓ (executor starts running in background)
mission_logs.INSERT rows as executor progresses
    ↓ (Supabase Realtime fires on each INSERT)
ConciergeProvider subscription appends rows to selectedMission.logs
ExecutionLogs re-renders live — user sees step-by-step progress
```

### HITL Draft Approval Flow

```
MissionExecutor reaches a send-email step (contactPm)
    ↓
mission_drafts.INSERT { status: 'pending_approval', draft_text, recipient }
missions.UPDATE { status: 'waiting_approval' }
    ↓ (Realtime pushes mission status change to UI)
ConciergeProvider updates mission.status in local state
MissionCard badge changes to "Waiting Approval"
MissionDetail shows MissionActionCard with draft preview + Approve/Reject
    ↓ (executor holds Realtime subscription on mission_drafts row)
User clicks Approve → POST /api/missions/[id]/approve
    ↓
mission_drafts.UPDATE { status: 'approved', reviewed_at }
    ↓ (Realtime fires on executor's waitForApproval subscription)
waitForApproval() resolves 'approved'
    ↓
contactPm sends email via Resend API
missions.UPDATE { status: 'active' }
mission_logs.INSERT { action: 'Email sent', status: 'success' }
Executor continues to next step
```

### Steering Bar Flow

```
User types: "Actually focus on the studio near the library instead"
    ↓
SteeringBar.onSubmit → POST /api/steering { missionId, text, campusSlug }
    ↓ (single Gemini call — no loop)
classify_steering_intent() → { action: 'redirect', newListingId: '...' }
    ↓
mission_steerings.INSERT { mission_id, intent: { action: 'redirect', ... }, applied: false }
POST returns 200 immediately
    ↓ (executor checks pending steerings at top of each loop iteration)
executor reads unapplied steerings → processes redirect
mission_steerings.UPDATE { applied: true }
mission_logs.INSERT { action: 'Redirected per user instruction', status: 'success' }
```

### Realtime Subscription Map

```
ConciergeProvider manages 3 Supabase Realtime channels:

Channel 1: missions (status updates for all user missions)
  event: UPDATE
  filter: user_id=eq.{userId}
  → updates missions[] in local state
  → MissionCard badges re-render

Channel 2: mission_logs (live log stream for selected mission)
  event: INSERT
  filter: mission_id=eq.{selectedMissionId}
  → appends to selectedMission.logs
  → ExecutionLogs renders new rows

Channel 3: mission_drafts (HITL draft ready notification)
  event: INSERT
  filter: mission_id=eq.{selectedMissionId}
  → sets selectedMission.actionCard
  → MissionActionCard renders draft + approval buttons

On channel disconnect: re-fetch full log set from DB, merge by id, re-subscribe
```

---

## New DB Schema

### `013_missions_schema.sql`

```sql
-- missions: one row per user task
CREATE TABLE missions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campus_id       UUID NOT NULL REFERENCES campus_configs(id),
  listing_id      UUID REFERENCES listings(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN (
    'tour_booking', 'lease_review', 'landlord_outreach',
    'price_negotiation', 'listing_comparison'
  )),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'waiting_approval', 'scheduled', 'completed', 'failed'
  )),
  title           TEXT NOT NULL,
  summary         TEXT,
  idempotency_key TEXT UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_missions" ON missions
  FOR ALL USING (auth.uid() = user_id);

-- mission_logs: append-only execution journal (Realtime-published)
CREATE TABLE mission_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  detail      TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('success', 'pending', 'error')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mission_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_mission_logs" ON mission_logs
  FOR ALL USING (
    mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE mission_logs;

-- mission_drafts: HITL versioned drafts (Realtime-published)
CREATE TABLE mission_drafts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL DEFAULT 1,
  draft_text  TEXT NOT NULL,
  recipient   TEXT,
  subject     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN (
    'pending_approval', 'approved', 'rejected'
  )),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

ALTER TABLE mission_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_mission_drafts" ON mission_drafts
  FOR ALL USING (
    mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE mission_drafts;

-- mission_steerings: parsed intent queue consumed by executor
CREATE TABLE mission_steerings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  raw_text    TEXT NOT NULL,
  intent      JSONB NOT NULL,
  applied     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mission_steerings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_mission_steerings" ON mission_steerings
  FOR ALL USING (
    mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid())
  );

-- Indexes
CREATE INDEX idx_missions_user ON missions(user_id);
CREATE INDEX idx_mission_logs_mission ON mission_logs(mission_id, created_at);
CREATE INDEX idx_mission_drafts_mission ON mission_drafts(mission_id);
CREATE INDEX idx_mission_steerings_pending ON mission_steerings(mission_id) WHERE applied = false;
```

---

## Integration Points

### New vs Modified vs Unchanged — Explicit Inventory

| What | Status | Where |
|------|--------|-------|
| `runMission()` agentic loop | NEW | `packages/ai/src/mission-executor.ts` |
| `MissionContext`, `SteeringIntent` types | NEW | `packages/ai/src/mission-types.ts` |
| `POST /api/missions` | NEW | `apps/web/app/api/missions/route.ts` |
| `GET /api/missions/[id]` | NEW | `apps/web/app/api/missions/[id]/route.ts` |
| `POST /api/missions/[id]/approve` | NEW | `apps/web/app/api/missions/[id]/approve/route.ts` |
| `POST /api/steering` | NEW | `apps/web/app/api/steering/route.ts` |
| Migration 013 (4 tables) | NEW | `supabase/migrations/013_missions_schema.sql` |
| `ConciergeProvider.tsx` | MODIFY — remove mock, add Supabase fetch + RT | `apps/web/components/concierge/` |
| `SteeringBar.tsx` | MODIFY — wire POST /api/steering | `apps/web/components/concierge/` |
| `MissionActionCard.tsx` | MODIFY — wire approve/reject handler | `apps/web/components/concierge/` |
| `concierge-types.ts` | MODIFY — align types with DB column names | `apps/web/lib/` |
| `mock-missions.ts` | DELETE | `apps/web/lib/` |
| `getReviews` handler | MODIFY — Yelp Fusion API + Google Places fallback | `packages/ai/src/tools/handlers/` |
| `contactPm` handler | MODIFY — Resend API email send | `packages/ai/src/tools/handlers/` |
| `getNeighborhoodInfo` handler | MODIFY — Walk Score API + Tavily web_search | `packages/ai/src/tools/handlers/` |
| `CribAI` class, `chat()` method | NO CHANGE | `packages/ai/src/cribai.ts` |
| All other 8 tool handlers | NO CHANGE | `packages/ai/src/tools/handlers/` |
| `MissionCard`, `MissionDetail`, `ExecutionLogs`, `AgentSummary`, `MissionSuggestions`, `ConciergeSidebar` | NO CHANGE | `apps/web/components/concierge/` |
| `POST /api/ai/cribai` SSE endpoint | NO CHANGE | `apps/web/app/api/ai/cribai/route.ts` |
| `packages/supabase/` (browser + server clients) | NO CHANGE | `packages/supabase/src/` |
| All migrations 001–012 | NO CHANGE | `supabase/migrations/` |

### External Services — New Integrations

| Service | Integration Pattern | Purpose | Notes |
|---------|---------------------|---------|-------|
| Resend API | REST POST in `contactPm` handler | Send PM contact emails | Add `RESEND_API_KEY` env var. Requires verified sender domain. Use `listings.contact_email` as `to`. |
| Walk Score API | REST GET in `getNeighborhoodInfo` | Walkability/bike/transit scores | Requires lat/lng from listing. Free tier: 5k/day. Add `WALKSCORE_API_KEY`. |
| Yelp Fusion API | REST GET in `getReviews` | Property/PM reviews | Search by business name + coordinates. Add `YELP_API_KEY`. Fall back to Google Places. |
| Google Places API | REST GET in `getReviews` (fallback) | Property reviews | Already used for next/image remote patterns in `next.config.ts`. Reuse key. |
| Tavily | Existing `webSearch` tool | Supplement neighborhood info | Already integrated. `getNeighborhoodInfo` can call `webSearch` internally for "neighborhood near [address]". |
| Supabase Realtime | `postgres_changes` subscriptions | Live mission status + logs | Pattern already in production via `notifications` table. No new infrastructure needed. |

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1k users | Current 202 + fire-and-forget pattern is fine. Monitor Vercel function duration logs. Cap active missions per user at 3 to prevent executor overload. |
| 1k–10k users | Move executor to dedicated background worker if missions average >30s. Add `mission_steerings` queue worker. Supabase Realtime scales horizontally — no changes needed. |
| 10k+ users | Introduce BullMQ or Inngest for mission orchestration. Supabase Realtime connection limits become relevant — upgrade plan. |

### Scaling Priorities

1. **First bottleneck:** Gemini API rate limits. Multiple concurrent missions hitting Gemini 2.5 Flash simultaneously. Fix: rate-limit `POST /api/missions` per user (max 3 active missions), add exponential backoff in executor's Gemini calls.
2. **Second bottleneck:** Vercel function concurrency hitting Supabase connection pool. Fix: PgBouncer (already included in Supabase connection pooler URL) handles this. Ensure the service role client in the executor uses the pooler URL, not the direct URL.

---

## Anti-Patterns

### Anti-Pattern 1: Awaiting the Executor in the HTTP Route

**What people do:** `await runMission(id, context)` before returning the HTTP response.

**Why it's wrong:** The mission executor (search → shortlist → draft → HITL wait) can take 60–600 seconds. Vercel's serverless function timeout (25s hobby, 60s pro) will terminate the function. The client sees a timeout error, but the mission may have partially executed — leaving orphaned DB rows.

**Do this instead:** `void runMission(id, context)` — fire and forget. Return 202 immediately. The client subscribes to Realtime for completion status. Never expect the HTTP response to carry the mission result.

### Anti-Pattern 2: Using the Browser Supabase Client in the Executor

**What people do:** Pass the user's browser `SupabaseClient` instance (from `ConciergeProvider`) to the executor so it reuses the authenticated session.

**Why it's wrong:** The executor runs server-side as an async background task after the HTTP response is sent. The browser client's JWT belongs to the HTTP request lifecycle — it's gone after the response. Any DB write from the executor using this client will fail silently with auth errors.

**Do this instead:** The executor always uses the **service role client** (`createSecretClient()`). It writes to DB on behalf of the user using the `user_id` passed as a parameter — not a live auth session. RLS policies scoped to service role writes are correct here because the executor is trusted server-side code.

### Anti-Pattern 3: Moving Executor to Supabase Edge Function for Timeout Relief

**What people do:** Move the mission executor to a Supabase Edge Function (Deno runtime) to remove Vercel timeout concerns.

**Why it's wrong for v1.2:** `packages/ai/src/mission-executor.ts` imports `@google/genai`, Zod, and internal packages. The `@google/genai` SDK targets Node.js and its Deno compatibility is unverified. Migrating would require auditing and potentially rewriting all import paths for Deno's ESM requirements. The PROJECT.md explicitly defers full state machine infrastructure to a future milestone.

**Do this instead:** Keep the executor in the Next.js API route with `void` fire-and-forget for v1.2. Set `export const maxDuration = 60` in the route file (Vercel Pro supports up to 60s). If v1.2 missions regularly exceed 60s, use a dedicated Node.js worker service (Railway or GitHub Actions cron) — not Deno.

### Anti-Pattern 4: Realtime Subscription Without Reconnect Handling

**What people do:** Set up one Supabase Realtime subscription in `useEffect` and assume it stays connected indefinitely.

**Why it's wrong:** Mobile networks drop. The existing `notification-bell.tsx` already handles this — study it before writing the new mission subscriptions.

**Do this instead:** Add a `onSubscriptionStateChange` callback. On reconnect, re-fetch all `mission_logs` for the active mission from DB and merge by `id` (dedup + sort) before re-subscribing to new INSERTs. The append-only nature of `mission_logs` makes this merge trivial — union by PK, sort by `created_at`.

### Anti-Pattern 5: Storing Mission Draft Text in `missions.summary`

**What people do:** Write the HITL draft content directly into `missions.summary` to avoid creating a `mission_drafts` table.

**Why it's wrong:** `missions.summary` is for the final human-readable outcome. Draft content is distinct: it needs versioning (if the user rejects and the executor revises), an approval status flag, a `reviewed_at` timestamp, and a `recipient` field. Cramming this into `summary` means losing all version history and making the approval flow ambiguous.

**Do this instead:** Use the `mission_drafts` table. A mission can have multiple draft versions (reject → revise → resubmit). Each version is a separate row with `version` incremented. The executor only proceeds when the latest draft has `status = 'approved'`.

---

## Suggested Build Order

The order is determined by dependency: DB schema must exist before executors write to it; real tool integrations are independent and can ship first; UI wiring is last because it requires the backend to be live.

### Phase 1 — DB Foundation (prerequisite for everything)

1. Write `013_missions_schema.sql` with all 4 tables + RLS + Realtime publications
2. Apply migration locally: `supabase db reset` or `supabase migration up`
3. Verify Realtime publications with `supabase db diff`
4. Update `concierge-types.ts` to match DB column names — remove mock-specific fields, add `idempotency_key`, `expires_at`

**Rationale:** Nothing else can be built without this. All subsequent phases write to or read from these tables.

### Phase 2 — Real Tool Integrations (independent of missions schema)

1. `getReviews` — add Yelp Fusion `GET /v3/businesses/search` + Google Places fallback
2. `getNeighborhoodInfo` — add Walk Score API call; supplement with existing `webSearch` tool
3. `contactPm` — add Resend `POST /emails` using `listings.contact_email`
4. Unit tests for each handler: mock the external API, assert `ToolResult` shape is unchanged

**Rationale:** These three handlers are entirely independent of the missions system. They fix existing tech debt and can be shipped, tested, and merged before Phase 3 starts. They also mean that when the executor calls `contactPm`, it sends a real email — not a stub.

### Phase 3 — Mission Executor Backend

1. `packages/ai/src/mission-types.ts` — `MissionContext`, `SteeringIntent` types
2. `packages/ai/src/mission-executor.ts` — agentic loop: tool calls, `appendLog()`, `waitForApproval()`, steering checks
3. `POST /api/missions` route — auth, idempotency, DB insert, `void runMission()`, 202
4. `GET /api/missions/[id]` route — fetch mission + logs for initial page load
5. `POST /api/missions/[id]/approve` route — flip draft status
6. Integration test: POST to create mission → verify logs appear in DB → verify status transitions

**Rationale:** Core backend. Depends on Phase 1. Leverages Phase 2 real tools. The 202 pattern + service role executor is the architectural linchpin — get this right before wiring the UI.

### Phase 4 — Steering Bar Backend

1. `POST /api/steering` — single Gemini function-calling turn → `classify_steering_intent` → DB write
2. Executor: read unapplied steerings at top of each loop iteration
3. `SteeringBar.tsx` — replace `toast.success('Instruction sent')` with `POST /api/steering { missionId, text }` call
4. Unit test: assert Gemini classifies 5 representative instruction samples correctly

**Rationale:** Depends on Phase 3 (executor must exist to consume steerings). Steering without an executor to act on it is inert.

### Phase 5 — Realtime UI Wiring

1. `ConciergeProvider.tsx`:
   - Replace `useState(mockMissions)` with `useEffect` initial fetch from Supabase
   - Add Realtime channel for `missions` table (status updates)
   - Add Realtime channel for `mission_logs` table (filtered by `selectedMissionId`)
   - Add Realtime channel for `mission_drafts` table (HITL draft ready)
   - Add reconnect handler with re-fetch + dedup merge
2. `MissionActionCard.tsx` — wire Approve/Reject buttons to `POST /api/missions/[id]/approve`
3. Delete `mock-missions.ts`
4. E2E test: create mission in UI → verify logs appear live → approve draft → verify email sent (Resend sandbox)

**Rationale:** Last step because it requires Phases 1–4 to all be working. The child UI components (`MissionCard`, `MissionDetail`, `ExecutionLogs`) require zero structural changes — only `ConciergeProvider` needs to switch from mock state to real DB state.

---

## Sources

- Codebase direct inspection: `packages/ai/src/cribai.ts` — agentic loop pattern to replicate in executor
- Codebase direct inspection: `packages/ai/src/tools/executor.ts` — `executeTool()` reuse
- Codebase direct inspection: `packages/ai/src/tools/handlers/get-reviews.ts`, `contact-pm.ts`, `get-neighborhood-info.ts` — stub implementations to replace
- Codebase direct inspection: `apps/web/components/concierge/` (all 9 files) — UI wiring surface
- Codebase direct inspection: `apps/web/app/api/ai/cribai/route.ts` — auth pattern + service role client pattern to reuse in mission routes
- Codebase direct inspection: `supabase/migrations/007_saved_listings_notifications.sql` — Realtime publication pattern identical to what missions needs
- Project context: `.planning/PROJECT.md` — constraint "Simple mission table over state machines", constraint "Full state machine backend out of scope for v1.2"
- Supabase Realtime postgres_changes docs — HIGH confidence (same API used in production notifications table)
- Resend API docs — HIGH confidence (simple REST, widely used in Next.js ecosystem)

---

*Architecture research for: CampusNest v1.2 Native Agent Backend*
*Researched: 2026-03-10*
