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

- [ ] Design system migration: Cabinet Grotesk + Satoshi fonts, shadcn/ui primitives, Lucide icons, Framer Motion
- [ ] Marketing landing page with hero, social proof, features, how-it-works, CTA
- [ ] Auth page redesign: split layout with branded panel + animated multi-step flow
- [ ] Explore page: unified split view (listings 60% + map 40%) with filter chips + floating AI chat panel
- [ ] Listing detail redesign: photo gallery grid, 2-column layout, sticky CTA, AI lease summary, commute section
- [ ] Post sublease redesign: multi-step wizard with sidebar progress tracker
- [ ] Profile/saved redesign: combined page with profile header + tabbed saved/settings
- [ ] AI Concierge (Messages page): task-based agent missions with status pipeline, draft approval (HITL), steering bar, agent summaries

### Future

- [ ] Real review integration (Reddit, Google Maps, Yelp) — replacing placeholder tools
- [ ] Real PM contact integration — replacing placeholder tool
- [ ] Real neighborhood info (Walk Score API, crime data) — replacing placeholder tool
- [ ] On-demand embedding trigger for manual listing submissions
- [ ] Basic roommate matching (profile + preferences)
- [ ] Expand to 2-3 additional campuses
- [ ] Full agent-first backend: state machines (LangGraph/Inngest), intent parsing, generative UI
- [ ] Agentic search: NL query → LLM extraction → auto-populate filter chips → mission creation on no results

### Out of Scope

- Property management platform — v2+, build tenant side first
- PM-side automation (maintenance, security) — requires PM platform
- Predictive pricing — needs PM platform + sufficient historical data
- Group search / shared accounts — design decision needed, defer
- Payment processing — no v1 monetization decided
- OAuth login — OTP sufficient, .edu verification more valuable
- Mobile native app — web-first, responsive covers mobile
- Nationwide coverage — nail tight markets first
- Full state machine backend (LangGraph/Step Functions) — v1.1 uses simpler mission table + polling pattern
- Generative UI (AI returns component JSON) — v1.1 uses hardcoded mission cards, generative UI in v2+
- Traditional filter UI as standalone page — v1.1 integrates filters into explore page with AI chat

## Context

**Shipped:** v1.0 MVP on 2026-03-10 (7 days, 263 commits, ~23,800 LOC TypeScript)
**Tech stack:** Next.js 15 (App Router) + Supabase (PostGIS, RLS, Realtime, Edge Functions) + Gemini 2.5 Flash + Tavily + Mapbox + Crawlee/Playwright
**Deployment:** Vercel (web) + Supabase (DB/auth) + GitHub Actions (scraper pipeline)

**Known tech debt:**
- 3 placeholder tools (reviews, PM contact, neighborhood) return "coming soon" stubs
- Manual listings don't appear in semantic search until nightly embed cycle
- submit-listing API lacks dev auth bypass (production unaffected)
- Orphaned 07-scraper-fix/ planning directory

## Current Milestone: v1.1 UI/UX Upgrade

**Goal:** Migrate the entire frontend to the new Figma design system (Cabinet Grotesk + Satoshi, shadcn/ui, Lucide, Framer Motion) and introduce the AI Concierge missions page — shifting from chat-first to agent-first UX.

**Target features:**
- Design system overhaul (fonts, colors, components, icons, animations)
- New marketing landing page
- Redesigned auth, explore (split list+map), listing detail, post sublease, profile/saved pages
- AI Concierge page with task-based missions, HITL draft approval, and steering bar

**What's next (future):** Real tool integrations (reviews, neighborhood data), additional campuses, roommate matching, full agentic backend with state machines.

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
| shadcn/ui for v1.1 | Full component library, Tailwind-native, accessible, widely adopted | — Pending |
| Framer Motion for animations | Spring physics, layout animations, presence/exit — industry standard | — Pending |
| Cabinet Grotesk + Satoshi fonts | Modern geometric sans-serif pair from Figma design — youthful, clean | — Pending |
| Lucide icons over Heroicons | Tree-shakeable, better DX, matches shadcn/ui ecosystem | — Pending |
| Simple mission table over state machines | v1.1 MVP — mission status column + polling, defer LangGraph to v2 | — Pending |

## Constraints

- **Tech stack**: Monorepo (Next.js 15 + Supabase + Gemini) — build on what's here
- **AI provider**: Gemini 2.5 Flash via @google/genai — function calling proven
- **Hosting**: Vercel + Supabase + GitHub Actions — configured and working
- **Timeline**: Spring/summer for fall lease cycle relevance
- **Quality bar**: Startup-worthy and portfolio-worthy
- **Data**: Listings must be real and current — stale data kills trust

---
*Last updated: 2026-03-10 after v1.1 milestone start*
