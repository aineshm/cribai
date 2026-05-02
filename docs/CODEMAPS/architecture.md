<!-- Updated: 2026-04-22 | Runtime rebuild status map -->
# Architecture

## System Diagram

```
┌────────────────────┐    ┌──────────────────────┐
│ Next.js 16 App      │───▶│ Supabase PostgreSQL   │
│ apps/web            │    │ PostGIS + pgvector    │
│ API routes + RSC    │    │ Auth + Realtime       │
└─────────┬──────────┘    └──────────┬───────────┘
          │                          │
          ▼                          ▼
┌────────────────────┐    ┌──────────────────────┐
│ packages/ai         │    │ Edge Functions        │
│ CribAI tools        │    │ rate-limiter          │
│ deterministic chat  │    │ verify-edu            │
│ mission executor    │    │ rebuild-pageindex     │
└─────────┬──────────┘    │ recalculate-fairness  │
          │               └──────────────────────┘
          ▼
┌────────────────────┐    ┌──────────────────────┐
│ Mission worker      │    │ GitHub Actions        │
│ local / GH / VM     │    │ nightly-scrape        │
│ queue polling       │    │ optional worker tick  │
└────────────────────┘    └──────────────────────┘
```

## Monorepo Layout (pnpm 9 + Turborepo)

```
packages/types/     Zod schemas + TS types (shared contract)
packages/utils/     cost-calculator, fairness-scorer, comparable-selector, price-model
packages/supabase/  Browser + SSR + service-role clients
packages/ai/        CribAI tools, deterministic runtime, mission worker/executor
packages/ui/        Tamagui components (Phase 2, unused)
apps/web/           Next.js 16 — pages, components, API routes
services/scraper/   Crawlee + Playwright (Apartments.com)
```

## Data Flow

```
Nightly cron → scraper → normalize → listings table
                                    → recalculate-fairness → fairness_score
                                    → rebuild-pageindex → pageindex_trees
Chat query → /api/ai/cribai → load conversation_state
                              → deterministic runtime for search/detail/compare/tour
                              → typed ToolResult.machineData + statePatch
                              → SSE stream + persisted assistant blocks + updated state
Fallback chat → CribAI model stream
Mission request → missions.status=queued → worker claims lease → executor steps → result/draft/status
Explore page → featured boot payload → /api/explore/viewport for map data
AI search → /api/search/listings / search_listings tool → same listing summaries/map payloads
```

## Runtime Rebuild Status

The `runtime-rebuild` branch implements the state-centric architecture locally at commit `daa268e`.

- `conversation_state`: implemented in types, API routes, and migration `032`
- typed `ToolResult`: implemented with `machineData` and `statePatch`
- deterministic chat runtime: implemented in `apps/web/lib/cribai-runtime.ts`
- mission queue/lease runtime: implemented in migration `033` and `packages/ai/src/missions/worker*.ts`
- explore viewport delivery: implemented via `/api/explore/viewport`
- production worker hosting: not active yet
- Oracle VM deployment: blocked by `VM.Standard.A1.Flex` capacity in `us-chicago-1`

## Build Pipeline (turbo.json)

build: ^build deps first → outputs .next/** + dist/**
test: depends on ^build
dev: no cache, persistent
