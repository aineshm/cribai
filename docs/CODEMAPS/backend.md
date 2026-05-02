<!-- Updated: 2026-04-22 | Runtime rebuild backend map -->
# Backend

## API Routes (apps/web/app/api/)

```
POST /api/ai/cribai     → validate query ≤500 → load conversation + conversation_state
                         → deterministic runtime for search/detail/compare/tour
                         → fallback CribAI stream for unsupported turns
                         → persist assistant blocks + updated conversation_state
GET  /api/conversations → list conversations with normalized conversationState
POST /api/conversations → create conversation with default conversation_state
GET  /api/conversations/[id] → fetch conversation with normalized state
GET  /api/explore/viewport → bounded map/listing fetch by lat/lng bounds
POST /api/search/listings → normalized AI/manual listing search
GET  /api/listings/[id] → public listing detail fetch
POST /api/missions/run-next → claim and execute queued mission work
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
  CribAI.chat({ query, tree, history }) → AsyncGenerator<ChatEvent>
  executeTool(name, args, context) → ToolResult with machineData/statePatch
  runMissionQueueOnce({ maxJobs, leaseSeconds }) → claim/execute queued missions
  executeMission({ missionId, startFromStep }) → lease-aware step executor

packages/utils/src/
  calculateTrueCost(input) → { rent, utilities, parking, ..., total }
  calculateFairnessScore(input) → { percentile, predictedRent, delta }
  calculateEnhancedFairness(input) → FairnessData (OLS model)
  selectComparables(config) → ComparableCandidate[]
  trainPriceModel(features) → PriceModelCoefficients
```

## Runtime Tables And Migrations

```
032_conversation_state.sql
  conversations.conversation_state JSONB
  backfills selected listing from legacy context.listing_id

033_mission_runtime_queue.sql
  missions.attempt_count
  missions.leased_until
  missions.last_heartbeat_at
  missions.last_error
  missions.step_attempts
  claim_next_mission_job(p_lease_seconds)
```

## Mission Worker Entrypoints

```
pnpm worker:missions
pnpm worker:missions -- --once
POST /api/missions/run-next
GitHub Actions: .github/workflows/missions-worker.yml
```

Production note: worker code exists, but no production worker host is currently active.

## Supabase Clients (packages/supabase/)

```
client.ts  → createClient()                    (browser, SSR cookies)
server.ts  → createServerComponentClient(cookies) (RSC read-only)
           → createSecretClient()              (service role, privileged)
```
