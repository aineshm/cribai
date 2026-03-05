# Codebase Structure

**Analysis Date:** 2026-03-05

## Directory Layout

```
campusnest/
├── apps/
│   ├── web/                    # Next.js 15 web application
│   │   ├── app/                # App Router pages and API routes
│   │   ├── components/         # React components
│   │   ├── lib/                # Client utilities and context providers
│   │   ├── public/             # Static assets
│   │   └── tests/              # Playwright E2E tests
│   └── mobile/                 # Placeholder (empty)
├── packages/
│   ├── ai/                     # CribAI engine, PageIndex, tools
│   │   └── src/
│   │       ├── knowledge/      # Static knowledge bases
│   │       └── tools/          # Tool schemas, executor, handlers
│   │           ├── handlers/   # 6 tool handler implementations
│   │           └── __tests__/  # Tool unit tests
│   ├── types/                  # Zod schemas and TypeScript types
│   │   └── src/                # One file per domain entity
│   ├── utils/                  # Pure domain logic (pricing, fairness)
│   │   └── src/
│   │       └── __tests__/      # Utility unit tests
│   ├── supabase/               # Supabase client factory
│   │   └── src/                # client.ts (browser), server.ts (SSR + service)
│   └── ui/                     # Tamagui components (mobile, unused by web)
│       └── src/
├── services/
│   └── scraper/                # Listing scraper service
│       ├── scrapers/           # Scraper implementations
│       ├── __tests__/          # Scraper/normalizer tests
│       ├── normalizer.ts       # Amenity normalization
│       └── run.ts              # Entry point
├── supabase/
│   ├── migrations/             # SQL schema migrations
│   ├── seed/                   # Seed data
│   └── functions/              # Supabase Edge Functions (Deno)
│       ├── rate-limiter/
│       ├── rebuild-pageindex/
│       ├── recalculate-fairness/
│       └── verify-edu/
├── .github/
│   └── workflows/
│       └── nightly-scrape.yml  # Nightly scrape + fairness recalculation
├── docs/                       # Documentation
├── package.json                # Root monorepo config
├── pnpm-workspace.yaml         # Workspace definition
└── turbo.json                  # Turborepo task config
```

## Directory Purposes

**`apps/web/`:**
- Purpose: Next.js 15 frontend application using App Router
- Contains: Pages, API routes, React components, client-side utilities
- Key files:
  - `apps/web/app/layout.tsx` - Root layout with fonts and global styles
  - `apps/web/app/page.tsx` - Home page listing public campuses
  - `apps/web/app/api/ai/cribai/route.ts` - CribAI SSE streaming endpoint
  - `apps/web/components/cribai-chat.tsx` - Main chat component
  - `apps/web/lib/campus-context.tsx` - Campus React context provider

**`apps/web/app/`:**
- Purpose: Next.js App Router route definitions
- Contains: Route groups `(auth)` and `(campus)`, API routes under `api/`
- Route groups:
  - `(auth)/` - Login, callback, edu verification (no campus layout)
  - `(campus)/[campusSlug]/` - Campus-scoped pages with nav layout
  - `api/ai/cribai/` - AI chat SSE endpoint
  - `api/webhooks/stripe/` - Stripe webhook (stub)
  - `auth/callback/` and `auth/confirm/` - Additional auth routes

**`apps/web/components/`:**
- Purpose: Reusable React components
- Contains: Page-level components and chat block renderers
- Key files:
  - `apps/web/components/cribai-chat.tsx` - Full chat UI with SSE client
  - `apps/web/components/chat/` - Block renderer components (listing card, comparison table, tour confirmation, legal disclaimer, tool indicator)
  - `apps/web/components/listing-card.tsx` - Individual listing display
  - `apps/web/components/listing-grid.tsx` - Grid layout for listings
  - `apps/web/components/listing-filters.tsx` - Filter controls
  - `apps/web/components/fairness-badge.tsx` - Fairness score badge
  - `apps/web/components/true-cost-calculator.tsx` - True cost breakdown
  - `apps/web/components/auth-nav.tsx` - Auth navigation bar

**`packages/ai/`:**
- Purpose: CribAI engine with Gemini integration, PageIndex RAG, and tool system
- Contains: Core AI classes, tool definitions and handlers, knowledge bases
- Key files:
  - `packages/ai/src/cribai.ts` - Main `CribAI` class (agentic loop)
  - `packages/ai/src/pageindex-builder.ts` - Build PageIndex tree from listings
  - `packages/ai/src/pageindex-traverser.ts` - LLM-guided tree traversal
  - `packages/ai/src/tools/schemas.ts` - Gemini function declarations
  - `packages/ai/src/tools/executor.ts` - Tool dispatch registry
  - `packages/ai/src/tools/types.ts` - ToolContext, ToolResult interfaces
  - `packages/ai/src/tools/handlers/search-listings.ts` - Search handler
  - `packages/ai/src/tools/handlers/compare-listings.ts` - Comparison handler
  - `packages/ai/src/tools/handlers/schedule-tour.ts` - Tour scheduling handler
  - `packages/ai/src/tools/handlers/explain-lease-term.ts` - Lease term KB handler
  - `packages/ai/src/tools/handlers/get-listing-detail.ts` - Detail handler
  - `packages/ai/src/tools/handlers/get-landlord-info.ts` - Landlord info handler
  - `packages/ai/src/knowledge/lease-terms.ts` - 28-term lease knowledge base
  - `packages/ai/src/index.ts` - Public API barrel export

**`packages/types/`:**
- Purpose: Canonical Zod schemas and inferred TypeScript types
- Contains: One schema file per domain entity
- Key files:
  - `packages/types/src/listing.ts` - Listing, TrueCost, FairnessData
  - `packages/types/src/chat.ts` - ChatBlock discriminated union (7 block types)
  - `packages/types/src/campus.ts` - CampusConfig
  - `packages/types/src/profile.ts` - Profile, SubscriptionTier, VerificationStatus
  - `packages/types/src/tour.ts` - TourRequest, TourRequestInput
  - `packages/types/src/landlord.ts` - Landlord, LandlordReview
  - `packages/types/src/pageindex.ts` - PageIndexTree, PageIndexNode
  - `packages/types/src/ai.ts` - AiQueryLog
  - `packages/types/src/index.ts` - Barrel re-export of all schemas and types

**`packages/utils/`:**
- Purpose: Pure domain logic functions with no side effects
- Contains: Pricing calculators, fairness scoring, comparable selection, price regression model
- Key files:
  - `packages/utils/src/cost-calculator.ts` - True Cost calculation with defaults
  - `packages/utils/src/fairness-scorer.ts` - Percentile + enhanced regression scoring
  - `packages/utils/src/comparable-selector.ts` - Select comparable listings for scoring
  - `packages/utils/src/price-model.ts` - Linear regression price model
  - `packages/utils/src/index.ts` - Barrel export

**`packages/supabase/`:**
- Purpose: Supabase client creation for all execution contexts
- Contains: Browser client and server client factories
- Key files:
  - `packages/supabase/src/client.ts` - `createClient()` for browser (anon key)
  - `packages/supabase/src/server.ts` - `createServerComponentClient(cookieStore)` for SSR, `createSecretClient()` for service role

**`packages/ui/`:**
- Purpose: Shared UI components for mobile app (Tamagui-based)
- Contains: Tamagui component definitions
- Note: Not currently used by `apps/web/` (web uses Tailwind directly)

**`services/scraper/`:**
- Purpose: Automated listing scraper run as GitHub Actions job
- Contains: Abstract scraper base, Apartments.com implementation, normalizer
- Key files:
  - `services/scraper/run.ts` - Entry point, iterates campuses and scrapers
  - `services/scraper/scrapers/base-scraper.ts` - `BaseScraper` abstract class, `RawListing`, `ScraperConfig`
  - `services/scraper/scrapers/apartments-com.ts` - Crawlee/Playwright scraper
  - `services/scraper/normalizer.ts` - Amenity alias map and normalization

**`supabase/`:**
- Purpose: Database schema, seed data, and edge functions
- Contains: SQL migrations, seed scripts, Deno-based serverless functions
- Key files:
  - `supabase/migrations/001_initial_schema.sql` - 11 tables, RLS policies, indexes, triggers
  - `supabase/migrations/002_tour_requests.sql` - Tour requests with dedup index
  - `supabase/seed/001_campus_configs.sql` - Initial campus data
  - `supabase/functions/rebuild-pageindex/index.ts` - Rebuild PageIndex trees
  - `supabase/functions/recalculate-fairness/index.ts` - Recalculate fairness scores
  - `supabase/functions/verify-edu/index.ts` - .edu email verification
  - `supabase/functions/rate-limiter/index.ts` - Rate limiting logic

## Key File Locations

**Entry Points:**
- `apps/web/app/layout.tsx`: Root layout (fonts, global CSS)
- `apps/web/app/page.tsx`: Home page (campus selector)
- `apps/web/app/api/ai/cribai/route.ts`: CribAI streaming API
- `services/scraper/run.ts`: Scraper entry point
- `packages/ai/src/index.ts`: AI package public API

**Configuration:**
- `package.json`: Root monorepo scripts
- `pnpm-workspace.yaml`: Workspace packages (`apps/*`, `packages/*`, `services/*`)
- `turbo.json`: Build pipeline, env vars, task dependencies
- `apps/web/next.config.*`: Next.js configuration (if present)
- `apps/web/tailwind.config.*`: Tailwind v4 configuration (if present, or via CSS)
- `.github/workflows/nightly-scrape.yml`: CI/CD pipeline

**Core Logic:**
- `packages/ai/src/cribai.ts`: CribAI agentic loop
- `packages/ai/src/tools/executor.ts`: Tool dispatch
- `packages/ai/src/tools/handlers/`: Tool implementations
- `packages/utils/src/cost-calculator.ts`: True Cost formula
- `packages/utils/src/fairness-scorer.ts`: Fairness scoring algorithm
- `services/scraper/scrapers/apartments-com.ts`: Web scraping logic

**Testing:**
- `packages/ai/src/tools/__tests__/`: AI tool tests (Vitest)
- `packages/utils/src/__tests__/`: Utility function tests (Vitest)
- `services/scraper/__tests__/`: Scraper/normalizer tests (Vitest)
- `apps/web/tests/e2e/`: Playwright E2E tests

## Naming Conventions

**Files:**
- `kebab-case.ts` for all TypeScript source files: `cost-calculator.ts`, `search-listings.ts`, `campus-context.tsx`
- `page.tsx` and `layout.tsx` for Next.js App Router conventions
- `route.ts` for Next.js API routes
- `*.test.ts` for test files (co-located in `__tests__/` directories)
- `index.ts` for barrel exports in every package

**Directories:**
- `kebab-case` for all directories: `lease-terms`, `base-scraper`
- `__tests__/` for test directories
- Next.js conventions: `(auth)`, `(campus)` for route groups, `[campusSlug]`, `[id]` for dynamic segments
- `handlers/` for tool handler implementations

**Packages:**
- `@campusnest/<name>` scope for all workspace packages
- Package names match directory names: `packages/ai` = `@campusnest/ai`

**Exports:**
- camelCase for functions: `calculateTrueCost`, `createSecretClient`, `executeTool`
- PascalCase for classes: `CribAI`, `PageIndexBuilder`, `ApartmentsComScraper`
- PascalCase for React components: `CribAIChat`, `ListingGrid`, `ChatBlockRenderer`
- PascalCase for types/interfaces: `ToolContext`, `ChatEvent`, `RawListing`
- SCREAMING_SNAKE_CASE for constants: `MAX_TOOL_CALLS`, `CRIBAI_TOOLS`, `RATE_LIMITS`

**Database:**
- `snake_case` for table and column names: `campus_configs`, `rent_monthly`, `is_active`
- Type mapping: DB `snake_case` mapped to TS `camelCase` at the boundary (see campus layout)

## Where to Add New Code

**New AI Tool:**
1. Define Gemini `FunctionDeclaration` in `packages/ai/src/tools/schemas.ts`
2. Create handler in `packages/ai/src/tools/handlers/<tool-name>.ts` implementing `ToolHandler` signature
3. Register handler in `packages/ai/src/tools/executor.ts` HANDLERS map
4. Add any new ChatBlock types to `packages/types/src/chat.ts`
5. Add block renderer in `apps/web/components/chat/chat-<block-type>.tsx`
6. Export from `apps/web/components/chat/index.ts`
7. Add case to `apps/web/components/chat/chat-block-renderer.tsx`
8. Tests: `packages/ai/src/tools/__tests__/<tool-name>.test.ts`

**New Page/Route:**
- Campus-scoped page: `apps/web/app/(campus)/[campusSlug]/<route>/page.tsx`
- Auth-related page: `apps/web/app/(auth)/<route>/page.tsx`
- API endpoint: `apps/web/app/api/<path>/route.ts`
- Campus pages inherit layout from `apps/web/app/(campus)/[campusSlug]/layout.tsx`

**New Shared Type:**
1. Create schema file: `packages/types/src/<entity>.ts`
2. Export from: `packages/types/src/index.ts`
3. Rebuild: types package is a dependency, so downstream builds auto-pick up

**New Utility Function:**
1. Create: `packages/utils/src/<function-name>.ts`
2. Export from: `packages/utils/src/index.ts`
3. Tests: `packages/utils/src/__tests__/<function-name>.test.ts`

**New Scraper Source:**
1. Create: `services/scraper/scrapers/<source-name>.ts` extending `BaseScraper`
2. Register in: `services/scraper/run.ts` scrapers array
3. Tests: `services/scraper/__tests__/<source-name>.test.ts`

**New React Component:**
- Page-level component: `apps/web/components/<component-name>.tsx`
- Chat block renderer: `apps/web/components/chat/chat-<block-type>.tsx`
- Shared client utility: `apps/web/lib/<utility-name>.ts`

**New Edge Function:**
1. Create directory: `supabase/functions/<function-name>/`
2. Create: `supabase/functions/<function-name>/index.ts` (Deno runtime)
3. Uses `Deno.serve()` handler pattern with auth check

**New Database Migration:**
- Create: `supabase/migrations/<NNN>_<description>.sql` (next sequential number)

## Special Directories

**`supabase/functions/`:**
- Purpose: Supabase Edge Functions (Deno runtime, NOT Node.js)
- Generated: No
- Committed: Yes
- Note: Uses `https://esm.sh/` imports, `Deno.serve()` API, `Deno.env.get()` for env vars

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No (gitignored)

**`dist/`:**
- Purpose: TypeScript compilation output for packages
- Generated: Yes (via `tsc`)
- Committed: No (gitignored)

**`.turbo/`:**
- Purpose: Turborepo cache
- Generated: Yes
- Committed: No (gitignored)

**`node_modules/`:**
- Purpose: Package dependencies (pnpm hoisted + per-package)
- Generated: Yes
- Committed: No (gitignored)

**`.planning/`:**
- Purpose: GSD planning documents and codebase analysis
- Generated: By tools
- Committed: Yes

---

*Structure analysis: 2026-03-05*
