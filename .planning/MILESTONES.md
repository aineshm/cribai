# Milestones

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

## v1.1 UI/UX Upgrade (Shipped: 2026-03-10)

**Phases completed:** 6 phases (10-15)

**Timeline:** 2026-03-10 | 6 commits
**Git range:** 2a6ed8e..f345552

**Key accomplishments:**
1. Design system migration: Space Grotesk + DM Sans fonts, shadcn/ui primitives, Lucide icons, Framer Motion
2. Marketing landing page with hero, social proof, features, how-it-works, CTA
3. Auth page redesign: split layout with branded panel + animated multi-step OTP flow
4. Explore page: unified split view (listings 60% + map 40%) with filter chips + floating AI chat panel
5. Listing detail redesign: photo gallery grid, lightbox, 2-column layout, sticky CTA, AI lease summary
6. Post sublease wizard with sidebar progress tracker + combined profile/saved/settings tabbed page
7. AI Concierge UI: mission sidebar, action cards, execution logs, steering bar, proactive suggestions (mock data)

**Tech debt accepted:**
- AI Concierge is UI-only with mock data — real backend deferred to v1.2
- STATE.md not updated during execution (phases committed outside GSD workflow)

---

