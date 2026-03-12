# Roadmap: CampusNest

## Milestones

- ✅ **v1.0 CampusNest MVP** — Phases 1-9 (shipped 2026-03-10)
- ✅ **v1.1 UI/UX Upgrade** — Phases 10-24 (shipped 2026-03-12)
- 🚧 **v2.0 Agent Platform** — Phases 25-29 (in progress, target Spring 2026)

## Phases

<details>
<summary>✅ v1.0 CampusNest MVP (Phases 1-9) — SHIPPED 2026-03-10</summary>

- [x] Phase 1: Auth and Platform Foundation (3/3 plans) — completed 2026-03-05
- [x] Phase 2: Data Pipeline (3/3 plans) — completed 2026-03-06
- [x] Phase 3: Semantic Search (3/3 plans) — completed 2026-03-06
- [x] Phase 4: Saved Listings and Alerts (4/4 plans) — completed 2026-03-06
- [x] Phase 5: Agentic Data Pipeline + Web Search (5/5 plans) — completed 2026-03-08
- [x] Phase 6: Agent Tool Expansion + Polish (3/3 plans) — completed 2026-03-09
- [x] Phase 7: Fix E2E Test Issues + Complete V1 (4/4 plans) — completed 2026-03-10
- [x] Phase 8: Close Audit Gaps + Verify Phase 4 (2/2 plans) — completed 2026-03-10
- [x] Phase 9: V1 Integration Polish + Doc Cleanup (2/2 plans) — completed 2026-03-10

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.1 UI/UX Upgrade (Phases 10-24) — SHIPPED 2026-03-12</summary>

- [x] Phase 10: Design System Foundation — completed 2026-03-10
- [x] Phase 11: Landing Page + Auth Redesign — completed 2026-03-10
- [x] Phase 12: Explore Page — completed 2026-03-10
- [x] Phase 13: Listing Detail Redesign — completed 2026-03-10
- [x] Phase 14: Post Sublease + Profile/Saved Redesign — completed 2026-03-10
- [x] Phase 15: AI Concierge UI — completed 2026-03-10
- [x] Phase 17: Real Tool Integrations (2/2 plans) — completed 2026-03-11
- [x] Phase 18: Explore Page Wiring + Verification (2/2 plans) — completed 2026-03-11
- [x] Phase 19: Auth Flow + Route Protection (2/2 plans) — completed 2026-03-11
- [x] Phase 20: Concierge Mount + Design Cleanup (2/2 plans) — completed 2026-03-11
- [x] Phase 21: App Navigation + Auth State (2/2 plans) — completed 2026-03-12
- [x] Phase 22: Token Cleanup + Chat Multi-Campus (2/2 plans) — completed 2026-03-12
- [x] Phase 23: Chat Campus Context + Profile Persistence (2/2 plans) — completed 2026-03-12
- [x] Phase 24: Listing AI Summary + Verification Sweep (3/3 plans) — completed 2026-03-12

Full details: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

</details>

### v2.0 Agent Platform (Phases 25-29)

Goal: Transform CribAI from a chatbot into a genuine housing lifecycle agent.

- [ ] **Phase 25: Wire Real Data + Tech Debt Clearance**
- [ ] **Phase 26: MissionExecutor Core + API Routes**
- [ ] **Phase 27: Housing Search Mission**
- [ ] **Phase 28: Tour Outreach Mission**
- [ ] **Phase 29: Chat-to-Mission Bridge + Concierge UI Wiring**

### Phase 25: Wire Real Data + Tech Debt Clearance
**Goal**: Kill all mock data, fix typecheck baseline, provision API keys — give Phase 26 a clean foundation with real data
**Depends on**: Phase 24
**Requirements**: V2-DATA-01, V2-DATA-02, V2-DATA-03, V2-DATA-04, V2-DATA-05
**Success Criteria**:
  1. /explore renders real listings from Supabase (no mockListings)
  2. Profile saved tab shows real saved_listings from DB
  3. Post sublease wizard persists to DB and redirects on success
  4. campusSlug exposed on ChatContextValue
  5. pnpm build exits zero with no typecheck errors

### Phase 26: MissionExecutor Core + API Routes
**Goal**: Sequential async mission runner with DB state persistence and all CRUD API routes
**Depends on**: Phase 25
**Requirements**: V2-EXEC-01, V2-EXEC-02, V2-EXEC-03
**Success Criteria**:
  1. POST /api/missions creates mission record and fires executor via after()
  2. Executor loop runs steps, logs to mission_logs, handles errors with fail-safe
  3. GET /api/missions returns user's missions; GET /api/missions/[id] returns detail + logs
  4. HITL pause: executor sets status to awaiting_approval and returns when draft generated
  5. pnpm build exits zero

### Phase 27: Housing Search Mission
**Goal**: End-to-end housing search pipeline — search → research top 5 → rank → shortlist report in Concierge UI
**Depends on**: Phase 26
**Requirements**: V2-HSM-01, V2-HSM-02, V2-HSM-03
**Success Criteria**:
  1. Housing search mission runs all steps (search, research, rank, report) via MissionExecutor
  2. Each listing researched: Google Places reviews + Walk Score + fairness score + true cost
  3. Shortlist rendered in Concierge UI as structured result card
  4. Composite ranking score computed from 4 weighted dimensions
  5. pnpm build exits zero

### Phase 28: Tour Outreach Mission
**Goal**: Draft personalized tour request emails, HITL approval gate, send via Resend API
**Depends on**: Phase 26
**Requirements**: V2-TOUR-01, V2-TOUR-02, V2-TOUR-03
**Success Criteria**:
  1. Tour outreach mission generates Gemini-drafted email per selected listing
  2. Drafts shown in Concierge UI with edit/approve/reject per email
  3. Approved drafts sent via Resend API; mission_draft marked approved
  4. Rejected drafts marked rejected; student can restart with custom note
  5. pnpm build exits zero

### Phase 29: Chat-to-Mission Bridge + Concierge UI Wiring
**Goal**: CribAI detects housing search intent and proposes mission creation; Concierge UI wired to real mission data with live Supabase Realtime updates
**Depends on**: Phase 27, Phase 28
**Requirements**: V2-BRIDGE-01, V2-BRIDGE-02, V2-BRIDGE-03, V2-CONCIERGE-01, V2-CONCIERGE-02
**Success Criteria**:
  1. CribAI detects housing search intent with confidence > 0.75 and proposes mission in chat
  2. Student confirms in chat → mission created → executor fires in background
  3. Concierge sidebar shows real missions from DB (no mock-missions.ts)
  4. Mission status, logs, and drafts update live via Supabase Realtime without page refresh
  5. SteeringBar wired to POST /api/missions/[id]/steer
  6. HITL draft approval/rejection wired to draft approve/reject API routes
  7. pnpm build exits zero

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1-9 (9 phases) | v1.0 | 29/29 | Complete | 2026-03-10 |
| 10-24 (13 phases) | v1.1 | 17/17 GSD plans | Complete | 2026-03-12 |
| 25-29 (5 phases) | v2.0 | 0/0 | In Progress | — |
