# Architecture Patterns

**Domain:** AI-native student housing platform (semantic search, real-time alerts, roommate matching, multi-source scraping)
**Researched:** 2026-03-05

## Recommended Architecture

The four new capabilities integrate as layers beneath the existing agentic chat architecture. No rewrites needed -- each plugs into existing extension points (tool handlers, BaseScraper, Supabase schema, SSE events).

```
+-----------------------------------------------------------+
|                    Next.js 15 App Router                   |
|  (pages, API routes, SSE streaming, Realtime subscriptions)|
+-----------------------------------------------------------+
        |              |              |              |
   CribAI Engine  Saved Listings  Roommate UI   Alert Toast
   (agentic loop)  (CRUD pages)   (match page)  (Realtime WS)
        |              |              |              |
+-----------------------------------------------------------+
|                   packages/ai/                            |
|  CribAI + PageIndex + Tools + NEW: SemanticSearchTool     |
|  NEW: semantic_search tool handler                        |
|  NEW: find_roommates tool handler                         |
+-----------------------------------------------------------+
        |                                          |
+---------------------------+   +-------------------+
| packages/matching/        |   | packages/supabase/|
| NEW: compatibility engine |   | existing clients  |
| weighted scoring          |   | + Realtime channel|
+---------------------------+   +-------------------+
        |                              |
+-----------------------------------------------------------+
|              Supabase PostgreSQL + pgvector                |
|  listings (+ embedding column)                            |
|  saved_listings + price_history (NEW tables)              |
|  roommate_profiles (existing, expand preferences jsonb)   |
|  match_listings() RPC (NEW vector similarity function)    |
+-----------------------------------------------------------+
        ^
        |
+-----------------------------------------------------------+
|              Scraper Pipeline (multi-source)               |
|  BaseScraper → ApartmentsComScraper (existing)            |
|               → ZillowScraper (NEW)                       |
|               → ManualEntryScraper (NEW, API-backed)      |
|  Normalizer → Embedder → Upserter → Fairness + PageIndex |
+-----------------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With | New/Existing |
|-----------|---------------|-------------------|--------------|
| **Embedding Pipeline** | Generate and store vector embeddings for listings | Gemini API (gemini-embedding-001), Supabase listings table | NEW |
| **Semantic Search Tool** | Vector similarity search invoked by CribAI | pgvector RPC, CribAI tool registry | NEW |
| **Saved Listings Service** | CRUD for user favorites, price tracking | Supabase saved_listings + price_history tables | NEW |
| **Alert System** | Detect price/availability changes, notify users | Supabase Realtime (Postgres Changes), Next.js client | NEW |
| **Roommate Matching Engine** | Compute compatibility scores between profiles | Supabase roommate_profiles table, weighted scoring logic | NEW |
| **Multi-Source Scraper Registry** | Orchestrate multiple BaseScraper implementations | BaseScraper subclasses, normalizer, embedding pipeline | EXTEND |
| **CribAI Tool Registry** | Dispatch function calls to handlers | All tool handlers (existing 6 + new semantic_search, find_roommates) | EXTEND |
| **PageIndex RAG** | Hierarchical context retrieval (coarse-grained) | Gemini, pageindex_trees table | EXISTING (keep) |

### Data Flow

**1. Listing Ingestion with Embeddings (extends nightly pipeline)**

```
GitHub Actions trigger
  → ScraperRegistry iterates all registered scrapers
    → Each BaseScraper.scrape() returns RawListing[]
      → Normalizer standardizes across sources
        → Deduplicator resolves cross-source duplicates (address + geo proximity)
          → Upserter writes to listings table
            → EmbeddingPipeline batches listing text → Gemini gemini-embedding-001
              → Stores 768-dim vector in listings.embedding column
                → Triggers: recalculate-fairness, rebuild-pageindex edge functions
                  → Triggers: price_history insert for changed prices
```

Key design decision: embeddings are generated at ingestion time (not query time) and stored in the listings table alongside the listing data. This keeps the embedding co-located with the row for efficient hybrid queries.

**2. Semantic Search Query Flow (new tool in agentic loop)**

```
User: "quiet place near campus with natural light"
  → CribAI agentic loop receives query
    → Gemini decides to call semantic_search tool
      → Tool handler embeds the query text via gemini-embedding-001
        → Calls match_listings() Supabase RPC function
          → pgvector cosine similarity search with HNSW index
            → Optional: filter by campus_id, bedrooms, price range (hybrid search)
              → Returns top-K listings ranked by semantic similarity
                → Tool returns ToolResult with modelContext + ListingCardBlock
```

The semantic_search tool complements (does not replace) the existing search_listings tool. CribAI can use either depending on the query -- structured queries ("2 bed under $1200") use the filter-based tool, qualitative queries ("quiet with natural light") use semantic search. The LLM decides which tool to invoke.

**3. Saved Listings and Price Alerts Flow**

```
Save Flow:
  User clicks "Save" on listing card
    → POST /api/saved-listings { listingId }
      → Insert into saved_listings table (user_id, listing_id)
        → Return confirmation

Alert Detection (async, runs after scraper pipeline):
  Scraper upserts listing with new rent_monthly
    → Database trigger: INSERT INTO price_history (listing_id, old_price, new_price)
      → Supabase Realtime broadcasts INSERT on price_history table
        → Client-side: channel.on('postgres_changes', { table: 'price_history' })
          → Filter: only show if listing_id IN user's saved_listings
            → Render alert toast in UI

Alternative (Edge Function push):
  After scraper completes
    → Edge function queries: saved_listings JOIN price_history WHERE changed today
      → For each affected user: insert into notifications table
        → Client subscribes to notifications table via Realtime
```

Architecture decision: Use the Edge Function approach for alerts rather than pure client-side Realtime filtering. Reason: users may not have the app open when prices change. The notifications table acts as a durable inbox. Realtime provides instant delivery when the user IS online; the notifications table ensures they see it when they return.

**4. Roommate Matching Flow**

```
Profile Creation:
  User fills roommate profile form
    → POST /api/roommate-profile { preferences }
      → Upsert roommate_profiles (preferences jsonb, campus_id)

Match Discovery:
  User views "Find Roommates" page
    → GET /api/roommate-matches
      → Server: query all active roommate_profiles WHERE campus_id = user's campus
        → CompatibilityEngine.score(userProfile, candidateProfiles)
          → Weighted scoring across dimensions (sleep, cleanliness, budget, noise, guests)
            → Return top matches sorted by compatibility score
              → Render match cards with compatibility percentage

AI-Assisted (via CribAI):
  User: "find me a roommate who's quiet and clean"
    → CribAI calls find_roommates tool with extracted preferences
      → Tool queries roommate_profiles, scores, returns top matches
        → Returns ToolResult with modelContext + RoommateMatchBlock (NEW block type)
```

**5. Multi-Source Scraper Architecture**

```
ScraperRegistry (new orchestrator):
  constructor(scraperConfigs: ScraperConfig[])

  async scrapeAll(campusConfig):
    results = []
    for each registered scraper:
      try:
        rawListings = await scraper.scrape()
        normalized = normalizer.normalize(rawListings)
        results.push(...normalized)
      catch:
        log warning, continue to next scraper

    deduplicated = deduplicator.resolve(results)
    return deduplicated

Deduplication Strategy:
  1. Same source: external_id + source (existing UNIQUE constraint)
  2. Cross-source: normalized address + geo proximity (<50m)
     → Keep the listing with more complete data
     → Store all source references in a sources jsonb array
```

## Patterns to Follow

### Pattern 1: Hybrid Search (Semantic + Structured Filters)

**What:** Combine pgvector similarity with traditional SQL WHERE clauses in a single query.
**When:** User queries mix qualitative descriptions with hard constraints.
**Why:** Pure vector search ignores price/bedroom filters. Pure SQL ignores "quiet with natural light." Hybrid gives best of both.

```sql
-- Supabase RPC function: match_listings
CREATE OR REPLACE FUNCTION match_listings(
  query_embedding vector(768),
  match_campus_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_bedrooms int DEFAULT NULL,
  filter_max_rent numeric DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  address text,
  rent_monthly numeric,
  bedrooms smallint,
  bathrooms numeric,
  sqft numeric,
  amenities jsonb,
  fairness_score numeric,
  true_cost_total numeric,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id, l.address, l.rent_monthly, l.bedrooms, l.bathrooms,
    l.sqft, l.amenities, l.fairness_score, l.true_cost_total,
    1 - (l.embedding <=> query_embedding) AS similarity
  FROM listings l
  WHERE l.campus_id = match_campus_id
    AND l.is_active = true
    AND 1 - (l.embedding <=> query_embedding) > match_threshold
    AND (filter_bedrooms IS NULL OR l.bedrooms = filter_bedrooms)
    AND (filter_max_rent IS NULL OR l.rent_monthly <= filter_max_rent)
  ORDER BY l.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

**Confidence:** HIGH -- this is the documented Supabase pattern for pgvector semantic search (see [Supabase Semantic Search docs](https://supabase.com/docs/guides/ai/semantic-search)).

### Pattern 2: Embedding at Ingestion, Not Query-Time

**What:** Generate embeddings when listings are scraped/updated, store in the listings table. Only embed the query at search time.
**When:** Always. Listing data changes infrequently (daily scrape). Queries happen constantly.
**Why:** Amortizes expensive embedding API calls. A listing is embedded once; it may be searched thousands of times.

```typescript
// In the scraper pipeline, after normalization
async function embedListings(listings: NormalizedListing[]): Promise<void> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  // Batch embeddings (Gemini supports batch)
  const texts = listings.map(l => buildEmbeddingText(l));
  const response = await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: texts,
    config: { outputDimensionality: 768 }, // MRL: use 768 for cost/perf balance
  });

  // Store embeddings alongside listing data
  for (let i = 0; i < listings.length; i++) {
    await supabase.from('listings')
      .update({ embedding: response.embeddings[i].values })
      .eq('id', listings[i].id);
  }
}

function buildEmbeddingText(listing: NormalizedListing): string {
  return [
    listing.address,
    `${listing.bedrooms} bedroom ${listing.bathrooms} bathroom`,
    `$${listing.rentMonthly}/month`,
    `${listing.sqft} sqft`,
    listing.amenities.join(', '),
    listing.description ?? '',
  ].join('. ');
}
```

**Confidence:** HIGH -- Gemini gemini-embedding-001 is GA, supports batch embeddings, and MRL allows 768-dim output (see [Gemini Embeddings docs](https://ai.google.dev/gemini-api/docs/embeddings)).

### Pattern 3: Durable Notification Inbox

**What:** Write alerts to a `notifications` table, use Supabase Realtime for instant delivery, query on page load for missed alerts.
**When:** Any async event the user should know about (price drop, new match, listing removed).
**Why:** Realtime WebSockets only work when the client is connected. A durable inbox ensures nothing is lost.

```typescript
// Client-side: subscribe to real-time notifications
const channel = supabase
  .channel('user-notifications')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`,
    },
    (payload) => {
      showToast(payload.new);
    }
  )
  .subscribe();

// On page load: fetch unread notifications
const { data } = await supabase
  .from('notifications')
  .select('*')
  .eq('user_id', userId)
  .eq('is_read', false)
  .order('created_at', { ascending: false });
```

**Confidence:** HIGH -- Supabase Realtime Postgres Changes is well-documented and production-ready (see [Supabase Realtime docs](https://supabase.com/docs/guides/realtime/postgres-changes)).

### Pattern 4: Weighted Compatibility Scoring

**What:** Score roommate compatibility using weighted dimensions with normalized values.
**When:** Comparing two roommate profiles across multiple preference axes.
**Why:** Simple, interpretable, and tunable. No ML training data needed for v1.

```typescript
interface RoommatePreferences {
  readonly sleepSchedule: 'early' | 'normal' | 'late' | 'varies';
  readonly cleanlinessLevel: 1 | 2 | 3 | 4 | 5;
  readonly noiseLevel: 1 | 2 | 3 | 4 | 5;
  readonly guestFrequency: 'rarely' | 'sometimes' | 'often';
  readonly budgetRange: { readonly min: number; readonly max: number };
  readonly smokingOk: boolean;
  readonly petsOk: boolean;
  readonly studyHabits: 'home' | 'library' | 'both';
}

const WEIGHTS: Record<string, number> = {
  cleanlinessLevel: 0.25,  // highest friction point
  noiseLevel: 0.20,
  sleepSchedule: 0.20,
  budgetRange: 0.15,
  guestFrequency: 0.10,
  smokingOk: 0.05,         // binary dealbreaker scored separately
  petsOk: 0.05,
};
```

**Confidence:** MEDIUM -- weights are based on student housing research patterns; will need tuning with real user data.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Replacing PageIndex with Vector Search Entirely

**What:** Ripping out the PageIndex hierarchical RAG and using only pgvector for context retrieval.
**Why bad:** PageIndex provides structured, predictable context that works well for factual queries ("list all 2-bedrooms under $1000"). Vector search excels at qualitative queries but can miss structured data. They serve different purposes.
**Instead:** Keep both. The CribAI agentic loop already supports multiple tools -- add semantic_search alongside the existing search_listings. Let the LLM decide which to use based on query type.

### Anti-Pattern 2: Client-Side Realtime Filtering for Alerts

**What:** Having every client subscribe to ALL price_history changes and filter locally.
**Why bad:** Broadcasts every price change to every connected client. Wastes bandwidth. Breaks with more than a few hundred concurrent users. Leaks data across campus boundaries.
**Instead:** Use server-side notifications table. Edge function writes targeted notifications per-user. Client subscribes only to their own notifications row (RLS-filtered).

### Anti-Pattern 3: Real-Time Embedding Generation on Every Search

**What:** Embedding the entire listing corpus on each search query.
**Why bad:** Gemini embedding API calls are not free. Listing data changes once per day. Re-embedding 500+ listings per query is wasteful and slow.
**Instead:** Embed at ingestion time. Only the user's query text needs embedding at search time (single API call, ~50ms).

### Anti-Pattern 4: Monolithic Scraper with Source-Specific Logic

**What:** Adding if/else branches to ApartmentsComScraper for different sources.
**Why bad:** Violates single responsibility. Each source has different DOM structure, rate limits, and anti-bot measures.
**Instead:** One BaseScraper subclass per source. ScraperRegistry orchestrates. Normalizer is source-agnostic.

### Anti-Pattern 5: Storing Embeddings in a Separate Table

**What:** Creating a `listing_embeddings` table separate from `listings`.
**Why bad:** Requires JOINs for every vector search. Harder to keep in sync. Cannot do hybrid queries (vector + SQL filters) efficiently.
**Instead:** Add an `embedding vector(768)` column directly to the `listings` table. Co-located data enables single-table hybrid queries.

## New Database Schema

### New Tables

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to existing listings table
ALTER TABLE listings ADD COLUMN embedding vector(768);
ALTER TABLE listings ADD COLUMN description text;

-- HNSW index for fast similarity search
CREATE INDEX idx_listings_embedding ON listings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Saved Listings
CREATE TABLE saved_listings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  listing_id  uuid REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  saved_at    timestamptz DEFAULT now(),
  notes       text,
  UNIQUE(user_id, listing_id)
);

ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_saved" ON saved_listings
  FOR ALL USING (auth.uid() = user_id);

-- Price History (populated by trigger on listings UPDATE)
CREATE TABLE price_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  old_price   numeric NOT NULL,
  new_price   numeric NOT NULL,
  changed_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_price_history_listing ON price_history (listing_id, changed_at DESC);

-- Trigger: auto-record price changes
CREATE OR REPLACE FUNCTION record_price_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.rent_monthly IS DISTINCT FROM NEW.rent_monthly THEN
    INSERT INTO price_history (listing_id, old_price, new_price)
    VALUES (NEW.id, OLD.rent_monthly, NEW.rent_monthly);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_listing_price_change
  AFTER UPDATE OF rent_monthly ON listings
  FOR EACH ROW EXECUTE FUNCTION record_price_change();

-- Notifications (durable inbox for alerts)
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type        text NOT NULL CHECK (type IN ('price_drop', 'price_increase', 'listing_removed', 'new_match', 'roommate_match')),
  title       text NOT NULL,
  body        text NOT NULL,
  metadata    jsonb DEFAULT '{}',
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, is_read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_notifications" ON notifications
  FOR ALL USING (auth.uid() = user_id);

-- Expand roommate_profiles with structured preferences
-- (existing table, ALTER to add structured columns)
ALTER TABLE roommate_profiles ADD COLUMN IF NOT EXISTS
  sleep_schedule text CHECK (sleep_schedule IN ('early', 'normal', 'late', 'varies'));
ALTER TABLE roommate_profiles ADD COLUMN IF NOT EXISTS
  cleanliness_level smallint CHECK (cleanliness_level BETWEEN 1 AND 5);
ALTER TABLE roommate_profiles ADD COLUMN IF NOT EXISTS
  noise_level smallint CHECK (noise_level BETWEEN 1 AND 5);
ALTER TABLE roommate_profiles ADD COLUMN IF NOT EXISTS
  guest_frequency text CHECK (guest_frequency IN ('rarely', 'sometimes', 'often'));
ALTER TABLE roommate_profiles ADD COLUMN IF NOT EXISTS
  budget_min numeric;
ALTER TABLE roommate_profiles ADD COLUMN IF NOT EXISTS
  budget_max numeric;
ALTER TABLE roommate_profiles ADD COLUMN IF NOT EXISTS
  smoking_ok boolean DEFAULT false;
ALTER TABLE roommate_profiles ADD COLUMN IF NOT EXISTS
  pets_ok boolean DEFAULT false;
ALTER TABLE roommate_profiles ADD COLUMN IF NOT EXISTS
  bio text;
ALTER TABLE roommate_profiles ADD COLUMN IF NOT EXISTS
  move_in_date date;

ALTER TABLE roommate_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campus_roommates_select" ON roommate_profiles
  FOR SELECT USING (
    campus_id = (SELECT campus_id FROM profiles WHERE id = auth.uid())
    AND is_active = true
  );
CREATE POLICY "own_roommate_profile" ON roommate_profiles
  FOR ALL USING (auth.uid() = id);

-- Listing source tracking for multi-source dedup
CREATE TABLE listing_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  source      text NOT NULL,
  external_id text NOT NULL,
  source_url  text,
  last_seen   timestamptz DEFAULT now(),
  UNIQUE(source, external_id)
);
```

## Component Integration Map

### How New Components Wire Into Existing Architecture

```
EXISTING                          NEW INTEGRATION POINT
─────────────────────────────────────────────────────────────
CribAI tool registry              + semantic_search handler
  (executor.ts)                   + find_roommates handler

ChatBlock types                   + RoommateMatchBlock
  (packages/types/chat.ts)        + PriceAlertBlock
                                  + SavedListingBlock

BaseScraper abstract class        + ZillowScraper extends BaseScraper
  (services/scraper/)             + ManualEntryScraper extends BaseScraper
                                  + ScraperRegistry orchestrator

Nightly pipeline                  + EmbeddingPipeline step (after normalize)
  (GitHub Actions)                + NotificationGenerator step (after upsert)

Supabase client factory           + Realtime channel subscriptions
  (packages/supabase/)              (for notification delivery)

Next.js App Router                + /api/saved-listings (CRUD)
  (apps/web/app/api/)             + /api/roommate-profile (CRUD)
                                  + /api/roommate-matches (GET)
                                  + /api/notifications (GET, PATCH)

React components                  + SaveButton component
  (apps/web/components/)          + NotificationBell component
                                  + RoommateProfileForm component
                                  + RoommateMatchCard component
```

## Suggested Build Order

Dependencies between components dictate this order:

### Phase A: Semantic Search (foundation for everything)

**Must come first because:** Embeddings are a prerequisite for semantic search, which is the core differentiator. The embedding pipeline also plugs into the scraper pipeline, which other features depend on.

1. Enable pgvector extension, add `embedding vector(768)` column to listings
2. Create `match_listings()` RPC function with HNSW index
3. Build embedding pipeline (Gemini gemini-embedding-001, batch processing)
4. Integrate embedding step into scraper nightly pipeline
5. Create `semantic_search` tool handler in `packages/ai/src/tools/handlers/`
6. Register tool in CribAI tool schemas and executor
7. Backfill embeddings for existing listings

### Phase B: Saved Listings + Price Alerts

**Must come after A because:** Depends on the listings table changes from Phase A. Price history tracking is needed before alerts make sense.

1. Create `saved_listings`, `price_history`, `notifications` tables with RLS
2. Create price change trigger on listings table
3. Build saved listings API routes (CRUD)
4. Build SaveButton component and saved listings page
5. Build notification generation edge function (runs after scraper pipeline)
6. Build NotificationBell component with Supabase Realtime subscription
7. Wire notification delivery into the scraper pipeline

### Phase C: Roommate Matching

**Can be built in parallel with B after A is done.** No dependency on saved listings or alerts.

1. Expand `roommate_profiles` table with structured preference columns
2. Build compatibility scoring engine in `packages/matching/`
3. Create roommate profile API routes
4. Create `find_roommates` tool handler for CribAI
5. Build RoommateProfileForm and RoommateMatchCard components
6. Add RoommateMatchBlock to ChatBlock type system

### Phase D: Multi-Source Scraping

**Should come last because:** Requires the embedding pipeline (Phase A) and dedup infrastructure. The existing single-source scraper works for initial launch.

1. Create `listing_sources` table for cross-source tracking
2. Build ScraperRegistry orchestrator
3. Implement cross-source deduplication (address normalization + geo proximity)
4. Add new BaseScraper implementations (Zillow, manual entry API)
5. Update nightly pipeline to use ScraperRegistry
6. Add source attribution to listing cards

## Scalability Considerations

| Concern | At 5 campuses (launch) | At 50 campuses | At 500 campuses |
|---------|----------------------|----------------|-----------------|
| **Vector search** | HNSW on single table, <5K listings, <10ms | Partition by campus_id, ~50K listings | Separate vector indexes per campus partition |
| **Embedding costs** | ~$0.01/day (500 listings * batch) | ~$0.10/day | Consider self-hosted embedding model |
| **Realtime connections** | Supabase free tier handles it | Need Supabase Pro for connection limits | Supabase Enterprise or custom WebSocket layer |
| **Scraper pipeline** | Sequential, single GitHub Action | Parallel scrapers per campus | Distributed queue (BullMQ or similar) |
| **Roommate matching** | In-memory scoring, <100 profiles/campus | SQL-based pre-filtering | Consider embedding roommate profiles for vector matching |

## Sources

- [Supabase pgvector documentation](https://supabase.com/docs/guides/database/extensions/pgvector) -- HIGH confidence
- [Supabase Semantic Search guide](https://supabase.com/docs/guides/ai/semantic-search) -- HIGH confidence
- [Supabase HNSW indexes](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes) -- HIGH confidence
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) -- HIGH confidence
- [Gemini Embedding API docs](https://ai.google.dev/gemini-api/docs/embeddings) -- HIGH confidence
- [Gemini gemini-embedding-001 GA announcement](https://developers.googleblog.com/gemini-embedding-available-gemini-api/) -- HIGH confidence
- [Roommate matching research (IJRASET)](https://www.ijraset.com/research-paper/enhancing-co-living-experience-through-intelligent-roommate-matching) -- MEDIUM confidence
- [Multi-source scraper dedup patterns (ScrapingAnt)](https://scrapingant.com/blog/building-a-web-data-quality-layer-deduping-canonicalization) -- MEDIUM confidence

---

*Architecture research: 2026-03-05*
