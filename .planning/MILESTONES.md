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

