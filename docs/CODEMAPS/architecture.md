# Architecture Codemap

**Last Updated:** 2026-03-04
**Phase:** 1 complete — Foundation. Phases 2–5 in progress.

## System Overview

CampusNest is a multi-campus student housing intelligence platform. Users verify a `.edu` email to access campus-scoped listings with True Cost breakdowns, Fairness Scores, and (Phase 5) an AI advisor called CribAI.

## Service Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser / Next.js 15 (apps/web)                               │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ Auth pages       │  │ Campus listings   │  │ CribAI chat   │ │
│  │ /login           │  │ /[slug]/listings  │  │ /[slug]/cribai│ │
│  │ /verify-edu      │  │ /[slug]/listings/ │  │  (Phase 5)    │ │
│  │                  │  │   [id]           │  │               │ │
│  └─────────────────┘  └──────────────────┘  └───────────────┘ │
│                                                                 │
│  middleware.ts — auth guard + rate-limit call to Edge Function  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Supabase SSR client
┌────────────────────────────▼────────────────────────────────────┐
│  Supabase Platform                                              │
│  ┌────────────────┐  ┌──────────────────────────────────────┐  │
│  │ PostgreSQL +   │  │ Edge Functions (Deno)                │  │
│  │ PostGIS        │  │  rate-limiter                        │  │
│  │ Auth           │  │  verify-edu                          │  │
│  │ RLS policies   │  │  recalculate-fairness                │  │
│  └────────────────┘  │  rebuild-pageindex (Phase 5 stub)    │  │
│                       └──────────────────────────────────────┘  │
└────────────────────────────▲────────────────────────────────────┘
                             │ service role writes
┌────────────────────────────┴────────────────────────────────────┐
│  GitHub Actions — Nightly Scrape (.github/workflows/)          │
│  cron: 0 8 * * * (2am CT)                                      │
│  @campusnest/scraper → ApartmentsComScraper (Crawlee/Playwright)│
│  → upserts listings → triggers recalculate-fairness edge fn    │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow — Listing Lifecycle

```
apartments.com
  → ApartmentsComScraper (Playwright/Crawlee)
  → normalizer (RawListing → DB row)
  → listings table (upsert on external_id+source)
  → recalculate-fairness edge fn (batch scoring)
  → fairness_score + fairness_data columns updated
  → ListingsPage reads via SSR Supabase query
  → ListingDetailPage + TrueCostCalculator (client-side calc)
```

## Data Flow — Auth

```
User → /login (Supabase magic link / OAuth)
  → /auth/callback → session cookie set
  → /verify-edu → verify-edu edge fn
    → campus_configs.edu_domains lookup
    → profiles.is_edu_verified = true, campus_id set
  → campus-scoped RLS unlocked for listings
```

## Monorepo Package Graph

```
apps/web
  ├── @campusnest/supabase   (browser + SSR clients)
  ├── @campusnest/types      (Zod schemas + TS types)
  ├── @campusnest/utils      (cost-calculator, fairness-scorer)
  └── @campusnest/ui         (Phase 2 stub — Tamagui)

services/scraper
  └── @campusnest/types

supabase/functions/*
  └── supabase-js (via esm.sh, no local deps)
```

## Related Codemaps
- [backend.md](./backend.md) — API routes + edge functions
- [frontend.md](./frontend.md) — page tree + components
- [data.md](./data.md) — database schema
- [dependencies.md](./dependencies.md) — external services
