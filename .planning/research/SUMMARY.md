# Project Research Summary

**Project:** CampusNest v1.2 — Native Agent Backend
**Domain:** AI-native async mission executor with HITL approval, Realtime status, steering bar intent parsing, and real tool integrations
**Researched:** 2026-03-10
**Confidence:** HIGH

## Executive Summary

CampusNest v1.2 converts a fully-mocked AI Concierge UI (built in v1.1) into a live agentic backend. The core pattern is a fire-and-forget mission executor: a POST to `/api/missions` inserts a DB row, returns `202 Accepted`, and fires the async executor via Next.js `after()` — which runs the existing 11-tool Gemini function-calling loop against real external APIs (Google Places, Walk Score, Tavily Extract). Supabase Realtime `postgres_changes` then pushes live status and log updates to the Concierge UI, replacing all mock state. This approach is the correct choice for the current scale: it requires zero new infrastructure (no queues, no additional services) and maps directly onto the existing Supabase + Gemini stack.

The recommended implementation order is schema-first: the `missions`, `mission_logs`, `mission_drafts`, and `mission_steerings` tables (migration `013`) must be applied before any executor or UI work begins, since every other v1.2 feature depends on them. Real tool integrations (reviews, PM contact, neighborhood info) are fully independent of the mission schema and can be built in parallel. The executor backend is built third, HITL approval and steering bar fourth, and Concierge UI wiring is the final step since it requires all prior phases to be live.

The highest-risk areas are: (1) Gemini 2.5 Flash's confirmed incompatibility between function calling and `responseSchema` in the same request — these must be separated into distinct calls throughout the executor and steering bar; (2) HITL draft versioning — `draft_version` and `is_current` columns must be in the initial schema, because missing them causes irreversible stale-approval bugs that trigger wrong real-world actions; and (3) Supabase Realtime subscriptions must use a single per-user channel (not per-mission) with explicit `filter: user_id=eq.X` to prevent cross-user data leakage and to stay within the 200-connection free tier limit.

## Key Findings

### Recommended Stack

The v1.2 stack adds only two net-new packages to the existing Next.js 15 + Supabase + Gemini 2.5 Flash foundation: `@googlemaps/places` v2.3.0 (Places API New — required for `neighborhoodSummary` and AI area summaries not available in the legacy client) and conditionally `resend` v4.x for HITL email notifications. Everything else is already installed: `after()` is built into Next.js 15.1+, Supabase Realtime is in the existing `@supabase/supabase-js`, Tavily Extract is available via the existing `@tavily/core`, and Zod is already present for payload validation.

`after()` from `next/server` is the correct mechanism for the fire-and-forget executor — Vercel explicitly recommends it over the deprecated `waitUntil()` from `@vercel/functions` for any project on Next.js >= 15.1. Inngest, QStash, BullMQ, and LangGraph are all explicitly out of scope for v1.2 per PROJECT.md; the `missions` table itself is the queue.

**Core new technologies:**
- `after()` from `next/server`: fire-and-forget mission executor — built-in, no install, stable since Next.js 15.1.0
- `@googlemaps/places` v2.3.0: neighborhood info and AI area summaries — required for `neighborhoodSummary` field absent from legacy Google Maps client
- Supabase Realtime `postgres_changes`: live mission status push — zero new dependency, already proven via notifications table
- Tavily Extract (existing `@tavily/core`): review aggregation and PM contact fallback — zero new dependency, existing `TAVILY_API_KEY` reused
- `resend` v4.x (conditional): HITL draft ready email notifications — only install if email notifications are in scope

**New environment variables required:**
- `GOOGLE_PLACES_API_KEY` — Google Maps Platform Console
- `WALKSCORE_API_KEY` — Walk Score
- `RESEND_API_KEY` — Resend Dashboard (conditional on email HITL scope)

### Expected Features

All 9 features below are P1 required for the v1.2 milestone. The Concierge UI is 100% mock today — without the backend, the milestone cannot ship.

**Must have (table stakes):**
- **Missions DB schema** (migration 013: 4 tables, RLS, Realtime publications, pg_cron cleanup) — prerequisite for every other feature; must be applied first
- **Mission executor backend** — POST `/api/missions` returns 202, async `after()` runs the agentic loop reusing all 11 existing CribAI tools, max 8 Gemini turns, service role DB writes
- **Supabase Realtime subscriptions** — 3 channels per user (mission status, active mission logs, draft notifications); polling fallback on reconnect
- **HITL draft approval gate** — mission parks at `waiting_approval`, UI shows draft review card with Approve/Edit/Reject; executor resumes on approval; versioned drafts with 409 on stale approval
- **Steering bar intent parsing** — POST `/api/steering`, single Gemini function-calling turn classifies free-text into structured `SteeringIntent` enum, executor consumes from `mission_steerings` table
- **Wire Concierge UI to real backend** — delete `mock-missions.ts`, replace all mock constants with Supabase queries and Realtime subscriptions

**Should have (differentiators):**
- **Real reviews tool** — replace `get_landlord_info` stub with Google Places API (New) + Tavily fallback; cache in `landlords.review_cache` at 24h TTL (Yelp ToS max)
- **Real PM contact tool** — return contact from `landlords` table / `listings.raw_data`; generate draft message via Gemini; no outbound email send in v1.2 (draft + deep link only)
- **Real neighborhood info tool** — Walk Score API (walk/transit/bike scores) + Google Places `nearbySearch` + Tavily supplement; cache in `listings` at 7-day TTL

**Defer (v2+):**
- Full LangGraph state machine — when mission volume exceeds 1K/day with observable retry failures
- Live streaming execution logs (SSE) — high complexity, low comprehension value at current scale
- Outbound email on user behalf — requires verified landlord partnerships and explicit consent mechanism
- Generative mission card types — when rendering safety patterns emerge

### Architecture Approach

The architecture is a thin Next.js API layer over a Supabase persistence layer, with all AI logic in `packages/ai`. The executor (`mission-executor.ts`) lives in `packages/ai` alongside the existing CribAI engine, reusing `executeTool()`, `ToolContext`, and `createGeminiClient()` with zero duplication. Route handlers are thin: auth check -> idempotency guard -> DB insert -> `void runMission()` -> 202. Three Supabase Realtime channels per connected user drive all UI updates (missions status, mission logs, draft notifications) with reconnect + re-fetch dedup handling on disconnect. Four components require modification (`ConciergeProvider`, `SteeringBar`, `MissionActionCard`, `concierge-types.ts`); six child components require zero structural changes when fed real data.

**Major components:**
1. **`POST /api/missions` + `MissionExecutor` in `packages/ai`** — HTTP layer creates the row and fires `after()`; executor runs the agentic loop (max 8 Gemini turns), writes to `mission_logs` at each step, parks at `waiting_approval` for HITL checkpoints
2. **Supabase 4-table schema** (`missions`, `mission_logs`, `mission_drafts`, `mission_steerings`) — append-only `mission_logs` is Realtime-published; `mission_drafts` uses `draft_version` + `is_current` for safe HITL versioning; `mission_steerings` is the parsed intent queue consumed by the executor
3. **`ConciergeProvider` + 3 Realtime channels** — single per-user channel for mission status, one active-mission channel for logs, one for draft notifications; polling fallback on `CLOSED`/`CHANNEL_ERROR`; replaces all mock state
4. **`POST /api/steering` + Gemini classifier** — one function-calling turn per steering input, structured `SteeringIntent` written to DB, executor polls for unapplied steerings at loop top
5. **3 real tool handlers** (`getReviews`, `contactPm`, `getNeighborhoodInfo`) — replace stubs with Google Places API (New), `listings.contact_email` + Resend, Walk Score + Tavily; same `ToolResult` return shape, zero executor changes needed

### Critical Pitfalls

1. **Gemini 2.5 Flash rejects combined function calling + `responseSchema` in one request** — confirmed bug as of late 2025 (Google AI forum + googleapis GitHub issues). Function-calling turns and structured-output turns must be separated throughout the executor and steering bar. Never set both `tools` and `generationConfig.responseSchema` on the same Gemini call. This constraint must be established as an architectural rule in the first Gemini call written.

2. **HITL stale draft approval triggers wrong real-world action** — without `draft_version` and `is_current` columns, a user approving a superseded draft sends the wrong PM email. These columns must be in migration 013. Approval API must validate `WHERE draft_id = $1 AND is_current = true` and return 409 on mismatch. This cannot be retrofitted after the schema is applied.

3. **Realtime Postgres Changes does not automatically enforce row-level RLS** — Supabase documentation explicitly states: "Realtime Postgres Changes are separate from Channel authorization." All subscriptions must include `filter: user_id=eq.${userId}`, channels must use `{ config: { private: true } }`, and cross-user isolation must be verified with an integration test before shipping.

4. **Fire-and-forget executor silently dropped on Vercel cold start** — `after()` is recommended over `waitUntil()` but missions can still be silently lost. Mitigation: add a pg_cron recovery job that re-queues `pending` missions with `created_at > 5 minutes`. Set `status = running` inside the executor, not in the HTTP route.

5. **PM contact tool scraping from Apartments.com/Zillow violates ToS and will be blocked** — the only safe source for PM contact in v1.2 is `listings.contact_email` and the existing `landlords` table. For listings without contact info, generate a template + deep link; never scrape third-party listing sites.

6. **Supabase Realtime 200-connection free tier limit hit with per-mission channels** — one channel per mission card exhausts the limit with ~20 concurrent users with multiple tabs. Use a single per-user channel for mission status and one active-mission channel for logs.

7. **pg_cron `job_run_details` table bloat silently kills all cron jobs on free tier** — include a daily cleanup cron job in migration 013. Run expiry/recovery cron jobs at >= 15-minute intervals, not 1-5 minutes.

## Implications for Roadmap

Based on research, the dependency graph is clear and maps directly to a 5-phase build order. The architecture research provides an explicit suggested build order; the features research confirms all 9 P1 items; and the pitfalls research identifies which phase each risk must be addressed in.

### Phase 1: DB Foundation + HITL Schema
**Rationale:** The `missions` table is the prerequisite for every other v1.2 feature. HITL versioning columns (`draft_version`, `is_current`) must be in this migration — they cannot be retrofitted safely. The pg_cron cleanup job must also be here. Nothing else can start until this migration is applied and verified.
**Delivers:** Migration 013 (4 tables + RLS + Realtime publications + pg_cron cleanup job + indexes); updated `concierge-types.ts` aligned to DB column names; removal of mock-specific type fields
**Addresses:** Missions DB schema (P1 table stakes), HITL draft versioning (safety prerequisite)
**Avoids:** Pitfall 2 (stale draft approval — `draft_version` and `is_current` must be schema-level decisions), Pitfall 7 (pg_cron bloat — cleanup job included in initial migration), Pitfall 4 (recovery cron job for stuck pending missions included here)

### Phase 2: Real Tool Integrations
**Rationale:** The 3 real tool handlers are fully independent of the missions schema. They can be built, tested, and merged before the executor exists. When the executor is built in Phase 3, it immediately calls tools that return real data. This phase also forces the caching strategy and PM contact source decisions to be locked in before any agentic code is written.
**Delivers:** `getReviews` with Google Places API (New) + Tavily fallback + 24h cache in `landlords.review_cache`; `getNeighborhoodInfo` with Walk Score + Google Places `nearbySearch` + Tavily + 7-day cache; `contactPm` with `listings.contact_email` + Gemini-drafted message (no outbound send); unit tests for each handler mocking external APIs
**Uses:** `@googlemaps/places` v2.3.0, Walk Score REST API, existing Tavily `@tavily/core`, existing `landlords` table
**Avoids:** Pitfall 5 (PM scraping ToS — contacts from `listings.contact_email` only), Pitfall 6 (review API cost + caching ToS — 24h cache layer must be in place before real API keys are activated)

### Phase 3: Mission Executor Backend
**Rationale:** Requires Phase 1 schema and Phase 2 real tools. This is the architectural linchpin — the 202 pattern, service role client usage, `after()` fire-and-forget, agentic loop with max_turns counter, and HITL checkpoint ("park at `waiting_approval`") must all be correct before UI wiring begins. The executor design constraint is that it must be able to park mid-execution and resume from `draft_payload` state; this is not a UI concern.
**Delivers:** `packages/ai/src/mission-executor.ts` (agentic loop, `appendLog()`, `waitForApproval()`, steering checks, 8-turn cap); `packages/ai/src/mission-types.ts` (MissionContext, SteeringIntent types); `POST /api/missions` (auth + idempotency + DB insert + `void runMission()` + 202); `GET /api/missions/[id]`; `POST /api/missions/[id]/approve`; integration test: create mission -> verify log rows appear in DB -> verify status transitions
**Implements:** Fire-and-forget async with 202 Accepted, append-only execution log with Realtime push, HITL draft approval with Realtime unblock, service role executor pattern
**Avoids:** Pitfall 1 (Gemini 2.5 Flash function/schema conflict — separation pattern established here for all executor calls), Pitfall 3 (Gemini infinite loop — max_turns counter and terminal tool response format enforced from day one), Pitfall 4 (cold start recovery — `status = running` set inside executor, not in route)

### Phase 4: Steering Bar Backend
**Rationale:** Depends on Phase 3 (executor must exist to consume steering intents from `mission_steerings`). A single Gemini function-calling turn classifies free-text into a `SteeringIntent` enum; the executor polls for unapplied steerings at loop top. This phase also confirms the function-calling-only pattern for classification calls (no responseSchema), reinforcing the separation established in Phase 3.
**Delivers:** `POST /api/steering` route (single Gemini classify turn -> `mission_steerings` DB write); executor modified to poll for unapplied steerings; `SteeringBar.tsx` wired to POST (replaces toast-only behavior); unit tests for 5 representative steering input samples (pause, redirect, adjust, abort, accelerate)
**Avoids:** Pitfall 1 (Gemini 2.5 Flash function+schema conflict — steering uses function calling only, never responseSchema)

### Phase 5: Realtime UI Wiring
**Rationale:** Last phase because it requires Phases 1-4 all working. `ConciergeProvider` is the sole component requiring substantive change — dropping `useState(mockMissions)`, adding initial Supabase fetch, adding 3 Realtime channels, and adding reconnect handling. All 6 child components (`MissionCard`, `MissionDetail`, `ExecutionLogs`, `AgentSummary`, `MissionSuggestions`, `ConciergeSidebar`) require zero structural changes once fed real data.
**Delivers:** `ConciergeProvider.tsx` with initial Supabase fetch + 3 Realtime channels + polling fallback on reconnect + dedup merge by `id`; `MissionActionCard.tsx` approve/reject handlers wired to `POST /api/missions/[id]/approve`; `mock-missions.ts` deleted; E2E test: create mission in UI -> verify live log updates -> approve draft -> verify email drafted (Resend sandbox)
**Avoids:** Pitfall 5 (200-connection limit — single per-user channel architecture for mission status), Pitfall 6 (Realtime RLS bypass — private channel + `filter: user_id=eq.X` + cross-user isolation integration test required before phase completion)

### Phase Ordering Rationale

- **Schema precedes everything** because 8 of 9 P1 features depend on the `missions` table or its related tables. Retrofitting HITL versioning columns after the executor is written is the most dangerous and expensive mistake in this milestone.
- **Real tool integrations are independent** — they replace stubs in the existing `executeTool()` registry with no executor changes needed. Building them in Phase 2 means Phase 3 integration tests use real data from day one.
- **Executor precedes UI wiring** — all 6 concierge child components are already prop-based and need zero structural changes. Wiring them before the backend exists creates double mock-replacement debt.
- **Gemini 2.5 Flash's function/schema incompatibility** is an architectural constraint that must be established in Phase 3 and consistently applied in Phase 4. Discovering it mid-Phase 5 during UI wiring would require executor rewrites at the worst possible moment.
- **Realtime cross-user isolation** is a security concern that must be verified with an integration test before Phase 5 ships, not discovered post-deployment.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Mission Executor):** The `after()` + Vercel function duration interaction under realistic multi-step mission timing needs validation against actual Gemini + external API latency. If missions regularly exceed 60s, the pgmq queue alternative should be re-evaluated over pure fire-and-forget. The pg_cron recovery job timing (5-minute threshold for stuck `pending` missions) needs calibration.
- **Phase 5 (Realtime UI):** Supabase Realtime `private` channel configuration and the exact JWT-passing pattern for `postgres_changes` authorization needs verification against the current `@supabase/supabase-js` 2.47.x API — docs have historically lagged SDK changes in this area.

Phases with standard patterns (skip additional research):
- **Phase 1 (DB Schema):** The 4-table schema, RLS policies, Realtime publications, and pg_cron cleanup job are fully specified in ARCHITECTURE.md with complete SQL. No ambiguity.
- **Phase 2 (Real Tools):** Google Places API (New), Walk Score REST, and Tavily Extract are fully documented in STACK.md and FEATURES.md with concrete request/response shapes and env var requirements.
- **Phase 4 (Steering Bar):** Single Gemini function-calling turn with a defined 5-action enum schema is a straightforward extension of the existing CribAI tool-calling pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack decisions verified against official Vercel, Next.js, and Supabase docs. `after()` stable since v15.1.0 confirmed in Next.js changelog. `@googlemaps/places` v2.3.0 verified on npm. Tavily and Supabase Realtime confirmed working in production codebase. |
| Features | HIGH | All 9 P1 features derived from direct inspection of the v1.1 UI mock and codebase. Dependency graph is explicit and complete. Anti-features have clear rationale (Yelp ToS, LangGraph complexity, PM scraping legality). Walk Score API free tier verified against official docs. |
| Architecture | HIGH | Based on direct codebase inspection of all 9 concierge components, the existing CribAI agentic loop, the `notification-bell.tsx` Realtime pattern, and all existing migrations. No speculation — every pattern is drawn from proven production code in the same project. |
| Pitfalls | HIGH | Gemini 2.5 Flash function/schema incompatibility verified via Google AI forum and googleapis GitHub issues. Supabase Realtime RLS bypass documented in official Supabase docs. pg_cron bloat confirmed via community reports. HITL stale draft risk cross-referenced across multiple 2025-2026 HITL pattern sources. |

**Overall confidence:** HIGH

### Gaps to Address

- **Walk Score API key provisioning**: Not yet confirmed as provisioned. Validate before Phase 2 begins. Free tier is 5,000 requests/day — confirm this covers expected mission volume.
- **Resend sender domain verification**: `resend` requires a verified sender domain before production emails can be sent. If HITL email notifications are in v1.2 scope, domain verification must happen before Phase 3 executor testing, not after.
- **`after()` duration under real conditions**: The actual wall clock duration of a full search -> shortlist -> PM contact draft mission under real Gemini and external API latency is unknown. The pg_cron recovery job (re-queue stuck `pending` missions after 5 minutes) is the durability backstop — validate that `after()` is sufficient in Phase 3 before deprioritizing the pgmq queue alternative.
- **Supabase Realtime private channel JWT pattern**: The exact `{ config: { private: true } }` + JWT-passing syntax for `postgres_changes` subscriptions in `@supabase/supabase-js` 2.47.x should be verified against the current SDK version before Phase 5 implementation, as docs have lagged SDK changes in this area historically.

## Sources

### Primary (HIGH confidence)
- [Next.js `after()` docs](https://nextjs.org/docs/app/api-reference/functions/after) — stable in v15.1.0, Route Handler support, maxDuration interaction
- [Vercel `@vercel/functions` reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package) — `after()` is the recommended replacement for deprecated `waitUntil()` in Next.js >= 15.1
- [Vercel function duration limits](https://vercel.com/docs/functions/limitations) — 60s Hobby, 300s Fluid Compute
- [Supabase Realtime Postgres Changes docs](https://supabase.com/docs/guides/realtime/postgres-changes) — `postgres_changes` filter syntax, RLS enforcement behavior
- [Supabase Realtime Authorization docs](https://supabase.com/docs/guides/realtime/authorization) — private channel configuration, JWT requirements
- [Supabase Realtime Limits docs](https://supabase.com/docs/guides/realtime/limits) — 200 concurrent connections, 100 messages/second free tier
- [Supabase Edge Functions Limits docs](https://supabase.com/docs/guides/functions/limits) — wall clock limits (150s free, 400s paid)
- [`@googlemaps/places` npm](https://www.npmjs.com/package/@googlemaps/places) — v2.3.0, Places API (New) client
- [Google Places API AI summaries](https://developers.google.com/maps/documentation/places/web-service/area-summaries) — `neighborhoodSummary`, `generativeSummary` fields
- [Walk Score API docs](https://www.walkscore.com/professional/api.php) — REST endpoint, free tier limits, caching ToS
- Codebase direct inspection: `packages/ai/src/cribai.ts`, `tools/executor.ts`, all 9 concierge components, `notification-bell.tsx`, migration 007 — all patterns drawn from production code

### Secondary (MEDIUM confidence)
- [Gemini 2.5 Flash stuck in tool call loop — Google AI forum](https://discuss.ai.google.dev/t/gemini-2-5-flash-stuck-in-a-tool-call-loop-when-using-both-tools-and-structured-output/110777) — confirmed function+responseSchema incompatibility
- [googleapis/python-genai #706](https://github.com/googleapis/python-genai/issues/706) — Gemini 2.5 inconsistent structured outputs
- [Tavily Extract docs](https://docs.tavily.com/documentation/api-reference/endpoint/extract) — extract endpoint for structured web content from URLs
- [Resend Node.js docs](https://resend.com/docs/send-with-nodejs) — npm package, free tier, React Email integration
- [Human-in-the-loop best practices — permit.io](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo) — HITL draft versioning patterns
- [Designing for agentic AI — Smashing Magazine 2026](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/) — UX patterns for HITL, expiry countdown, steering bar feedback

### Tertiary (LOW confidence)
- [Is scraping Zillow legal — SoftwarePair](https://softwarepair.com/is-scraping-zillow-legal/) — ToS analysis for PM contact scraping; legal interpretation, not official guidance
- [Yelp API pricing plans](https://docs.developer.yelp.com/docs/plans) — cost projection for review API calls per mission; actual pricing tiers subject to change

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*
