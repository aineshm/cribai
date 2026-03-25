# Roadmap: CribAI (formerly CampusNest)

## Milestones

- ✅ **v1.0 CampusNest MVP** — Phases 1-9 (shipped 2026-03-10)
- ✅ **v1.1 UI/UX Upgrade** — Phases 10-24 (shipped 2026-03-12)
- ✅ **v2.0 Agent Platform** — Phases 25-29 + SP1-SP3 + polish (shipped 2026-03-19, polished through 2026-03-24)

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

<details>
<summary>✅ v2.0 Agent Platform — SHIPPED 2026-03-19, polished through 2026-03-24</summary>

### GSD Phases (completed via .planning framework)
- [x] Phase 25: Wire Real Data + Tech Debt Clearance — completed 2026-03-13
- [x] Phase 26: MissionExecutor Core + API Routes — completed 2026-03-13
- [x] Phase 27: Housing Search Mission — completed 2026-03-14
- [x] Phase 28: Tour Outreach Mission — completed 2026-03-14
- [x] Phase 29: Chat-to-Mission Bridge + Concierge UI Wiring — completed 2026-03-14

### Sub-Projects (completed via superpowers framework)
- [x] SP1: CribAI Rebrand + Nav + Chat Inbox — completed 2026-03-18
- [x] SP2: Mission-Backed Tools (listing_deep_dive + sublease_post pipelines) — completed 2026-03-19
- [x] SP3: Listing Creator Edit + Photo Upload — completed 2026-03-19

### Bug Fixes & Polish (2026-03-14 to 2026-03-20)
- [x] Mobile-first UI redesign (Figma Make → Next.js) — deployed 2026-03-16
- [x] Launch blockers: guest AI, listing CTAs, tour booking, auth flows — fixed 2026-03-15
- [x] RLS fix: My Listings + creator read access (migration 029) — fixed 2026-03-20
- [x] Sublease AI access: server-side listing pre-fetch + inline embeddings — fixed 2026-03-20
- [x] Server-side chat persistence (3-lite, migration 030) — shipped 2026-03-20
- [x] Conversation ownership verification — fixed 2026-03-20

### Post-v2.0 Polish (2026-03-20 to 2026-03-24)
- [x] AI behavior: action-first, no interviewing, sublease awareness
- [x] Prompt condensing: smaller Gemini prompts for speed/cost
- [x] UI/UX audit: 10 fixes across explore, listing, auth, map, landing
- [x] Map popup z-index fixes (3 commits)
- [x] Explore listing limit: 500 → 3000 (subleases were cut off)
- [x] Search: prefer Zillow + sublease over Craigslist
- [x] Better listing titles + cleaner "Ask AI" prompt
- [x] OTP email trim, skip geo fallback with mapBounds

</details>

## Progress

| Milestone | Phases | Plans/Commits | Status | Completed |
|-----------|--------|---------------|--------|-----------|
| v1.0 MVP | 9 | 29 plans | Complete | 2026-03-10 |
| v1.1 UI/UX | 13 | 17 plans | Complete | 2026-03-12 |
| v2.0 Agent | 5 + 3 SPs | ~14 plans + 14 polish commits | Complete | 2026-03-24 |

**Total:** 607 commits, 30 migrations, 2,509 listings

## What's Next (Not Yet Planned)

### If Validated (April 2026)
- Full async chat (job queue, Realtime subscriptions, incremental persistence)
- Email notifications ("your listing got 5 views today")
- Google Places property discovery + website scraping (PDR-002)

### Growth Features (Summer 2026)
- Roommate matching (DB table exists, unused)
- Price alerts
- Lease PDF analysis

### Scale (Fall 2026)
- Multi-campus expansion (2-3 campuses)
- PM-side MVP (lead inbox)
- First PM revenue (lead gen pricing)

### Long-term (2027+)
- Full PM SaaS platform
- Agent-to-agent communication protocol
- Generative UI in chat
- Mobile app
- Nationwide coverage
