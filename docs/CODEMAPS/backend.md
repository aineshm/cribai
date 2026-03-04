# Backend Codemap

**Last Updated:** 2026-03-04
**Entry Points:** `apps/web/middleware.ts`, `apps/web/app/api/`, `supabase/functions/`

## Next.js API Routes

| Route | Method | File | Status |
|-------|--------|------|--------|
| `/api/ai/cribai` | POST | `app/api/ai/cribai/route.ts` | Stub (Phase 5) |
| `/api/webhooks/stripe` | POST | `app/api/webhooks/stripe/route.ts` | Stub (Phase 2) |
| `/auth/callback` | GET | `app/(auth)/callback/route.ts` | Live — Supabase OAuth callback |

## Middleware (`apps/web/middleware.ts`)

Runs on every non-static request. Two enforcement layers:

1. **Auth guard** — `GET /[campusSlug]/cribai` redirects to `/login?next=...` if no session.
2. **Rate limit** — `POST /api/ai/*` calls `rate-limiter` edge function. Returns `429` if over quota.
3. **Unauth block** — `POST /api/ai/*` with no session returns `401`.

Matcher excludes `_next/static`, `_next/image`, `favicon.ico`, and image extensions.

## Supabase Edge Functions (Deno)

### `rate-limiter`
- **Trigger:** Called by middleware on every `/api/ai/*` request
- **Logic:** Reads `profiles.subscription_tier`, counts `ai_query_logs` rows in the rolling window
- **Limits:** free=10/hr, pro=50/hr, premium=200/hr
- **Returns:** `{ allowed, remaining, limit, windowMinutes }`

### `verify-edu`
- **Trigger:** Called from `/verify-edu` page (user-initiated)
- **Logic:** Extracts domain from submitted `eduEmail`, matches against `campus_configs.edu_domains`
- **Side effect:** Sets `profiles.is_edu_verified=true`, `campus_id`, `verification_status='verified'`
- **Returns:** `{ verified, campusId }`
- **Note:** MVP auto-verifies. Production TODO: send verification email first.

### `recalculate-fairness`
- **Trigger:** Called by nightly scrape GitHub Actions job post-scrape
- **Auth:** Service role key check (bearer token contains secret key)
- **Logic:** For each public campus, computes percentile-based fairness score across all active listings
- **Side effect:** Updates `listings.fairness_score` (1–10) and `listings.fairness_data` (jsonb)
- **Algorithm:** `score = 1 + (pctCheaperThanThis / total) * 9`

### `rebuild-pageindex`
- **Trigger:** Planned for Phase 5
- **Status:** Stub — not yet implemented
- **Planned:** Builds hierarchical RAG summary tree using Claude Haiku, stores in `pageindex_trees`

## Scraper Service (`services/scraper/`)

| File | Purpose |
|------|---------|
| `scrapers/base-scraper.ts` | Abstract `BaseScraper` — `scrape(): Promise<RawListing[]>` |
| `scrapers/apartments-com.ts` | Crawlee + Playwright implementation for apartments.com |
| `normalizer.ts` | Converts `RawListing` → Supabase upsert payload |
| `run.ts` | Entry point — loads campus configs, runs scrapers |

**Scraper config:** `ScraperConfig` carries `campusId`, `campusSlug`, `latitude`, `longitude`, `radiusKm`.
**Dedup key:** `UNIQUE(external_id, source)` in `listings` table.
**Pagination:** Up to `MAX_PAGES=10` pages per campus search.

## Shared Packages (business logic)

### `packages/utils/`

| Module | Exports | Purpose |
|--------|---------|---------|
| `cost-calculator.ts` | `calculateTrueCost(input)` | Adds utilities, parking, internet, laundry, insurance to base rent |
| `fairness-scorer.ts` | `calculateFairnessScore()`, `calculateEnhancedFairness()` | Percentile + ML-based value scoring |
| `comparable-selector.ts` | `selectComparables()` | Filters listings by bedroom count + distance |
| `price-model.ts` | `trainPriceModel()`, `predictRent()` | Linear regression on amenity/size/distance features |

### `packages/ai/` (Phase 5 stubs)

| Module | Class | Status |
|--------|-------|--------|
| `cribai.ts` | `CribAI.chat(campusId, query)` | Stub — yields placeholder string |
| `pageindex-builder.ts` | `PageIndexBuilder.build(campusId)` | Stub — returns placeholder root node |
| `pageindex-traverser.ts` | `PageIndexTraverser` | Stub |

## Related Codemaps
- [architecture.md](./architecture.md) — system diagram
- [data.md](./data.md) — tables queried by each function
