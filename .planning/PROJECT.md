# CampusNest

## What This Is

An AI-native off-campus housing platform for college students. CampusNest replaces traditional real estate agents with an AI-powered chat search experience — students describe what they're looking for in natural language and get relevant, ranked listings with semantic understanding of qualitative preferences (not just price and beds). The platform aggregates listings from multiple sources (scraped + manual) across target campuses.

## Core Value

Students can find off-campus housing through conversational AI search that understands what they actually want — eliminating the need for real estate agents in the student housing market.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inferred from existing codebase. -->

- ✓ Monorepo with shared type system (Zod schemas for all domain entities) — existing
- ✓ CribAI agentic chat engine with Gemini function calling (6 tools, SSE streaming) — existing
- ✓ PageIndex hierarchical RAG for listing context retrieval — existing
- ✓ Block-based chat UI (listing cards, comparison tables, tour confirmations, legal disclaimers) — existing
- ✓ Supabase schema with RLS, campus-scoped multi-tenancy (11 tables) — existing
- ✓ Apartments.com scraper with Crawlee/Playwright and normalizer — existing
- ✓ Cost calculator, fairness scorer, price model utilities (34 tests) — existing
- ✓ Tour request system with dedup — existing
- ✓ Lease term knowledge base with legal disclaimers — existing
- ✓ Rate limiting (tier-based: free/pro/premium) — existing
- ✓ Edge functions for PageIndex rebuild, fairness recalculation, .edu verification — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Auth flow works end-to-end (magic link → callback → session → authenticated experience)
- [ ] Scraping pipeline runs reliably and populates listings for target campuses
- [ ] Semantic search ranks listings by qualitative relevance, not just numeric filters
- [ ] Students can save favorite listings and track them
- [ ] Students can get alerts on price changes for saved listings
- [ ] Students can schedule tours through the platform
- [ ] Multiple listing sources (Apartments.com + manual entry at minimum)
- [ ] Basic roommate matching (profile + preferences, AI-suggested compatible matches)
- [ ] Platform works across 3-5 target campuses
- [ ] Application tracking for students

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Property management platform — v2 milestone, build tenant side first
- PM-side automation (maintenance, security) — requires PM platform foundation
- Predictive pricing for PMs — depends on PM platform + sufficient historical data
- Group search / shared accounts — design decision needed on multi-tenant leases vs shared accounts, defer to future
- Payment processing — Stripe webhook stub exists but no v1 monetization decided
- OAuth login (Google, GitHub) — magic link sufficient for v1, .edu email verification more valuable
- Mobile app — web-first, responsive design covers mobile use cases for now
- Nationwide coverage — launching tight in 3-5 campus markets first

## Context

**What exists today:** A substantial monorepo with the AI engine, type system, scraper, utilities, and database schema built out. CribAI can chat, call tools, and stream responses. The scraper can crawl Apartments.com. However, nothing is shippable yet — auth is broken (magic link redirect issue), the scraping pipeline hasn't been run against real campuses, and the end-to-end student experience has gaps.

**Known blockers:**
- Magic link auth: clicking the email link redirects incorrectly instead of completing the session exchange
- Scraper needs to be validated against real campus targets and scheduled via GitHub Actions
- No saved listings or alerts functionality exists yet
- Roommate matching tables exist in schema (`roommate_profiles`) but no UI or matching logic

**Target markets:** 3-5 college campuses (specific schools TBD). Each campus is a separate tenant in the multi-tenant architecture.

**Competitive angle:** AI-native from day one — not a traditional listing site with search filters bolted on. The AI understands qualitative preferences ("quiet neighborhood near campus with good natural light") and ranks semantically. Long-term vision: eliminate real estate agents entirely for off-campus housing.

## Constraints

- **Tech stack**: Existing monorepo (Next.js 15 + Supabase + Gemini) — build on what's here, don't rewrite
- **AI provider**: Gemini 2.5 Flash via @google/genai — already integrated, function calling works
- **Hosting**: Vercel (web) + Supabase (DB/auth/edge) + GitHub Actions (scraper) — already configured
- **Timeline**: Targeting spring/summer for fall lease cycle relevance — students sign leases months ahead
- **Quality bar**: Startup-worthy and portfolio-worthy — ship quality, not just features
- **Data**: Listings must be real and current — stale or fake data kills trust immediately

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Gemini over Anthropic/OpenAI | Already integrated, function calling works well, cost-effective | — Pending |
| Campus-scoped multi-tenancy | Clean data isolation, scales to new schools by adding config | ✓ Good |
| PageIndex RAG over vector embeddings | Structured tree traversal gives more predictable context selection | — Pending |
| Magic link over password auth | Simpler UX, .edu verification built in, no password management | — Pending |
| Apartments.com + manual as v1 sources | Broadest coverage with lowest integration cost | — Pending |
| Free for students in v1 | Remove friction, validate usage, monetize via PM side later | — Pending |
| 3-5 campuses not nationwide | Nail the experience in tight markets before scaling | — Pending |

---
*Last updated: 2026-03-05 after initialization*
