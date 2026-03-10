# CampusNest

## What This Is

An AI-native off-campus housing platform for college students. CampusNest replaces traditional listing sites with CribAI — a conversational AI assistant that understands qualitative preferences ("quiet place near campus with natural light"), searches semantically across multi-source listings, researches the web in real-time when the corpus is thin, and helps schedule tours. Launched with UW Madison as the primary campus.

## Core Value

Students can find off-campus housing through conversational AI search that understands what they actually want — eliminating the need for real estate agents in the student housing market.

## Requirements

### Validated

- ✓ OTP auth with .edu email validation and session persistence — v1.0
- ✓ Optional profile creation with skip, editable from settings — v1.0
- ✓ Multi-source scraper pipeline (Apartments.com, Zillow, Craigslist) with nightly automation — v1.0
- ✓ Semantic search via pgvector + Gemini embeddings with hybrid SQL filters — v1.0
- ✓ Interactive Mapbox map blocks in CribAI chat — v1.0
- ✓ Save/favorite listings with dedicated page — v1.0
- ✓ Real-time price change notifications via Supabase Realtime — v1.0
- ✓ Photo galleries and freshness indicators on listing detail pages — v1.0
- ✓ CribAI with 11 function-calling tools (search, web search, compare, tour, lease terms, etc.) — v1.0
- ✓ DB-backed conversation persistence with sidebar navigation — v1.0
- ✓ Manual listing submission form for landlords/students — v1.0
- ✓ Tour scheduling with calendar conflict detection — v1.0
- ✓ UW Madison as primary campus with multi-campus architecture — v1.0
- ✓ Responsive mobile design with hamburger nav — v1.0
- ✓ Stale listing detection and archival lifecycle — v1.0
- ✓ Nightly GitHub Actions pipeline (scrape → embed → PageIndex rebuild) — v1.0

### Active

- [ ] Real review integration (Reddit, Google Maps, Yelp) — replacing placeholder tools
- [ ] Real PM contact integration — replacing placeholder tool
- [ ] Real neighborhood info (Walk Score API, crime data) — replacing placeholder tool
- [ ] On-demand embedding trigger for manual listing submissions
- [ ] Traditional filter UI alongside AI chat
- [ ] Basic roommate matching (profile + preferences)
- [ ] Expand to 2-3 additional campuses

### Out of Scope

- Property management platform — v2+, build tenant side first
- PM-side automation (maintenance, security) — requires PM platform
- Predictive pricing — needs PM platform + sufficient historical data
- Group search / shared accounts — design decision needed, defer
- Payment processing — no v1 monetization decided
- OAuth login — OTP sufficient, .edu verification more valuable
- Mobile native app — web-first, responsive covers mobile
- Nationwide coverage — nail tight markets first

## Context

**Shipped:** v1.0 MVP on 2026-03-10 (7 days, 263 commits, ~23,800 LOC TypeScript)
**Tech stack:** Next.js 15 (App Router) + Supabase (PostGIS, RLS, Realtime, Edge Functions) + Gemini 2.5 Flash + Tavily + Mapbox + Crawlee/Playwright
**Deployment:** Vercel (web) + Supabase (DB/auth) + GitHub Actions (scraper pipeline)

**Known tech debt:**
- 3 placeholder tools (reviews, PM contact, neighborhood) return "coming soon" stubs
- Manual listings don't appear in semantic search until nightly embed cycle
- submit-listing API lacks dev auth bypass (production unaffected)
- Orphaned 07-scraper-fix/ planning directory

**What's next:** Real tool integrations (reviews, neighborhood data), additional campuses, roommate matching.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Gemini over Anthropic/OpenAI | Already integrated, function calling works well, cost-effective | ✓ Good — 11 tools work reliably |
| Campus-scoped multi-tenancy | Clean data isolation, scales to new schools by adding config | ✓ Good |
| PageIndex RAG + pgvector hybrid | Structured tree for context, vector for semantic search | ✓ Good — both serve different needs |
| OTP over magic links | University email security blocked magic link URLs | ✓ Good — strict improvement |
| Multi-source scraping (Zillow + CL) | Broadest coverage, Google Places removed (buildings not listings) | ✓ Good |
| Tavily for web search | Low-latency, structured results, session cache for dedup | ✓ Good |
| Placeholder tools for v1 breadth | Demonstrates agent capabilities, real integrations in v2 | ✓ Good — UX communicates "coming soon" |
| DB conversations + sessionStorage fallback | Auth users get persistence, guests get tab-scoped chat | ✓ Good |
| Free for students in v1 | Remove friction, validate usage, monetize via PM side later | — Pending |

## Constraints

- **Tech stack**: Monorepo (Next.js 15 + Supabase + Gemini) — build on what's here
- **AI provider**: Gemini 2.5 Flash via @google/genai — function calling proven
- **Hosting**: Vercel + Supabase + GitHub Actions — configured and working
- **Timeline**: Spring/summer for fall lease cycle relevance
- **Quality bar**: Startup-worthy and portfolio-worthy
- **Data**: Listings must be real and current — stale data kills trust

---
*Last updated: 2026-03-10 after v1.0 milestone*
