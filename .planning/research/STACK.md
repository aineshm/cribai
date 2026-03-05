# Technology Stack -- Milestone 2 Additions

**Project:** CampusNest
**Researched:** 2026-03-05
**Scope:** What to ADD for semantic search, saved listings/alerts, roommate matching, and multi-source scraping. Existing stack (Next.js 15, Supabase, Gemini, Crawlee, Tailwind v4, Vitest) is not re-evaluated.

## Recommended Stack Additions

### Semantic Search: Vector Embeddings via pgvector + Gemini

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| pgvector (Postgres extension) | 0.7+ | Store and query listing embeddings in Supabase | Already available on Supabase, no external vector DB needed. Keeps data co-located with listings table. HNSW index gives ~1.5ms queries vs 650ms sequential scan. | HIGH |
| `gemini-embedding-001` (model) | current | Generate 768-dim embeddings for listings and queries | Already using `@google/genai` SDK -- `ai.models.embedContent()` is built in. No new dependency. Deprecates `text-embedding-004`. Use 768 dimensions (not 3072) to keep pgvector storage and HNSW index size manageable for student housing scale (<50K listings). | HIGH |
| Supabase `match_listings` RPC | N/A | Cosine similarity search via Postgres function | Standard Supabase pattern: create a Postgres function that takes a query vector and returns listings ordered by `1 - (embedding <=> query_embedding)`. Avoids client-side vector math. | HIGH |

**How it works:**
1. Scraper upserts listing --> Edge Function calls `ai.models.embedContent()` on a text representation (address + amenities + description)
2. Embedding stored as `embedding vector(768)` column directly on the `listings` table
3. User query --> embed query text --> call `match_listings(query_embedding, campus_id, match_count)` RPC
4. Results ranked by cosine similarity, combined with SQL WHERE clauses for hybrid search

**Key decision: Column on listings table, not a separate table.**
Add `embedding vector(768)` directly to the `listings` table. This enables single-table hybrid queries combining vector similarity with SQL filters (campus_id, bedrooms, price range) without JOINs. At 768 dims with <50K listings, the row size increase is manageable. Rebuilding embeddings can be done with UPDATE in place.

**HNSW index config:**
```sql
CREATE INDEX idx_listings_embedding ON listings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```
At <50K vectors with 768 dims, these defaults are fine. No need for IVFFlat (requires reindexing after bulk inserts). HNSW can be created on an empty table and auto-updates as rows are inserted.

**Embedding task types (critical):**
- Use `RETRIEVAL_DOCUMENT` when embedding listings (documents being searched)
- Use `RETRIEVAL_QUERY` when embedding user search queries
- Mismatching these degrades similarity scores significantly

### Saved Listings and Price Alerts

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Supabase Realtime (Postgres Changes) | built-in | Push notifications to connected clients for live UI updates | Already included in `@supabase/supabase-js`. Subscribe to `notifications` table INSERT events filtered by user_id. Zero new dependencies. | HIGH |
| `pg_cron` + `pg_net` (Postgres extensions) | built-in on Supabase | Scheduled alert digest emails and batch notification generation | Runs entirely in Supabase -- no external cron service needed. Schedule a nightly job that queries price changes on saved listings and calls an Edge Function to generate notifications and send email digests. | HIGH |
| Resend | latest | Transactional email for alert digests | Simple API, generous free tier (100 emails/day), excellent DX with React Email templates. Already TypeScript-native. Alternatives: SendGrid (heavier), Postmark (pricier). | MEDIUM |
| `@react-email/components` | latest | Email templates | Build email templates with React components, render to HTML for Resend. Matches the existing React/Next.js stack. | MEDIUM |

**Architecture:**
- `saved_listings` table: `(user_id, listing_id, saved_at, notes)`
- `price_history` table: `(listing_id, old_price, new_price, changed_at)` -- populated by DB trigger on listings UPDATE
- `notifications` table: durable inbox `(user_id, type, title, body, metadata, is_read)`
- Realtime: client subscribes to `notifications` INSERT for their user_id (live UI updates)
- pg_cron: nightly job generates notifications for price changes, then triggers Edge Function for email digest

**Important:** Do NOT use Supabase Realtime Postgres Changes for batch alert processing. Realtime is for live UI delivery. Batch notification generation happens server-side via pg_cron + Edge Functions. This avoids the fan-out problem where every price change triggers RLS checks for every connected client.

**What NOT to use:**
- **Pusher/Ably/Socket.io**: Supabase Realtime already provides WebSocket channels. Adding a separate real-time service is redundant and adds cost.
- **AWS SES**: Overkill for low-volume student alerts. Resend is simpler.
- **Firebase Cloud Messaging**: Wrong ecosystem. Not needed for web-first alerts.

### Roommate Matching

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Weighted scoring function (custom) | N/A | Score compatibility across preference dimensions | Use weighted scoring for v1: cleanliness (0.25), noise (0.20), sleep schedule (0.20), budget overlap (0.15), guest frequency (0.10), smoking/pets (0.10). Simple, explainable, requires no training data. | MEDIUM |
| SQL pre-filtering | N/A | Hard constraint filtering before scoring | Filter by campus_id, budget overlap, move_in_date proximity, dealbreakers (smoking, pets) as WHERE clauses. Score only the candidates that pass hard filters. | HIGH |

**Why weighted scoring over embeddings for v1:**
Weighted scoring is simpler, fully explainable ("85% match: you both prefer quiet and clean"), and works with zero profiles. Embeddings add complexity without clear benefit when the preference space is structured (enums and numbers, not free text). If free-text bios become important later, add embedding similarity as a component of the score.

**Why NOT a recommendation engine (collaborative filtering):**
Collaborative filtering needs behavioral data (who actually became roommates and were satisfied). CampusNest has zero behavioral data at launch. Content-based matching via weighted scoring works with zero interaction history.

**Schema extension to `roommate_profiles`:**
The existing table has only `preferences jsonb`. Extend with structured fields:
- `sleep_schedule`, `cleanliness_level`, `noise_level`, `guest_frequency` (enum/numeric for scoring)
- `bio` (free text, displayed to matches)
- `budget_min`, `budget_max` (numeric for range filtering)
- `move_in_date` (date for temporal matching)
- `smoking_ok`, `pets_ok` (boolean dealbreakers)

### Multi-Source Scraping

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Crawlee `PlaywrightCrawler` (existing) | ^3.12 | Scrape JS-rendered rental sites | Already in use for Apartments.com. Same crawler class works for Zillow, Trulia, Rent.com. The `BaseScraper` abstract class in `services/scraper/scrapers/base-scraper.ts` is already designed for this -- just add new implementations. | HIGH |
| Crawlee `CheerioCrawler` | ^3.12 (same package) | Scrape static HTML sites (Craigslist, university housing boards) | Faster and cheaper than Playwright for sites that don't need JS rendering. Already included in the `crawlee` dependency. | HIGH |
| `scraper-registry.ts` (custom) | N/A | Source registry and orchestrator | New file that maps campus configs to available scrapers. Each campus defines which sources to scrape. Registry dispatches to correct `BaseScraper` implementation. | HIGH |
| Proxy rotation (Crawlee built-in) | N/A | Avoid rate limiting across sources | Crawlee's `ProxyConfiguration` supports proxy lists and rotation. Essential for Zillow/Trulia which aggressively block scrapers. | MEDIUM |

**New scraper implementations to build:**
1. `zillow.ts extends BaseScraper` -- Zillow rental listings (JS-rendered, needs Playwright)
2. `craigslist.ts extends BaseScraper` -- Craigslist housing (static HTML, use Cheerio)
3. `manual-entry.ts extends BaseScraper` -- Admin/landlord manual submissions (reads from `manual_listings` table, no scraping)

**What NOT to use:**
- **Zillow API**: No public rental API exists. Must scrape.
- **Apify Cloud**: Adds vendor dependency and cost. Crawlee (by Apify) runs locally/in GitHub Actions for free.
- **Puppeteer**: Crawlee already wraps Playwright. No reason to add Puppeteer alongside it.
- **Separate scraping services (ScraperAPI, ScrapFly)**: Cost per request. At nightly scraping frequency across 3-5 campuses, self-hosted Crawlee in GitHub Actions is effectively free.

**Deduplication across sources:**
Listings from different sources for the same property need dedup. Strategy:
- Normalize address (lowercase, expand abbreviations, strip unit suffixes)
- Match on normalized address + geo proximity (<50m) + bedroom count
- Keep the most complete listing, merge amenity data from multiple sources
- Track all sources in a `listing_sources` table for attribution

### Supporting Infrastructure

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `pg_cron` extension | built-in | Schedule alert digests, stale listing cleanup, embedding cache invalidation | Already available on Supabase. Use for: daily alert digest, weekly cleanup of delisted properties, conditional embedding refresh. | HIGH |
| `pg_net` extension | built-in | HTTP calls from Postgres to Edge Functions | Used by pg_cron to invoke Edge Functions. No external dependency. | HIGH |
| Supabase Edge Functions (existing) | Deno runtime | Embedding generation, alert sending, manual listing intake | Already in use for PageIndex rebuild. Add new functions for embedding generation and alert dispatch. | HIGH |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Vector DB | pgvector in Supabase | Pinecone, Weaviate, Qdrant | External vector DB adds latency, cost, and ops burden. pgvector is co-located with data, free on Supabase, and handles <50K vectors trivially. |
| Embedding model | Gemini `gemini-embedding-001` | OpenAI `text-embedding-3-small`, Cohere `embed-v4` | Already using `@google/genai` SDK. Adding another AI provider means another API key, billing, and SDK. Gemini embeddings are competitive quality. |
| Real-time | Supabase Realtime | Pusher, Ably, Socket.io | Already built into Supabase client. Zero additional cost or dependencies. |
| Email | Resend | SendGrid, AWS SES, Postmark | Resend has best DX for TypeScript + React Email. Free tier covers early usage. SendGrid has poor DX; SES requires AWS setup; Postmark is expensive. |
| Roommate matching | Weighted scoring | Embedding similarity, collaborative filtering | Weighted scoring is simpler, explainable, and works with structured preferences. CF needs behavioral data. Embeddings are overkill for structured enum/numeric preferences. |
| Scraping infra | Self-hosted Crawlee in GitHub Actions | ScraperAPI, Apify Cloud, BrightData | Free at CampusNest scale. No per-request costs. Already proven with Apartments.com scraper. |

## New Dependencies to Install

```bash
# No new npm packages needed for core functionality!
# @google/genai already supports embedContent()
# @supabase/supabase-js already supports Realtime
# crawlee already includes CheerioCrawler

# Only new dependency: email
pnpm add resend @react-email/components --filter @campusnest/web
```

**This is a key finding: the existing stack already contains nearly everything needed.** The major work is:
1. Enabling pgvector extension in Supabase (SQL migration, not npm)
2. Writing Postgres functions for vector search
3. Implementing new scraper classes following the existing `BaseScraper` pattern
4. Building the saved listings / alerts tables and Edge Functions
5. Extending roommate profiles schema and building the matching logic

## Database Extensions to Enable

```sql
-- In a new migration (003_semantic_search.sql)
CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector

-- In a new migration (004_alerts_infrastructure.sql)
CREATE EXTENSION IF NOT EXISTS pg_cron;  -- scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_net;   -- HTTP from Postgres
```

## Environment Variables to Add

```bash
# Email (Resend)
RESEND_API_KEY=re_...

# Optional: proxy for scraping (if needed)
SCRAPER_PROXY_URL=http://...
```

## Version Verification

| Technology | Claimed Version | Verified Source | Verification Status |
|------------|----------------|-----------------|---------------------|
| pgvector | 0.7+ | Supabase docs (auto-updated) | HIGH -- Supabase manages the extension version |
| gemini-embedding-001 | current GA | Google Developers Blog, Gemini API docs | HIGH -- GA model, replaces deprecated text-embedding-004 |
| Crawlee | ^3.12 | Already in package.json | HIGH -- existing dependency |
| Supabase Realtime | built-in | Supabase docs | HIGH -- core feature of @supabase/supabase-js |
| pg_cron | built-in | Supabase docs | HIGH -- available on all Supabase projects |
| Resend | latest | resend.com | MEDIUM -- recommended based on ecosystem reputation |
| @react-email/components | latest | react.email | MEDIUM -- companion library to Resend |

## Sources

- [Supabase pgvector docs](https://supabase.com/docs/guides/database/extensions/pgvector)
- [Supabase HNSW indexes](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes)
- [Supabase semantic search guide](https://supabase.com/docs/guides/ai/semantic-search)
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Supabase Cron (pg_cron)](https://supabase.com/docs/guides/cron)
- [Supabase scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Gemini Embedding API docs](https://ai.google.dev/gemini-api/docs/embeddings)
- [Gemini Embedding GA announcement](https://developers.googleblog.com/gemini-embedding-available-gemini-api/)
- [Crawlee parallel scraping guide](https://crawlee.dev/js/docs/guides/parallel-scraping)
