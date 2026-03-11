# Roadmap: CampusNest

## Milestones

- ✅ **v1.0 CampusNest MVP** -- Phases 1-9 (shipped 2026-03-10)
- ✅ **v1.1 UI/UX Upgrade** -- Phases 10-15 (shipped 2026-03-10)
- 🚧 **v1.2 Native Agent Backend** -- Phases 16-20 (in progress)

## Phases

<details>
<summary>v1.0 CampusNest MVP (Phases 1-9) -- SHIPPED 2026-03-10</summary>

- [x] Phase 1: Auth and Platform Foundation (3/3 plans) -- completed 2026-03-05
- [x] Phase 2: Data Pipeline (3/3 plans) -- completed 2026-03-06
- [x] Phase 3: Semantic Search (3/3 plans) -- completed 2026-03-06
- [x] Phase 4: Saved Listings and Alerts (4/4 plans) -- completed 2026-03-06
- [x] Phase 5: Agentic Data Pipeline + Web Search (5/5 plans) -- completed 2026-03-08
- [x] Phase 6: Agent Tool Expansion + Polish (3/3 plans) -- completed 2026-03-09
- [x] Phase 7: Fix E2E Test Issues + Complete V1 (4/4 plans) -- completed 2026-03-10
- [x] Phase 8: Close Audit Gaps + Verify Phase 4 (2/2 plans) -- completed 2026-03-10
- [x] Phase 9: V1 Integration Polish + Doc Cleanup (2/2 plans) -- completed 2026-03-10

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>v1.1 UI/UX Upgrade (Phases 10-15) -- SHIPPED 2026-03-10</summary>

- [x] Phase 10: Design System Foundation (DESIGN-01 through DESIGN-05, COMPAT-01)
- [x] Phase 11: Landing Page + Auth Redesign (LAND-01 through LAND-04, AUTH-05, AUTH-06)
- [x] Phase 12: Explore Page (EXPL-01 through EXPL-05)
- [x] Phase 13: Listing Detail Redesign (DETAIL-01 through DETAIL-05)
- [x] Phase 14: Post Sublease + Profile/Saved Redesign (POST-01 through POST-03, PROF-01 through PROF-03)
- [x] Phase 15: AI Concierge UI (AGENT-01 through AGENT-06)

</details>

### 🚧 v1.2 Native Agent Backend (In Progress)

**Milestone Goal:** Build the real backend for the AI Concierge -- mission executor, DB schema with HITL draft approval, Realtime status updates, steering bar intent parsing, real tool integrations, and agent memory -- wiring the v1.1 mock UI to a live agentic pipeline.

- [x] **Phase 16: Missions DB Schema** - Migration 013 with 4 tables, RLS, Realtime publications, pg_cron cleanup, and aligned TypeScript types (completed 2026-03-11)
- [ ] **Phase 17: Real Tool Integrations** - Replace 3 placeholder tools with Google Places reviews, Walk Score neighborhood info, and PM contact draft generation
- [ ] **Phase 18: Mission Executor + HITL Approval** - Async fire-and-forget executor with agentic loop, Realtime log push, and draft approval gate for irreversible actions
- [ ] **Phase 19: Steering + Agent Memory** - Steering bar intent parsing via Gemini function calling and cross-session preference memory for personalized results
- [ ] **Phase 20: UI Wiring + Production Readiness** - Wire Concierge UI to real backend, delete mock data, handle error states, deploy with fresh data

## Phase Details

### Phase 16: Missions DB Schema
**Goal**: The database foundation for all mission-related features is live -- four tables with RLS, Realtime publications, HITL draft versioning columns, pg_cron cleanup jobs, and TypeScript types aligned to DB column names -- unblocking executor, Realtime, and UI wiring.
**Depends on**: Nothing (v1.2 starting phase -- v1.1 is complete)
**Requirements**: EXEC-03
**Success Criteria** (what must be TRUE):
  1. `missions`, `mission_logs`, `mission_drafts`, and `mission_steerings` tables exist in Supabase with RLS policies that scope all reads/writes to the authenticated user
  2. `mission_drafts` table has `draft_version` and `is_current` columns for safe HITL versioning (no stale approval bugs possible)
  3. Realtime publications are enabled on `missions`, `mission_logs`, and `mission_drafts` tables (verified via Supabase dashboard or SQL query)
  4. pg_cron cleanup job runs on schedule to expire stale missions and purge `job_run_details` bloat
  5. TypeScript types in `concierge-types.ts` match DB column names exactly (no mock-only fields remain)
**Plans**: 1 plan
Plans:
- [ ] 16-01-PLAN.md -- Migration 013, Zod schemas, DB-aligned TypeScript types, type tests

### Phase 17: Real Tool Integrations
**Goal**: The three placeholder tool stubs are replaced with real implementations that return live data -- Google Places reviews, Walk Score + neighborhood amenities, and PM contact info with draft inquiry messages -- cached appropriately and testable independently of the mission executor.
**Depends on**: Nothing (independent of Phase 16 -- can build in parallel)
**Requirements**: TOOLS-01, TOOLS-02, TOOLS-03
**Success Criteria** (what must be TRUE):
  1. Reviews tool returns real Google Places ratings and at least 3 recent reviews for a known UW-Madison property (not "coming soon" stub text)
  2. Neighborhood info tool returns Walk Score (walk/transit/bike) and nearby amenities from Google Places for a given listing address
  3. PM contact tool returns contact data from the `landlords` table and a Gemini-generated draft inquiry message (no outbound email sent)
  4. All three tools cache results (reviews at 24h TTL, neighborhood at 7-day TTL) to avoid redundant API calls
  5. Each tool handler has unit tests that mock external APIs and verify the response shape matches the existing `ToolResult` interface
**Plans**: 2 plans
Plans:
- [ ] 17-01-PLAN.md -- DB migration (api_cache table, landlord contacts, listings FK) + shared lib modules (cache, Google Places, Walk Score) with tests
- [ ] 17-02-PLAN.md -- Rewrite 3 stub tool handlers (get-reviews, get-neighborhood-info, contact-pm) with real API integrations and tests

### Phase 18: Mission Executor + HITL Approval
**Goal**: Users can create missions that execute asynchronously -- the executor runs a multi-step agentic loop using existing CribAI tools, writes append-only logs pushed via Realtime, and pauses at irreversible actions (tour scheduling) for user approval before proceeding.
**Depends on**: Phase 16 (schema), Phase 17 (real tools)
**Requirements**: EXEC-01, EXEC-02, EXEC-04, HITL-01, HITL-02
**Success Criteria** (what must be TRUE):
  1. User creates a mission from the Concierge page and receives an immediate response (202 Accepted) while the executor runs in the background via `after()`
  2. Mission executor runs a multi-step agentic loop (search, filter, shortlist) reusing existing CribAI tools with a max-turns cap to prevent infinite loops
  3. Mission status updates and execution logs appear in the UI in real-time via Supabase Realtime (no polling, no page refresh needed)
  4. Executor pauses at irreversible actions and writes a draft; user can approve, edit, or reject the draft from the mission detail view
  5. Approving a stale draft (superseded by a newer version) returns an error instead of executing the wrong action
**Plans**: TBD

### Phase 19: Steering + Agent Memory
**Goal**: Users can course-correct running missions via natural language steering and CribAI remembers user preferences across sessions -- so the agent gets smarter with use and responds to mid-mission corrections without requiring mission restart.
**Depends on**: Phase 18 (executor must exist to consume steering intents)
**Requirements**: STEER-01, STEER-02, MEM-01, MEM-02
**Success Criteria** (what must be TRUE):
  1. User types a correction in the steering bar (e.g., "actually under $900") and the running mission adjusts its behavior accordingly
  2. Gemini parses steering input into a structured intent (modify constraint, change goal, pause, cancel) via function calling -- not free-text passthrough
  3. Agent recalls user preferences from previous sessions (e.g., "prefers quiet neighborhoods") without the user repeating them
  4. Search results and recommendations reflect stored preferences when the user has an established history
**Plans**: TBD

### Phase 20: UI Wiring + Production Readiness
**Goal**: The Concierge UI is fully wired to the real backend with mock data deleted, all v1.1 pages work end-to-end with real data, error states are handled gracefully, and the app is deployed to Vercel with fresh listings and all API keys configured.
**Depends on**: Phase 18, Phase 19
**Requirements**: WIRE-01, WIRE-02, WIRE-03, PROD-01, PROD-02, PROD-03, PROD-04
**Success Criteria** (what must be TRUE):
  1. Concierge UI reads mission data from Supabase -- `mock-missions.ts` is deleted and no mock constants remain
  2. Mission status badges, log timeline, and draft approval cards update in real-time from backend data (not hardcoded state)
  3. Steering bar form submission calls the real steering API endpoint and the UI reflects the steering intent
  4. Scraper produces fresh UW-Madison listings and all pages (explore, listing detail, saved) render with current data and working images
  5. Failed missions, API timeouts, and empty results show user-friendly error states -- no raw errors, stack traces, or blank screens
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 16 -> 17 -> 18 -> 19 -> 20
Note: Phase 16 and 17 have no dependency on each other and can execute in parallel.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Auth and Platform Foundation | v1.0 | 3/3 | Complete | 2026-03-05 |
| 2. Data Pipeline | v1.0 | 3/3 | Complete | 2026-03-06 |
| 3. Semantic Search | v1.0 | 3/3 | Complete | 2026-03-06 |
| 4. Saved Listings and Alerts | v1.0 | 4/4 | Complete | 2026-03-06 |
| 5. Agentic Data Pipeline + Web Search | v1.0 | 5/5 | Complete | 2026-03-08 |
| 6. Agent Tool Expansion + Polish | v1.0 | 3/3 | Complete | 2026-03-09 |
| 7. Fix E2E + Complete V1 | v1.0 | 4/4 | Complete | 2026-03-10 |
| 8. Close Audit Gaps | v1.0 | 2/2 | Complete | 2026-03-10 |
| 9. Integration Polish | v1.0 | 2/2 | Complete | 2026-03-10 |
| 10. Design System Foundation | v1.1 | -/- | Complete | 2026-03-10 |
| 11. Landing Page + Auth Redesign | v1.1 | -/- | Complete | 2026-03-10 |
| 12. Explore Page | v1.1 | -/- | Complete | 2026-03-10 |
| 13. Listing Detail Redesign | v1.1 | -/- | Complete | 2026-03-10 |
| 14. Post Sublease + Profile/Saved | v1.1 | -/- | Complete | 2026-03-10 |
| 15. AI Concierge UI | v1.1 | -/- | Complete | 2026-03-10 |
| 16. Missions DB Schema | 1/1 | Complete    | 2026-03-11 | - |
| 17. Real Tool Integrations | v1.2 | 0/2 | Not started | - |
| 18. Mission Executor + HITL Approval | v1.2 | 0/TBD | Not started | - |
| 19. Steering + Agent Memory | v1.2 | 0/TBD | Not started | - |
| 20. UI Wiring + Production Readiness | v1.2 | 0/TBD | Not started | - |
