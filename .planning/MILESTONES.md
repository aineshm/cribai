# Milestones

## v1.1 UI/UX Upgrade (Shipped: 2026-03-12)

**Phases completed:** 13 phases (10-24), 17 GSD plans
**Timeline:** 2 days (Mar 10-12, 2026) | 164 commits | 161 files | +15,124/-740 LOC TypeScript
**Git range:** v1.0-mvp..294b90b
**Audit:** tech_debt — 34/34 requirements satisfied, 4 non-blocking items

**Key accomplishments:**
1. Design system migration: Space Grotesk + DM Sans fonts, shadcn/ui primitives, Lucide icons, framer-motion — unblocking all UI phases
2. Marketing landing page with hero, social proof, features, how-it-works, CTA + auth-aware returning user state
3. Auth page redesign: split layout with branded panel + animated multi-step OTP flow with profile persistence to Supabase
4. Explore page: unified split view (listings 60% + map 40%) with filter chips + campus-scoped floating CribAI chat panel
5. Listing detail redesign: photo gallery grid with lightbox, sticky 2-column CTA sidebar, AI lease summary prose, commute section, mobile sticky bar
6. Post sublease wizard with sidebar progress + combined profile/saved/settings tabbed page
7. AI Concierge UI: mission-based sidebar, action cards, HITL draft approval, steering bar, proactive empty state (mock data)
8. Walk Score + Google Places tool integrations replacing placeholder stubs for real neighborhood data
9. Full cross-phase wiring: auth-gated routes, campus-aware ChatProvider, ConciergeShell in (main) layout, ListingCard navigation
10. Retroactive verification sweep: VERIFICATION.md + Nyquist validation for all 13 phases, 34/34 requirements documented

**Tech debt accepted:**
- campusSlug not exposed in ChatContextValue — AIChatPanel block links use empty slug (non-breaking)
- StepReview.tsx: toast only, no /api/submit-listing fetch — wizard data not persisted
- auth/confirm reads ?next=, middleware writes ?returnTo= — both default to /explore (non-breaking)
- Crime data deferred to v1.2 — Walk Score + Google Places only per original scope

---

## v1.0 CampusNest MVP (Shipped: 2026-03-10)

**Phases completed:** 10 phases, 30 plans, 5 tasks

**Timeline:** 7 days (Mar 3-10, 2026) | 263 commits | 360 files | ~23,800 LOC TypeScript
**Git range:** 13da4fd..9066ca0

**Key accomplishments:**
1. OTP auth with .edu validation, profile system, and multi-campus architecture (UW Madison launch)
2. Multi-source scraper pipeline (Apartments.com, Zillow, Craigslist) with nightly GitHub Actions automation
3. Semantic search via pgvector + Gemini embeddings with hybrid SQL filters and interactive Mapbox maps
4. Saved listings with real-time price change notifications via Supabase Realtime
5. CribAI agentic chat: 11 Gemini function-calling tools including live web search (Tavily), tour scheduling, lease term KB
6. DB-backed conversation persistence with sidebar, manual listing submission form, and full middleware protection

**Tech debt accepted:**
- 3 placeholder tools (get_reviews, contact_pm, get_neighborhood_info) — coming soon stubs
- submit-listing API lacks dev auth bypass (production unaffected)
- Manual listings not in semantic search until nightly embedding cycle
- Orphaned 07-scraper-fix/ directory (never executed)

---

