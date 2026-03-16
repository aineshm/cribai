# CampusNest — Complete Project Info Dump

> Generated 2026-03-08 from full codebase + planning docs analysis

---

## 1. What is CampusNest?

An AI-native off-campus housing platform for college students. Replaces traditional real estate agents with **CribAI** — an agentic chat experience that understands qualitative preferences semantically, not just filters.

**Core Flow**: Student describes housing preferences in natural language → CribAI performs semantic search + web research → returns ranked listings with true cost breakdowns and lease term explanations.

**Location**: `~/Developer/ai-real-estate-agent` (moved from iCloud Drive — Turbopack crashes on iCloud filesystem)

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm 9 + Turborepo |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + PostGIS + pgvector + RLS) |
| Auth | Supabase Magic Link (email OTP, .edu validation) |
| AI | Gemini 2.5 Flash (@google/genai) — function calling for tools |
| Embeddings | Gemini embedding-001 (768d, pgvector HNSW index) |
| Web Search | Tavily API (basic depth, 8 max results, 30min cache) |
| Scraping | Zillow (__NEXT_DATA__), Craigslist (RSS), Apartments.com (Crawlee/Playwright, optional) |
| CI/CD | GitHub Actions (nightly scrape), Vercel (web hosting) |
| Testing | Vitest (unit/integration), Playwright (E2E) |
| Types | TypeScript 5.7 + Zod schemas |

---

## 3. Codebase Structure

```
ai-real-estate-agent/
├── apps/
│   └── web/                          # Next.js 15 App Router
│       ├── app/
│       │   ├── (auth)/login/         # Magic link login (.edu validation)
│       │   ├── (auth)/verify-edu/    # Email verification
│       │   ├── (campus)/[campusSlug]/
│       │   │   ├── cribai/           # Main CribAI chat interface
│       │   │   ├── listings/         # Listing grid + [id] detail page
│       │   │   ├── saved/            # Saved listings page
│       │   │   ├── dashboard/        # User dashboard (Supabase queries)
│       │   │   └── notifications/    # Price change notifications
│       │   ├── api/ai/cribai/        # SSE streaming endpoint (agentic loop)
│       │   ├── api/save-web-listing/ # POST route for web-sourced listings
│       │   ├── auth/confirm/         # Supabase auth callback
│       │   └── settings/profile/     # Profile settings
│       ├── components/
│       │   ├── chat/                 # Block-based chat UI system
│       │   │   ├── cribai-chat.tsx       # Main chat (sessionStorage persistence)
│       │   │   ├── chat-block-renderer.tsx # Discriminated union switch
│       │   │   ├── chat-listing-card.tsx
│       │   │   ├── chat-comparison-table.tsx
│       │   │   ├── chat-tour-confirmation.tsx
│       │   │   ├── chat-legal-disclaimer.tsx
│       │   │   ├── chat-map-block.tsx
│       │   │   ├── chat-web-result.tsx    # Clickable URL cards
│       │   │   └── chat-tool-indicator.tsx
│       │   ├── listing-card.tsx      # Card with heart, source citation, fairness
│       │   ├── listing-grid.tsx
│       │   ├── freshness-badge.tsx   # Emerald/amber/red age indicator
│       │   ├── heart-button.tsx      # Save/favorite toggle
│       │   ├── notification-bell.tsx # Unread count badge
│       │   └── auth-nav.tsx
│       └── tests/e2e/               # Playwright E2E tests
│
├── packages/
│   ├── types/                        # Zod schemas for all domain entities
│   │   └── src/
│   │       ├── listing.ts            # ListingSummary (with source/sourceUrl)
│   │       ├── chat.ts              # ChatBlock discriminated union (incl. web_result)
│   │       ├── campus.ts, profile.ts, tour.ts, notification.ts, etc.
│   │
│   ├── ai/                          # CribAI engine
│   │   └── src/
│   │       ├── tools/
│   │       │   ├── schemas.ts        # 7 Gemini FunctionDeclarations
│   │       │   ├── executor.ts       # Tool → handler mapping + SSE rendering
│   │       │   ├── types.ts          # ToolContext, ToolResult interfaces
│   │       │   └── handlers/
│   │       │       ├── search-listings.ts   # Hybrid SQL + semantic search
│   │       │       ├── web-search.ts        # Tavily API + persistWebListing()
│   │       │       ├── get-listing-detail.ts
│   │       │       ├── compare-listings.ts
│   │       │       ├── schedule-tour.ts
│   │       │       ├── explain-lease-term.ts
│   │       │       └── get-saved-listings.ts
│   │       ├── lib/
│   │       │   └── web-search-cache.ts  # In-memory 30min TTL cache
│   │       ├── embeddings/           # Gemini embedding pipeline
│   │       └── cli/embed.ts          # CLI for embedding generation
│   │
│   ├── supabase/                    # Client factories
│   │   ├── client.ts               # Browser client (anon key)
│   │   └── server.ts               # SSR + service role client
│   │
│   ├── utils/                       # Domain utilities
│   │   ├── cost-calculator.ts       # True cost breakdown
│   │   ├── fairness-scorer.ts       # Fair Housing Act compliance
│   │   ├── price-model.ts          # Rent prediction
│   │   └── comparable-selector.ts   # Similar listings selection
│   │
│   └── ui/                          # Component library stubs
│
├── services/
│   └── scraper/                     # Data pipeline
│       ├── run.ts                   # Orchestrator (Zillow + Craigslist + optional Apartments.com)
│       ├── scrapers/
│       │   ├── base.ts              # Abstract BaseScraper + RawListing interface
│       │   ├── zillow.ts            # __NEXT_DATA__ parsing + JSON-LD fallback
│       │   ├── craigslist.ts        # RSS feed parsing + diagnostics
│       │   ├── apartments-com.ts    # Crawlee/Playwright (behind flag)
│       │   └── google-places.ts     # DEPRECATED (inactive, preserved for enrichment)
│       ├── normalizer.ts            # RawListing → NormalizedListing (Zod)
│       ├── metrics.ts               # Scrape metrics + CI output
│       ├── lifecycle.ts             # 7-day inactive, 30-day archive+delete
│       ├── price-change-detector.ts # Pre-upsert price comparison
│       ├── diagnostics.ts           # Per-source GH Actions summary tables
│       └── photo-utils.ts           # Photo extraction cascade
│
├── supabase/
│   └── migrations/                  # 9 migrations (001-009)
│
├── .github/
│   └── workflows/
│       └── nightly-scrape.yml       # Nightly scrape + embed + fairness recalc
│
└── .planning/                       # GSD planning documents
    ├── PROJECT.md, ROADMAP.md, STATE.md, REQUIREMENTS.md, config.json
    ├── phases/01-06 with PLANs, SUMMARYs, VERIFICATION, UAT
    └── debug/                       # Debug session reports
```

---

## 4. Database Schema (9 migrations)

| Migration | What it does |
|-----------|-------------|
| 001 | Core tables: users, campuses, listings, profiles, lease_terms |
| 002 | tour_requests table |
| 003 | UW Madison campus seed data |
| 004 | Profile student fields (profile_completed_at, avatar) |
| 005 | photo_urls, source_url, nullable rent, listing_history archive |
| 006 | pgvector(768) embedding column, HNSW index, semantic search RPC |
| 007 | saved_listings + notifications (price_change type) |
| 008 | Mark Google Places listings inactive (cleanup) |
| 009 | Add source column to semantic search RPC return |

**Key Tables**: listings, saved_listings, notifications, tour_requests, campus_configs, profiles, lease_terms

**RLS**: All tables enforce campus_id scoping + user auth

---

## 5. CribAI Tool System

| Tool | Handler | What it does |
|------|---------|-------------|
| search_listings | search-listings.ts | Hybrid SQL + semantic (pgvector) search with filters |
| web_search | web-search.ts | Tavily API search, auto-persist results, structured cards |
| get_listing_detail | get-listing-detail.ts | Full listing info with photos, amenities, true cost |
| compare_listings | compare-listings.ts | Side-by-side comparison table for 2-3 listings |
| schedule_tour | schedule-tour.ts | Create tour request in DB |
| explain_lease_term | explain-lease-term.ts | 28-term knowledge base with legal disclaimer |
| get_saved_listings | get-saved-listings.ts | User's saved/favorited listings |

**Agentic Loop**: Max 5 tool calls per turn, 30s timeout, SSE streaming with typed events.

**Block-Based UI**: Chat renders discriminated union of block types — listing_card, comparison, tour_confirmation, legal_disclaimer, web_result, map, tool_loading, text.

---

## 6. Phase-by-Phase Implementation History

### Phase 1: Auth & Platform Foundation ✓
- Magic link auth with .edu validation
- UW Madison default campus, root redirect
- Profile system with first-login modal
- Responsive mobile layout, sonner toasts
- **3 plans, 8 key files**

### Phase 2: Data Pipeline ✓
- Apartments.com scraper with photo extraction (JSON-LD > OG > carousel)
- GitHub Actions nightly scrape with Playwright, job summary, alerting
- Freshness UX (hero photos, badges, stale indicators, gallery)
- Staleness lifecycle (7-day inactive, 30-day archive+delete)
- **3 plans, 16 key files**

### Phase 3: Semantic Search ✓
- pgvector migration, Gemini embedding pipeline (768d, HNSW index)
- Hybrid search RPC (vector + SQL filters)
- Mapbox GL JS interactive map with price pins + popups
- **3 plans, 12 key files**

### Phase 4: Saved Listings & Alerts ✓
- Heart button, saved listings page with RLS
- Enhanced listing detail (gallery, map, freshness, CribAI CTA, similar)
- Price change detection pipeline + notification bell + page
- get_saved_listings tool, nav badge for price changes
- **4 plans, 12 key files**

### Phase 5: Agentic Data Pipeline + Web Search ✓
- Zillow scraper (__NEXT_DATA__), Craigslist diagnostics, Google Places removal
- Tavily web_search tool with 30min session cache
- Source citations on ListingCard, web_search indicator
- persistWebListing() for saving web results to DB
- **Gap closures**: web_result block type + ChatWebResult component, sessionStorage chat persistence, dashboard real Supabase queries
- **5 plans (incl. 2 gap closure), 10+ key files**

### Phase 6: Agent Tool Expansion + Polish ⏳ (Planned, not executed)
- 06-01: Chat persistence (database migration, sidebar, replace sessionStorage)
- 06-02: Enhanced tools (get_reviews, contact_pm, get_neighborhood_info, schedule_tour conflict detection)
- 06-03: Manual listing submission form + E2E verification

---

## 7. Requirements Coverage

**27 v1 requirements defined. 24 complete (89%), 3 deferred to Phase 6.**

| ID | Description | Phase | Status |
|----|-------------|-------|--------|
| AUTH-01 | Magic link auth | 1 | ✓ |
| AUTH-02 | Session persistence | 1 | ✓ |
| AUTH-03 | .edu validation | 1 | ✓ |
| AUTH-04 | Profile skip option | 1 | ✓ |
| AUTH-05 | Settings/profile edit | 1 | ✓ |
| SRCH-01 | Embeddings for listings | 3 | ✓ |
| SRCH-02 | Hybrid vector+SQL search | 3 | ✓ |
| SRCH-03 | Interactive map | 3 | ✓ |
| SRCH-04 | Semantic ranking | 3 | ✓ |
| LIST-01 | Save/favorite listings | 4 | ✓ |
| LIST-02 | Price change alerts | 4 | ✓ |
| LIST-03 | Photo gallery | 4 | ✓ |
| LIST-04 | Freshness badges | 4 | ✓ |
| LIST-05 | Review scraping | 6 | ⏳ |
| DATA-01 | Apartments.com scraper | 2 | ✓ |
| DATA-02 | Photo extraction | 2 | ✓ |
| DATA-03 | Manual listing form | 6 | ⏳ |
| DATA-04 | Multi-source scraping | 5 | ✓ |
| DATA-05 | Nightly scrape automation | 2 | ✓ |
| DATA-06 | Staleness lifecycle | 2 | ✓ |
| DATA-07 | Reddit/review scraping | 6 | ⏳ |
| CHAT-01 | Chat persistence (DB) | 6 | ⏳ |
| CHAT-02 | Tour scheduling | 6 | ⏳ |
| CHAT-03 | Map tool | 3 | ✓ |
| PLAT-01 | UW Madison primary | 1 | ✓ |
| PLAT-02 | Multi-campus architecture | 1 | ✓ |
| PLAT-03 | Responsive mobile | 1 | ✓ |

---

## 8. Known Issues & Gaps

### Closed (Phase 5 Gap Closure)

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Web search results not persisted | `webSearch()` had `_context` (unused), never called `persistWebListing()` | 05-04: Wire context, call persist for each result |
| Web results render as plain text | `buildResult()` returned `type: 'text'`, no link parsing | 05-04: New `web_result` block type + `ChatWebResult` component |
| Chat lost on navigation | Messages in `useState([])` only, destroyed on unmount | 05-05: sessionStorage persistence with lazy init |
| Dashboard shows no data | Static placeholder with zero Supabase queries | 05-05: Real queries for saved_listings + tour_requests |

### Open / Known Limitations

| Issue | Severity | Notes |
|-------|----------|-------|
| **Recently Viewed not functional** | Low | Dashboard card shows empty state; no tracking mechanism exists yet |
| **Scraper needs local env vars** | Low | `apps/web/.env.local` has vars but scraper doesn't load them; use `source apps/web/.env.local && pnpm --filter @campusnest/scraper start` |
| **GitHub Actions still has old scraper on main** | Medium | `dev` branch has updated workflow; needs merge to `main` |
| **Web search query structuring is naive** | Medium | Line 92 of web-search.ts: `"${query} apartments rentals near ${location}"` — no intent decomposition, no budget/bedroom/amenity extraction |
| **Single web search source (Tavily only)** | Medium | Could add SerpAPI, Brave Search, or direct scraping for coverage |
| **No web search result ranking/filtering** | Low | Takes top 8 raw Tavily results with no relevance post-filtering |
| **AGENT-01, AGENT-02 not in REQUIREMENTS.md** | Low | Referenced in ROADMAP but never defined — traceability gap only |
| **Chat persistence is sessionStorage only** | Medium | Tab-scoped, lost on tab close; Phase 6 plans DB migration |
| **Zillow scraper may break on HTML changes** | Medium | Parses `__NEXT_DATA__` JSON, fragile to Zillow DOM changes |
| **No rate limiting on API routes** | Medium | `/api/ai/cribai` and `/api/save-web-listing` lack rate limiting |
| **Apartments.com scraper disabled** | Low | Behind `ENABLE_APARTMENTS_COM` flag due to bot detection issues |

---

## 9. Ideas & Future Work

### Phase 6 (Planned)
- **Database chat persistence** — Replace sessionStorage with `chat_sessions` table + sidebar UI
- **get_reviews tool** — Scrape Reddit/Yelp/Google Maps for landlord + building reviews
- **contact_pm tool** — Property manager database with contact info
- **get_neighborhood_info tool** — Walkability, commute times, safety, vibe data
- **Enhanced tour scheduling** — Calendar awareness + conflict detection
- **Manual listing submission** — Form for landlords/students to add listings

### Beyond Phase 6
- **Smart query structuring** — CribAI should decompose user intent (budget, bedrooms, neighborhood, amenities) into optimized search queries before calling Tavily
- **Multiple search sources** — SerpAPI, Brave Search, direct Zillow/Apartments.com scraping
- **Result quality scoring** — Post-filter web results by relevance to student housing
- **Recently viewed tracking** — Record + display browsing history
- **Multi-campus expansion** — Add more universities beyond UW Madison
- **Landlord portal** — Self-service listing management
- **Payment integration** — Stripe for premium features
- **Push notifications** — Price drop alerts via email/SMS
- **Roommate matching** — Profile-based compatibility scoring
- **Lease document analysis** — Upload lease PDF → CribAI explains terms

---

## 10. Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Gemini over OpenAI/Anthropic | Already integrated, function calling works well, cost-effective |
| Campus-scoped multi-tenancy | Clean RLS isolation, scales to new schools without code changes |
| Magic link over passwords | Simpler UX, .edu verification built in |
| pgvector over Pinecone | Same Supabase instance, no external vector DB cost, PostGIS co-located |
| Block-based chat UI | Discriminated union enables rich tool outputs (cards, maps, tables) without markdown hacks |
| sessionStorage over localStorage | Tab-scoped (no cross-tab leaking), auto-clears on close, interim until DB persistence |
| Service-role client for upserts | Web listing persist needs write access that bypasses RLS |
| Tavily for web search | Fast, structured results, cost-effective vs SerpAPI |
| Persist-on-search (not persist-on-save) | Auto-persist all web results so they're immediately searchable; embedding pipeline picks them up |

---

## 11. Environment Variables Required

| Variable | Used By | Required |
|----------|---------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Web app, scraper, AI | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web app (browser client) | Yes |
| `SUPABASE_SECRET_KEY` | Scraper, API routes (service role) | Yes |
| `GEMINI_API_KEY` | AI tools, embedding pipeline | Yes |
| `TAVILY_API_KEY` | Web search tool | Optional (graceful degradation) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Map blocks | Yes (for map features) |
| `ENABLE_APARTMENTS_COM` | Scraper | Optional (default false) |

---

## 12. Test Inventory

| Package | Test Files | Framework |
|---------|-----------|-----------|
| @campusnest/utils | 5 (cost-calculator, fairness-scorer, price-model, comparable-selector, enhanced-fairness) | Vitest |
| @campusnest/ai | 10+ (all tool handlers, web-search-cache, persist-web-listing, executor) | Vitest |
| services/scraper | 11 (zillow, craigslist, run, diagnostics, metrics, normalizer, photos, staleness, price-change) | Vitest |
| apps/web (unit) | 2 (map-block, edu-validation) | Vitest |
| apps/web (E2E) | 3 (auth, homepage, listings) + Page Object Models | Playwright |

---

## 13. Git Workflow

- **Branch**: `dev` for development, `main` for production
- **Commits**: `<type>: <description>` (feat, fix, docs, test, chore, refactor, perf, ci)
- **Pre-push**: Build must pass, code review + /simplify on changed files
- **Pre-merge to main**: QA agent inspection required
- **Recent commits on dev**: Phase 5 gap closure (05-04, 05-05) + Phase 6 planning docs
