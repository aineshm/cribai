# Roadmap: CampusNest

## Milestones

- ✅ **v1.0 CampusNest MVP** — Phases 1-9 (shipped 2026-03-10)
- ✅ **v1.1 UI/UX Upgrade** — Phases 10-24 (shipped 2026-03-12)
- 📋 **v1.2** — planned

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

**Goal:** Transform CribAI from a chatbot into a genuine housing lifecycle agent.

- [ ] Phase 25: Wire Real Data + Tech Debt Clearance — Kill all mocks, fix typecheck baseline, provision API keys
- [ ] Phase 26: MissionExecutor Core + API Routes — Async sequential workflow runner + full missions API
- [ ] Phase 27: Housing Search Mission — search → research → rank → shortlist pipeline
- [ ] Phase 28: Tour Outreach Mission — fetch PM contacts → draft emails → HITL approval → Resend send
- [ ] Phase 29: Chat-to-Mission Bridge + Concierge UI Wiring — intent detection, real DB wiring, Realtime subscriptions

### Phase 25: Wire Real Data + Tech Debt Clearance

**Goal:** Kill all mocks, fix typecheck baseline, and provision API keys so Phase 26+ build on real data from day one.

### Phase 26: MissionExecutor Core + API Routes

**Goal:** Build the MissionExecutor (async sequential workflow runner with DB-first state) and all missions API routes so individual missions can plug in.

### Phase 27: Housing Search Mission

**Goal:** Implement the HousingSearchMission — search → deduplicate → research top N → rank by composite score → generate structured shortlist report.

### Phase 28: Tour Outreach Mission

**Goal:** Implement the TourOutreachMission — fetch PM contacts from selected listings, generate personalized tour request email drafts via Gemini, gate on HITL approval in Concierge UI, then send via Resend API.

### Phase 29: Chat-to-Mission Bridge + Concierge UI Wiring

**Goal:** Wire CribAI intent detection to mission creation, replace mock data in ConciergeProvider with real DB queries, and connect Supabase Realtime for live mission status updates.

### v1.2 (Planned)

Next milestone — define requirements with `/gsd:new-milestone`.

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1-9 (9 phases) | v1.0 | 29/29 | Complete | 2026-03-10 |
| 10-24 (13 phases) | v1.1 | 17/17 GSD plans | Complete | 2026-03-12 |
| 25-29 (5 phases) | v2.0 | 0/0 | Planned | — |
