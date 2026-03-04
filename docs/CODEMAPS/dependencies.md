# Dependencies Codemap

**Last Updated:** 2026-03-04

## External Services

| Service | Purpose | Used By |
|---------|---------|---------|
| Supabase | PostgreSQL + PostGIS + Auth + Edge Functions + Storage | All packages, all edge functions |
| Anthropic Claude API | CribAI streaming advisor (Phase 5) | `packages/ai/`, `apps/web/app/api/ai/` |
| Stripe | Subscription billing (Phase 2 stub) | `apps/web/app/api/webhooks/stripe/` |
| apartments.com | Listing data source (scraped) | `services/scraper/` |
| GitHub Actions | Nightly cron scrape runner | `.github/workflows/nightly-scrape.yml` |
| Vercel | Hosting for `apps/web` | `.vercel/project.json` |

## Shared Internal Packages

| Package | Name | Consumers |
|---------|------|-----------|
| `packages/types` | `@campusnest/types` | `apps/web`, `packages/utils`, `packages/ai`, `services/scraper` |
| `packages/utils` | `@campusnest/utils` | `apps/web` (TrueCostCalculator), `supabase/functions/recalculate-fairness` |
| `packages/supabase` | `@campusnest/supabase` | `apps/web` |
| `packages/ai` | `@campusnest/ai` | `apps/web` (Phase 5) |
| `packages/ui` | `@campusnest/ui` | Phase 2 stub — no consumers yet |

## Key NPM Dependencies

### `apps/web`
| Package | Version | Purpose |
|---------|---------|---------|
| next | 15.x | App Router framework |
| @supabase/ssr | latest | SSR-safe Supabase client |
| @supabase/supabase-js | 2.x | Supabase client |
| tailwindcss | 4.x | Styling |
| zod | 3.x | Runtime validation (via types package) |

### `services/scraper`
| Package | Purpose |
|---------|---------|
| crawlee | Crawler orchestration |
| playwright | Browser automation for JS-heavy pages |
| @supabase/supabase-js | Upsert scraped listings |

### `packages/utils`
| Package | Purpose |
|---------|---------|
| (pure TS, no runtime deps) | Cost + fairness calc |

### `packages/ai`
| Package | Purpose |
|---------|---------|
| @anthropic-ai/sdk | Claude API (Phase 5 — currently stub) |

### Supabase Edge Functions
| Package | Source | Purpose |
|---------|--------|---------|
| @supabase/supabase-js v2 | `esm.sh` CDN | DB access from Deno |

## Build Toolchain

| Tool | Version | Purpose |
|------|---------|---------|
| pnpm | 9.x | Package manager + workspace |
| Turborepo | latest | Monorepo task runner + caching |
| TypeScript | 5.x | Type checking across all packages |
| Vitest | latest | Unit tests (`packages/utils`, `services/scraper`) |
| tsup / tsc | — | Package builds (each package has its own tsconfig) |

## Environment Variables

| Variable | Used By | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | apps/web, scraper | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | apps/web | Public anon key |
| `SUPABASE_SECRET_KEY` | scraper, edge functions | Service role key — never expose client-side |
| `ANTHROPIC_API_KEY` | apps/web (Phase 5) | Claude API key |

See `.env.example` for full list.

## Related Codemaps
- [architecture.md](./architecture.md) — how services connect
- [backend.md](./backend.md) — which services each backend module calls
