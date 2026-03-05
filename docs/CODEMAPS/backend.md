<!-- Generated: 2026-03-04 | Files scanned: ~20 | Token estimate: ~500 -->
# Backend

## API Routes (apps/web/app/api/)

```
POST /api/ai/cribai     → validate query ≤500 → fetch pageindex_tree
                         → PageIndexTraverser.traverse → CribAI.chat → SSE stream
POST /api/webhooks/stripe → Stripe webhook handler
GET  /callback           → Supabase Auth OTP/OAuth callback
```

## Edge Functions (supabase/functions/)

```
POST /functions/v1/rate-limiter
  → count ai_query_logs in window → { allowed, remaining, limit }
  Tiers: free=10/hr, pro=50/hr, premium=200/hr

POST /functions/v1/verify-edu
  → validate .edu domain → match campus_configs.edu_domains
  → update profiles.is_edu_verified + campus_id

POST /functions/v1/rebuild-pageindex
  → for each campus: group listings by beds → price tiers
  → build PageIndexNode tree → upsert pageindex_trees

POST /functions/v1/recalculate-fairness
  → triggered post-scrape → recalculate fairness_score per listing
```

## Scraper Pipeline (services/scraper/)

```
run.ts → ApartmentsComScraper.scrape() → RawListing[]
       → normalizer.normalizeListing() → upsert listings table
```

## Key Classes

```
packages/ai/src/
  PageIndexBuilder.build(campusId, listings) → PageIndexNode
  PageIndexTraverser.traverse(tree, query) → string[] (relevant context)
  CribAI.chat({ query, tree, history }) → AsyncGenerator<string>

packages/utils/src/
  calculateTrueCost(input) → { rent, utilities, parking, ..., total }
  calculateFairnessScore(input) → { percentile, predictedRent, delta }
  calculateEnhancedFairness(input) → FairnessData (OLS model)
  selectComparables(config) → ComparableCandidate[]
  trainPriceModel(features) → PriceModelCoefficients
```

## Supabase Clients (packages/supabase/)

```
client.ts  → createClient()                    (browser, SSR cookies)
server.ts  → createServerComponentClient(cookies) (RSC read-only)
           → createSecretClient()              (service role, privileged)
```
