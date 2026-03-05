<!-- Generated: 2026-03-04 | Files scanned: ~60 | Token estimate: ~600 -->
# Architecture

## System Diagram

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│  Next.js 15  │───▶│  Supabase    │◀───│  Edge Functions  │
│  (apps/web)  │    │  PostgreSQL  │    │  rate-limiter    │
│  App Router  │    │  + PostGIS   │    │  verify-edu      │
└──────┬───────┘    │  + Auth      │    │  rebuild-pageindex│
       │            └──────────────┘    │  recalculate-fair │
       ▼                                └─────────────────┘
┌──────────────┐                        ┌───────────────┐
│  Gemini API  │                        │  GitHub Actions │
│  (packages/  │                        │  nightly-scrape │
│   ai/)       │                        │  → scraper/     │
└──────────────┘                        └───────────────┘
```

## Monorepo Layout (pnpm 9 + Turborepo)

```
packages/types/     Zod schemas + TS types (shared contract)
packages/utils/     cost-calculator, fairness-scorer, comparable-selector, price-model
packages/supabase/  Browser + SSR + service-role clients
packages/ai/        PageIndex builder/traverser + CribAI streaming
packages/ui/        Tamagui components (Phase 2, unused)
apps/web/           Next.js 15 — pages, components, API routes
services/scraper/   Crawlee + Playwright (Apartments.com)
```

## Data Flow

```
Nightly cron → scraper → normalize → listings table
                                    → recalculate-fairness → fairness_score
                                    → rebuild-pageindex → pageindex_trees
User query → /api/ai/cribai → PageIndexTraverser → CribAI → SSE stream
User browse → listings page → Supabase query → ListingGrid → ListingCard
```

## Build Pipeline (turbo.json)

build: ^build deps first → outputs .next/** + dist/**
test: depends on ^build
dev: no cache, persistent
