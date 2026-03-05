# Architecture

**Analysis Date:** 2026-03-05

## Pattern Overview

**Overall:** Multi-tenant monorepo with campus-scoped data isolation, AI-augmented agentic chat, and a scraping pipeline feeding a hierarchical RAG index.

**Key Characteristics:**
- Monorepo with shared packages (`types`, `utils`, `supabase`, `ai`, `ui`) consumed by apps and services
- Campus-scoped multi-tenancy: all data (listings, trees, tours) is partitioned by `campus_id`
- Agentic AI loop: Gemini function-calling with up to 5 tool invocations per turn, streamed via SSE
- PageIndex RAG: hierarchical tree structure built from listings, traversed at query time by LLM-guided branch selection
- Scraper pipeline: nightly GitHub Actions job scrapes, normalizes, upserts, then triggers fairness recalculation

## Layers

**Data Layer (Supabase/PostgreSQL):**
- Purpose: Persistent storage with RLS-enforced access control
- Location: `supabase/migrations/`, `supabase/seed/`
- Contains: Schema definitions (11 tables), RLS policies, PostGIS spatial indexes, triggers
- Key tables: `campus_configs`, `listings`, `profiles`, `pageindex_trees`, `tour_requests`, `ai_query_logs`, `landlords`, `landlord_reviews`, `sublets`, `roommate_profiles`
- Depends on: PostGIS extension, Supabase Auth (`auth.users`)
- Used by: All packages and services via `@campusnest/supabase`

**Shared Type Layer:**
- Purpose: Canonical Zod schemas and TypeScript types shared across all packages
- Location: `packages/types/src/`
- Contains: Zod-validated schemas for every domain entity (listing, campus, profile, chat blocks, tour, landlord, pageindex, AI query log)
- Key files: `packages/types/src/listing.ts`, `packages/types/src/chat.ts`, `packages/types/src/tour.ts`, `packages/types/src/campus.ts`, `packages/types/src/profile.ts`, `packages/types/src/pageindex.ts`
- Depends on: `zod`
- Used by: `@campusnest/ai`, `@campusnest/utils`, `@campusnest/web`, `@campusnest/scraper`

**Utility/Domain Logic Layer:**
- Purpose: Pure functions for pricing, fairness scoring, and comparable selection
- Location: `packages/utils/src/`
- Contains: `cost-calculator.ts` (True Cost), `fairness-scorer.ts` (percentile + regression), `comparable-selector.ts`, `price-model.ts` (linear regression)
- Depends on: `@campusnest/types`
- Used by: `@campusnest/ai` tool handlers, edge functions

**Supabase Client Layer:**
- Purpose: Encapsulates Supabase client creation for browser, server component, and service-role contexts
- Location: `packages/supabase/src/`
- Contains: `client.ts` (browser client via `@supabase/ssr`), `server.ts` (SSR client with cookie forwarding + service-role client)
- Exports: `createClient()` from `@campusnest/supabase/client`, `createServerComponentClient()` and `createSecretClient()` from `@campusnest/supabase/server`
- Depends on: `@supabase/ssr`, `@supabase/supabase-js`
- Used by: `@campusnest/web`, `@campusnest/ai`

**AI Engine Layer:**
- Purpose: Agentic chat with Gemini function calling, PageIndex RAG, and tool execution
- Location: `packages/ai/src/`
- Contains:
  - `cribai.ts` - Main `CribAI` class with agentic loop (async generator yielding `ChatEvent`)
  - `pageindex-builder.ts` - Builds hierarchical tree from listings using Gemini summaries
  - `pageindex-traverser.ts` - LLM-guided tree traversal to select relevant context
  - `tools/schemas.ts` - Gemini FunctionDeclaration definitions for 6 tools
  - `tools/executor.ts` - Registry-based tool dispatch
  - `tools/handlers/` - 6 tool handler implementations
  - `tools/types.ts` - `ToolContext`, `ToolResult`, `ToolHandler` interfaces
  - `knowledge/lease-terms.ts` - Static knowledge base for lease term explanations
- Depends on: `@google/genai`, `@campusnest/types`, `@campusnest/supabase`
- Used by: `apps/web/app/api/ai/cribai/route.ts`

**Web Application Layer (Next.js 15):**
- Purpose: Server-rendered campus pages, client-side chat, and API routes
- Location: `apps/web/`
- Contains: App Router pages, React components, API route handlers
- Depends on: All `@campusnest/*` packages
- Used by: End users via browser

**Scraper Service Layer:**
- Purpose: Automated listing data collection from external sites
- Location: `services/scraper/`
- Contains: Abstract `BaseScraper`, `ApartmentsComScraper` (Crawlee/Playwright), `normalizer.ts`, `run.ts` entry point
- Depends on: `crawlee`, `playwright`, `@supabase/supabase-js`
- Used by: GitHub Actions nightly job

**Edge Functions Layer:**
- Purpose: Supabase-hosted serverless functions for background processing
- Location: `supabase/functions/`
- Contains: `rebuild-pageindex/` (regenerate RAG trees), `recalculate-fairness/`, `verify-edu/`, `rate-limiter/`
- Depends on: Supabase Deno runtime, `@supabase/supabase-js` (ESM import)
- Used by: Nightly scrape pipeline, auth flows

## Data Flow

**User Chat Query Flow:**

1. Client (`apps/web/components/cribai-chat.tsx`) sends POST to `/api/ai/cribai` with `{ query, campusSlug, history }`
2. API route (`apps/web/app/api/ai/cribai/route.ts`) validates input, authenticates user (optional), checks rate limit via `ai_query_logs`, fetches campus config and PageIndex tree from Supabase
3. Route instantiates `CribAI` class with Gemini API key, campus name, and `ToolContext` (supabase client, campusId, userId)
4. `CribAI.chat()` async generator: traverses PageIndex tree via `PageIndexTraverser` to gather relevant context, then enters agentic loop
5. Agentic loop: calls Gemini `generateContentStream`, yields text chunks, collects function calls, executes tools via `executeTool()`, appends results to conversation, loops (max 5 tool calls, 30s timeout)
6. Each `ChatEvent` is SSE-encoded and streamed to client
7. Client processes SSE events, builds block-based message UI (text, listing cards, comparison tables, tour confirmations, legal disclaimers)

**Nightly Scrape Pipeline:**

1. GitHub Actions (`nightly-scrape.yml`) triggers at 2am CT
2. `services/scraper/run.ts` fetches all public campuses from Supabase
3. For each campus, instantiates `ApartmentsComScraper` with campus geo coordinates
4. Scraper uses Crawlee/Playwright to crawl search results and detail pages
5. Raw listings are normalized (`normalizer.ts`) and upserted to `listings` table (dedup by `external_id + source`)
6. Stale listings (not seen in 7 days) are marked inactive
7. GitHub Action then triggers `recalculate-fairness` edge function via HTTP POST
8. Edge function `rebuild-pageindex` can be called separately to regenerate PageIndex trees

**Auth Flow:**

1. User enters email on login page (`apps/web/app/(auth)/login/page.tsx`)
2. Client calls `supabase.auth.signInWithOtp()` with magic link redirect to `/callback`
3. Callback route (`apps/web/app/(auth)/callback/route.ts`) exchanges code/token for session
4. Campus layout (`apps/web/app/(campus)/[campusSlug]/layout.tsx`) reads user session and profile for auth nav display

**State Management:**
- Server state: Supabase PostgreSQL (listings, profiles, tours, AI logs, PageIndex trees)
- Client state: React `useState` in components (no global state store)
- Context: `CampusProvider` React context provides campus config to child components
- No client-side caching layer (each page load fetches fresh data from Supabase)

## Key Abstractions

**CribAI Engine:**
- Purpose: Encapsulates the agentic chat loop with Gemini
- Location: `packages/ai/src/cribai.ts`
- Pattern: AsyncGenerator yielding typed `ChatEvent` discriminated union (`text | tool_call | tool_result | done`)
- Constraints: Max 5 tool calls per turn, 30s total timeout

**PageIndex (Hierarchical RAG):**
- Purpose: Structured tree index of listing data that enables efficient context retrieval without embedding search
- Builder: `packages/ai/src/pageindex-builder.ts` - Groups listings by bedrooms, then price tiers, generates LLM summaries
- Traverser: `packages/ai/src/pageindex-traverser.ts` - LLM selects relevant branches at each level (max depth 3, max 3 branches)
- Storage: `pageindex_trees` table (JSON tree per campus + entity type)

**Tool System:**
- Purpose: Extensible function-calling tools for the AI agent
- Types: `packages/ai/src/tools/types.ts` - `ToolContext`, `ToolResult` (dual output: `modelContext` string for LLM + `clientBlock` ChatBlock for UI)
- Registry: `packages/ai/src/tools/executor.ts` - Name-to-handler map
- Schemas: `packages/ai/src/tools/schemas.ts` - Gemini `FunctionDeclaration` objects
- Handlers: `packages/ai/src/tools/handlers/` - 6 implementations (search_listings, get_listing_detail, compare_listings, schedule_tour, explain_lease_term, get_landlord_info)

**ChatBlock System:**
- Purpose: Typed content blocks for rich chat UI rendering
- Schema: `packages/types/src/chat.ts` - Discriminated union of block types
- Types: `TextBlock`, `ListingCardBlock`, `ComparisonBlock`, `TourConfirmationBlock`, `LegalDisclaimerBlock`, `RecommendationsBlock`, `ToolLoadingBlock`
- Renderer: `apps/web/components/chat/chat-block-renderer.tsx` - Maps block type to React component

**Scraper Abstraction:**
- Purpose: Pluggable scraper interface for different listing sources
- Base: `services/scraper/scrapers/base-scraper.ts` - Abstract class with `scrape()` method
- Implementation: `services/scraper/scrapers/apartments-com.ts` - Crawlee/Playwright scraper
- Normalizer: `services/scraper/normalizer.ts` - Standardizes amenity names, trims data

**Supabase Client Factory:**
- Purpose: Three client types for different execution contexts
- Browser: `packages/supabase/src/client.ts` - `createClient()` using anon key
- Server component: `packages/supabase/src/server.ts` - `createServerComponentClient(cookieStore)` with cookie forwarding for SSR auth
- Service role: `packages/supabase/src/server.ts` - `createSecretClient()` bypasses RLS for server-side operations

## Entry Points

**Web Application:**
- Location: `apps/web/app/layout.tsx` (root layout), `apps/web/app/page.tsx` (home page)
- Triggers: HTTP requests via Next.js App Router
- Responsibilities: Renders campus listing, orchestrates auth, hosts CribAI chat

**CribAI API Route:**
- Location: `apps/web/app/api/ai/cribai/route.ts`
- Triggers: POST from CribAI chat component
- Responsibilities: Auth check, rate limiting, SSE streaming of AI responses

**Auth Callback:**
- Location: `apps/web/app/(auth)/callback/route.ts`
- Triggers: Redirect from Supabase magic link email
- Responsibilities: Exchange auth code for session, set cookies

**Stripe Webhook (stub):**
- Location: `apps/web/app/api/webhooks/stripe/route.ts`
- Triggers: Stripe webhook POST
- Responsibilities: Phase 2 placeholder for subscription management

**Scraper Runner:**
- Location: `services/scraper/run.ts`
- Triggers: GitHub Actions nightly cron or manual `pnpm --filter @campusnest/scraper start`
- Responsibilities: Scrape, normalize, upsert listings for all public campuses

**Edge Functions:**
- Location: `supabase/functions/rebuild-pageindex/index.ts`, `supabase/functions/recalculate-fairness/index.ts`, `supabase/functions/verify-edu/index.ts`, `supabase/functions/rate-limiter/index.ts`
- Triggers: HTTP POST (called by GitHub Actions, auth flows, or manually)
- Responsibilities: Background data processing tasks

## Error Handling

**Strategy:** Fail-safe with user-friendly fallbacks; errors are caught at boundaries and returned as structured responses.

**Patterns:**
- API routes wrap handlers in try/catch, return JSON error responses with status codes (400, 401, 404, 429, 500, 503)
- CribAI engine catches tool execution errors and yields error blocks to the model for graceful recovery
- SSE stream catches errors and emits `{ type: 'error', message }` event before closing
- PageIndex traverser falls back to index 0 on LLM selection failure
- Scraper logs warnings for individual listing extraction failures but continues processing
- Edge functions return JSON `{ error }` with appropriate status codes

## Cross-Cutting Concerns

**Logging:** `console.log`/`console.error` throughout. No structured logging framework.

**Validation:** Zod schemas in `packages/types/` for domain types. Manual validation in API routes (type checks, length limits). Gemini tool schemas provide parameter-level validation.

**Authentication:** Supabase Auth with magic link OTP. Optional auth for CribAI (unauthenticated users get limited features). `.edu` email verification for enhanced access (landlord reviews).

**Rate Limiting:** Inline rate-limit check in CribAI API route against `ai_query_logs` table. Tier-based limits (free: 10/hr, pro: 50/hr, premium: 200/hr).

**Multi-tenancy:** All queries scoped by `campus_id`. RLS policies enforce campus-scoped reads. Campus context propagated through URL slug (`[campusSlug]`), React context (`CampusProvider`), and `ToolContext`.

---

*Architecture analysis: 2026-03-05*
