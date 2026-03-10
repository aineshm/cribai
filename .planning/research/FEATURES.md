# Feature Research

**Domain:** AI-native agent backend — mission executor, HITL approval, real-time status, tool integrations
**Researched:** 2026-03-10
**Confidence:** HIGH (async executor, Supabase Realtime, Gemini function calling) / MEDIUM (review aggregation APIs, neighborhood data providers)

---

## Context: What is Already Built (v1.1)

These ship and must NOT be rebuilt — only wired to real data:

| Existing Feature | Current State |
|-----------------|---------------|
| AI Concierge UI: mission sidebar, action cards, logs, steering bar | Built — all mock data, needs real backend |
| Supabase Realtime: price change notifications | Built — pattern proven, extend to missions table |
| CribAI with 11 Gemini function-calling tools | Built — powers chat, mission executor will reuse these |
| Tour scheduling with calendar conflict detection | Built — first action requiring HITL approval |
| DB-backed conversation persistence | Built — pattern proven, extend for mission logs |
| 3 placeholder tools: reviews, PM contact, neighborhood info | Built — return "coming soon" stubs, need real integrations |

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must exist for the v1.2 milestone to be considered complete. Missing any of these = the Concierge UI built in v1.1 is just a demo and cannot ship.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Mission executor backend** | The v1.1 Concierge UI renders mission cards, progress states, and action logs. Without a real backend driving those states, everything is mock data and shipping v1.1 would be misleading to users. | HIGH | Next.js API route (not Edge Function — needs Node.js for Gemini SDK). POST /api/missions creates a record and returns 202. Separate async execution updates `missions.status` at checkpoints. Reuses all 11 existing CribAI tools via the existing `executeTool()` registry. Max 10 tool calls per mission, 60s timeout. |
| **Missions DB schema** | Any async background work that users can view later requires a DB-backed record. Without the schema, no status persistence, no HITL checkpoint storage, no idempotency. | MEDIUM | New migration. Minimum columns: `id`, `user_id`, `campus_id`, `prompt`, `steering_prompt`, `status` (enum: queued/in_progress/action_needed/draft_approval/completed/failed/expired), `summary`, `raw_logs` (JSONB array), `draft_payload` (JSONB), `idempotency_key`, `expires_at`, `created_at`, `updated_at`. RLS: own rows only. |
| **Supabase Realtime subscriptions for mission status** | The Concierge UI must update live without polling or page refresh. This is expected behavior for any agent product — users should see "In Progress → Action Needed" animate in real time. | MEDIUM | Client subscribes to `missions` channel filtered by `user_id` on page mount. Listens for `UPDATE` events on `status` and `summary` columns. Existing `@supabase/supabase-js` Realtime client is proven (used for price notifications). Server-side: executor writes status updates to DB; Realtime WAL-decoding broadcasts to client automatically. |
| **Wire Concierge UI to real backend data** | The v1.1 UI is 100% mock. After v1.2 lands, mission cards, status badges, log entries, draft approval cards, and steering bar submissions must all read from and write to the real backend. | MEDIUM | Replace all mock data constants with Supabase queries. Mission list: SELECT from `missions` where `user_id`. Status badge: driven by `missions.status`. Log timeline: driven by `raw_logs` JSONB. Draft review card: driven by `draft_payload`. Steering submission: PATCH `missions.steering_prompt` + re-queue. |
| **HITL draft approval gate** | Any mission step that triggers an irreversible real-world action (tour scheduling, contacting a PM) must pause and show the user what will happen before proceeding. This is the fundamental trust mechanism for agentic systems and is expected from any production agent product. | MEDIUM | Mission parks at `draft_approval` status. `draft_payload` contains the action details (e.g., tour request: listing, proposed time, message to PM). Review card in UI: shows proposed action + Approve / Edit / Reject controls. On approve: POST /api/missions/[id]/approve executes the action and resumes. On reject: marks mission failed with reason. On edit: updates `draft_payload` and re-shows card. |
| **Steering bar intent parsing** | Users correcting a mid-mission prompt ("actually I need a 3BR, not 2BR") expect the agent to understand the correction contextually, not re-run from scratch with a literal string replacement. Intent parsing distinguishes "modify this specific constraint" from "restart with new goal". | MEDIUM | POST /api/missions/[id]/steer. Body: `{ correction: string }`. Gemini function-calling call with single schema: `parse_steering_intent` → fields: `action` (modify_constraint / add_constraint / change_goal / cancel), `parameter` (e.g., "bedrooms"), `new_value` (e.g., "3"). Result is merged into the mission context before re-execution. |

### Differentiators (Competitive Advantage)

Features that separate CampusNest from generic housing sites. These are not requirements for the executor to function, but they define the product's AI-native identity.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Real reviews aggregation tool** | Students deciding between landlords want social proof beyond the listing copy. A tool that surfaces real Google/Yelp ratings for the property or management company makes the agent genuinely useful for decision-making, not just search. | MEDIUM | Replace `get_landlord_info` stub. Google Places API (New) — `places:searchText` or `places:nearbySearch` with `type=apartment_complex`. Return: `rating`, `user_rating_count`, `reviews[0..3].text`. Cache results in `landlords` table (existing) under `google_place_id` + `review_cache`. TTL: 7 days before re-fetch. Auth: `GOOGLE_PLACES_API_KEY` env var. |
| **PM contact tool** | The current `get_landlord_info` stub returns no contact data. A tool that returns a real phone number or email for the property manager lets the agent draft outreach messages and complete the "contact landlord" mission step, which is the most requested agent action in student housing. | MEDIUM | Pull from `landlords` table (already exists with `contact_email`, `phone`, `website` columns). For listings without a matched landlord record, fall back to `listings.raw_data.contact` scraped field. Add a `draft_message` parameter to the tool so the agent can generate a pre-written inquiry. Return: `{ landlord_name, phone, email, draft_message }`. No outbound email in v1.2 — draft only, user sends manually. |
| **Neighborhood info tool with real data** | "Is this neighborhood safe? Is there a grocery store? How far is it from campus transit?" are the top 3 questions students ask after price and size. Replacing the stub with real walkability and amenity data makes the agent genuinely answer these questions rather than deflecting. | MEDIUM | Replace `neighborhood_info` stub. Walk Score API: returns Walk Score (0-100), Transit Score, Bike Score for a lat/lng. Google Places API (New): `nearbySearch` for `grocery_or_supermarket`, `transit_station`, `gym`, `restaurant` within 800m radius. Return: `{ walk_score, transit_score, bike_score, nearby: { groceries: N, transit_stops: N, restaurants: N } }`. Auth: `WALK_SCORE_API_KEY` + `GOOGLE_PLACES_API_KEY`. |
| **Mission idempotency and expiration** | Users retrying a failed mission should not accidentally create duplicate tour requests. Missions that are never approved should auto-expire rather than clog the list indefinitely. Both are baseline reliability expectations for any async task system. | LOW-MEDIUM | `idempotency_key` column: SHA256 of `user_id + prompt + created_at_date` (day-level granularity). On mission create: check for existing in-progress/queued mission with same key before inserting. `expires_at` column: set to `created_at + 24 hours` for `action_needed`/`draft_approval` states. Cron via Supabase Edge Function: mark expired missions as `failed` with `expiry_reason`. |
| **Execution log timeline in UI** | Power users want to understand what the agent actually did. Showing a chronological timeline of tool calls ("Searched listings → Found 8 matches → Compared top 3 → Drafted tour request") differentiates CampusNest from black-box AI search tools. | LOW | Driven by `missions.raw_logs` JSONB array already planned in schema. Each log entry: `{ timestamp, tool_name, summary, success }`. Render as vertical timeline in the accordion "View agent steps" panel (already in v1.1 UI mock). Tool names map to icons via a lookup (search → MagnifyingGlass, compare → BarChart, tour → Calendar, etc.). |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Fully autonomous outbound email/SMS to PMs** | "Have the agent contact the landlord for me automatically" sounds like the full agent dream. | Sending emails on behalf of users without final review creates legal liability (CAN-SPAM, implicit representation), and students frequently change their mind about a listing between search and contact. Trust requires the user to be the sender. | Draft the message, show it to the user for approval, and provide a one-click "Copy message" or "Open in email" button. The agent prepares, the user executes. |
| **Full LangGraph / Step Functions state machine** | Correctness, retry logic, and observability at scale are genuinely valuable. | LangGraph requires a separate deployment target (LangServe or Python backend) and adds significant infra complexity for a Next.js + Supabase app. At current scale (one campus, unknown mission volume), the simple `missions` table + status column + Supabase Realtime pattern is correct per the explicit PROJECT.md decision. | Simple status column with executor checkpointing. Revisit after missions reach 1K+/day volume with retry failures visible in logs. |
| **Streaming execution logs (live tool call SSE)** | Feels more alive and transparent. | Most tool calls complete in 300-800ms. Streaming creates visual churn (things appearing and disappearing too fast to read) for no comprehension gain. Implementation complexity is high — SSE for a background job requires either a second subscription channel or a persistent connection while the executor runs. | Show a pulsing "In Progress" state, then reveal the full log summary when done. Reserve live streaming for a v2 "debug mode" if power users request it. |
| **Generative mission card types (agent returns component JSON)** | Full flexibility for any mission type. | No established rendering safety pattern exists for this. Type safety at the serialization boundary is hard. Fallback handling for unknown component types is undefined. Accessibility of generative components is unpredictable. Per PROJECT.md: v2+ only. | Hardcoded mission result card types for v1.2: shortlist card, comparison card, tour draft card. New types are added by a developer, not generatively. |
| **Third-party review import (Yelp API, ApartmentRatings)** | More reviews = more credibility. | Yelp's API Terms of Service prohibit displaying Yelp reviews outside of Yelp. ApartmentRatings.com does not provide a public API. Attempting to aggregate these creates ToS violations and potential C&D risk. | Google Places API explicitly permits displaying reviews with proper attribution (and returns up to 5 reviews per place). This is the only safe aggregation source. Supplement with in-product landlord reviews (already in DB schema). |
| **Real-time review freshness (rechecking on every page load)** | Always show the most current rating. | Google Places API pricing is per-request. Uncached re-fetching on every listing detail load at even modest traffic (100 users/day) could cost $50-200/month in API fees. | Cache reviews in `landlords.review_cache` with a `review_cache_updated_at` timestamp. Re-fetch only when TTL expires (7 days). Show "Last updated X days ago" in the UI for transparency. |
| **Walk Score displayed as a standalone marketing feature** | Walkability is a known search filter on Zillow/Redfin. | Walk Score is a feature completion item, not a product differentiator. Students already know to look for campus proximity (which we handle via commute time). Prominently featuring Walk Score can distract from the AI-native identity of the product. | Embed Walk Score and Transit Score as supporting data within the neighborhood_info tool response, surfaced in the AI chat answer rather than as a UI widget on the listing detail page. |

---

## Feature Dependencies

```
Missions DB Schema (new migration)
    └──required by──> Mission executor backend
    └──required by──> Supabase Realtime subscriptions (needs table to subscribe to)
    └──required by──> HITL draft approval (needs draft_payload column)
    └──required by──> Steering bar intent parsing (needs steering_prompt column)
    └──required by──> Wire Concierge UI to real data

Mission executor backend
    ├──requires──> Missions DB schema
    ├──requires──> Existing CribAI tools (already built — search_listings, compare_listings, etc.)
    ├──requires──> Real reviews tool (replace stub)
    ├──requires──> Real PM contact tool (replace stub)
    └──requires──> Real neighborhood info tool (replace stub)

HITL draft approval
    ├──requires──> Missions DB schema (draft_payload column)
    ├──requires──> Mission executor backend (must be able to park at draft_approval status)
    └──enhances──> Tour scheduling tool (first action requiring approval)

Supabase Realtime subscriptions
    ├──requires──> Missions DB schema (table must exist to subscribe)
    └──requires──> Wire Concierge UI (client must subscribe on page mount)

Steering bar intent parsing
    ├──requires──> Missions DB schema (steering_prompt column)
    ├──requires──> Gemini function calling (existing SDK)
    └──enhances──> Mission executor backend (parsed intent re-queues execution)

Real tool integrations (reviews, PM contact, neighborhood)
    ├──requires──> Google Places API key (new env var)
    ├──requires──> Walk Score API key (new env var)
    └──requires──> Existing landlords table (reviews and contact write to existing columns)

Wire Concierge UI to real data
    ├──requires──> Missions DB schema
    ├──requires──> Mission executor backend
    ├──requires──> Supabase Realtime subscriptions
    └──requires──> HITL draft approval (UI renders draft_payload from DB)
```

### Dependency Notes

- **Missions schema is Phase 1:** It is the foundation for every other v1.2 feature. The executor, HITL flow, Realtime, and UI wiring all depend on it. It must be the first thing written and applied.
- **Real tool integrations are independent of missions:** Reviews, PM contact, and neighborhood info replace stubs in the existing CribAI tool system. They can be built in parallel with the mission executor without blocking each other.
- **HITL requires executor to be able to pause:** The executor must implement a checkpoint mechanism where it writes `status = draft_approval` and `draft_payload`, then returns without completing the mission. The approval API then triggers re-execution from the checkpoint. This is an executor design constraint, not just a UI feature.
- **Steering bar requires intent parsing to be non-trivial:** A simple string-replace on the mission prompt is not sufficient. Gemini must parse the steering input into structured intent so the executor knows what changed and can continue from the last safe state rather than re-running from scratch.
- **Supabase Realtime already proven in the codebase:** Price change notifications use this exact pattern. The v1.2 subscription on `missions` is a direct extension of the existing pattern in `packages/supabase/`.

---

## MVP Definition

### v1.2 Launch With (All Required for Milestone)

- [ ] **Missions DB schema with HITL draft versioning** — idempotency, expiration, status enum, raw_logs JSONB, draft_payload JSONB. Migration applied before any other work.
- [ ] **Mission executor backend** — POST /api/missions (202 Accepted), async execution via Next.js `after()` API or background route, status checkpointing, tool reuse from existing CribAI registry.
- [ ] **Supabase Realtime subscriptions for live status** — Client subscribes on concierge page mount, receives status UPDATE events, animates badge transitions.
- [ ] **HITL draft approval flow** — Mission parks at `draft_approval`, UI renders draft review card, Approve/Edit/Reject API, execution resumes on approve.
- [ ] **Steering bar intent parsing** — POST /api/missions/[id]/steer, Gemini parses correction into structured intent, executor re-queues with updated context.
- [ ] **Real reviews tool** — Replaces `get_landlord_info` stub with Google Places API. Rating + review count + 3 recent reviews. Cached in `landlords` table.
- [ ] **Real PM contact tool** — Returns real contact data from `landlords` table + `listings.raw_data`. Draft message generation.
- [ ] **Real neighborhood info tool** — Walk Score API (walkability/transit/bike) + Google Places nearby search. Replaces neighborhood stub.
- [ ] **Wire Concierge UI to real backend data** — All mock constants replaced with Supabase queries and Realtime subscriptions.

### Add After v1.2 Validation

- [ ] **Mission retry on transient failures** — Trigger: if failure rate on missions exceeds 5% due to tool timeouts.
- [ ] **Review freshness controls in UI** — "Refresh reviews" button on listing detail. Trigger: if users report stale review data.
- [ ] **More mission types** — "Find a roommate", "Compare neighborhoods". Trigger: once baseline search→tour mission is stable.

### Future Consideration (v2+)

- [ ] **Full LangGraph state machine** — When mission volume exceeds 1K/day with observable retry failures. Requires Python backend service.
- [ ] **Live streaming execution logs** — SSE-streamed tool call timeline. Deferred: high complexity, low comprehension value at current scale.
- [ ] **Outbound email on user behalf** — When CampusNest has verified landlord partnerships and explicit user consent mechanism.
- [ ] **Generative mission card types** — When mission type inventory stabilizes and rendering safety patterns emerge.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Missions DB schema | HIGH (foundation) | LOW-MEDIUM | P1 |
| Mission executor backend | HIGH | HIGH | P1 |
| Supabase Realtime for missions | HIGH | MEDIUM | P1 |
| HITL draft approval | HIGH | MEDIUM | P1 |
| Wire Concierge UI to real data | HIGH | MEDIUM | P1 |
| Steering bar intent parsing | MEDIUM | MEDIUM | P1 |
| Real reviews tool | MEDIUM | MEDIUM | P1 |
| Real PM contact tool | MEDIUM | LOW | P1 |
| Real neighborhood info tool | MEDIUM | MEDIUM | P1 |
| Mission idempotency + expiration | MEDIUM | LOW | P2 |
| Execution log timeline UI | MEDIUM | LOW | P2 |
| Mission retry on failure | LOW | MEDIUM | P3 |
| Live streaming execution logs | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.2 milestone launch
- P2: Should have — include if time permits, not a blocker
- P3: Nice to have — future consideration

---

## Implementation Notes

### Mission Executor: Fire-and-Forget on Vercel

The key constraint is Vercel's serverless function execution model. A mission executor doing multiple LLM tool calls can exceed the 10s default function timeout. Two patterns work:

1. **`after()` API (Next.js 15.1+, recommended):** POST /api/missions returns 202 immediately after inserting the DB record. The mission execution runs in `after()` which guarantees completion even after the response is sent. Available on Vercel with Node.js runtime. Confirmed pattern from Next.js 15.1 release notes.

2. **Separate async route + trigger:** POST /api/missions returns 202 and triggers POST /api/missions/execute (fire-and-forget via `fetch` with no `await`). The execute route runs under the Vercel function timeout (300s on Pro plan). This is the fallback if `after()` has issues.

Do NOT use Supabase Edge Functions for execution — Deno runtime does not support the `@google/genai` Node.js SDK. The executor must run in the Next.js Node.js runtime.

### HITL Checkpoint Pattern

The executor must support a "park" operation:
1. Tool call identifies an irreversible action (tour scheduling, PM contact draft)
2. Executor writes `status = draft_approval`, `draft_payload = { action_type, params }` to DB
3. Executor returns (does not complete the full mission)
4. Supabase Realtime pushes the status change to client
5. UI renders the draft review card
6. User approves → POST /api/missions/[id]/approve → executor re-instantiated with the approved payload, continues from checkpoint
7. User rejects → POST /api/missions/[id]/reject → status = failed, reason logged

The checkpoint state is stored entirely in `draft_payload` — executor has no in-memory state to recover. This is the correct pattern for serverless environments.

### Steering Bar Intent Parsing

Single-call Gemini function-calling pattern (not agentic loop). System prompt describes the current mission context (original prompt, tools called so far, current status). User input is the correction. Function schema:

```typescript
parse_steering_intent: {
  action: "modify_constraint" | "add_constraint" | "change_goal" | "cancel",
  parameter?: string,     // e.g. "max_rent", "bedrooms", "neighborhood"
  new_value?: string,     // e.g. "900", "3", "near engineering buildings"
  rerun_from_start: boolean  // true if goal changed, false if constraint modified
}
```

If `rerun_from_start: true`, create a new mission with the merged prompt and archive the old one. If `false`, update `steering_prompt`, reset `status = queued`, and executor starts with the updated constraint context.

### Google Places API for Reviews

Use the Places API (New) — the legacy Places API is deprecated as of 2025. Key: `GOOGLE_PLACES_API_KEY`. For reviews aggregation on apartment complexes, use `places:searchText` with the property address as the query, `type = apartment_complex`, and request the `reviews` field mask. Reviews are returned as `google.maps.places.v1.Review` objects with `text.text`, `rating`, `publishTime`. Cache `place_id` in `landlords.google_place_id` so subsequent fetches use `places/{place_id}` directly (much cheaper than text search).

Attribution requirement: Google Places reviews must display "Powered by Google" attribution per Terms of Service.

### Walk Score API

REST API: `https://api.walkscore.com/score?format=json&address={address}&lat={lat}&lon={lon}&transit=1&bike=1&wsapikey={key}`. Returns `walkscore` (0-100), `transit.score`, `bike.score`, `description` (e.g. "Very Walkable"), `transit.description`. No SDK required — plain fetch. Rate limit: 5,000 requests/day on free tier. Cache in `listings.walk_score_data` JSONB column (add via migration, nullable). TTL: 30 days (walkability doesn't change frequently).

---

## Sources

- [Next.js `after()` API — Next.js 15.1 Release](https://medium.com/@alamdar.hussain0007/the-after-api-in-next-js-15-1-a-game-changer-for-background-tasks-1a1ffd79684e)
- [Fire-and-forget pattern in Next.js API routes — Vercel Community](https://community.vercel.com/t/fire-and-forget-next-js-api-route/15865)
- [Human-in-the-Loop for AI Agents — Permit.io](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo)
- [HITL patterns in agent frameworks — Zapier](https://zapier.com/blog/human-in-the-loop/)
- [LangGraph HITL documentation — LangChain](https://docs.langchain.com/oss/python/langchain/human-in-the-loop)
- [Supabase Realtime architecture — Supabase Docs](https://supabase.com/docs/guides/realtime/architecture)
- [Supabase Realtime GitHub — core features](https://deepwiki.com/supabase/realtime/4-core-real-time-features)
- [Google Places API (New) — Overview](https://developers.google.com/maps/documentation/places/web-service/op-overview)
- [Google Places API — AI-powered review summaries](https://developers.google.com/maps/documentation/places/web-service/review-summaries)
- [Google Places Aggregate API — Overview](https://developers.google.com/maps/documentation/places-aggregate/overview)
- [Walk Score API documentation](https://www.walkscore.com/professional/api.php)
- [Walk Score on RapidAPI](https://rapidapi.com/theapiguy/api/walk-score)
- [Gemini function calling guide — Google AI for Developers](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini 2.0 Flash function calling — Phil Schmid](https://www.philschmid.de/gemini-function-calling)
- [Top apartment review site integrations — Local Data Exchange](https://www.localdataexchange.com/top-6-apartment-property-reviews-integrations/)

---
*Feature research for: CampusNest v1.2 Native Agent Backend*
*Researched: 2026-03-10*
