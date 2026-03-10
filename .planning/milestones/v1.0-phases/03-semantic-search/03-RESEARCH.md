# Phase 3: Semantic Search - Research

**Researched:** 2026-03-06
**Domain:** Vector embeddings, hybrid search, interactive maps
**Confidence:** HIGH

## Summary

Phase 3 upgrades CribAI from pure SQL filtering to semantic understanding. The implementation spans four domains: (1) generating vector embeddings for listings using Gemini embedding-001 and storing them in pgvector, (2) implementing hybrid search that combines SQL hard filters with vector similarity ranking, (3) adding an interactive Mapbox map as a new chat block type, and (4) presenting semantically-ranked results with natural language explanations.

The existing codebase is well-structured for this work. The `search_listings` tool handler already does SQL filtering and returns structured `ToolResult` objects. The chat block system uses a discriminated union pattern that cleanly supports adding a new `map` block type. PostGIS is already enabled; pgvector just needs to be added as another extension.

**Primary recommendation:** Use Gemini embedding-001 at 768 dimensions (balances quality vs storage), HNSW index for vector search, and a Supabase RPC function that applies SQL filters first then ranks by cosine similarity. The map uses react-map-gl v8 with Mapbox GL JS.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Rich synthesis via Gemini: generate a natural-language description per listing combining address, rent, bedrooms/baths, amenities, neighborhood context, and "vibe"
- Use Gemini embedding-001 to embed the synthesized text
- Vector embeddings are for RANKING (narrowing candidate set by semantic similarity); PageIndex remains the primary context retrieval mechanism for CribAI's detailed responses
- Post-scrape pipeline: after nightly scrape completes, generate/update embeddings for new or changed listings
- Change detection: only re-embed when listing fields that affect the embedding text change (rent, amenities, description, photos, etc.) -- track via `last_embedded_at` timestamp vs `updated_at`
- Auto-detect: CribAI (via Gemini) parses user queries into hard filters + semantic query string
- Search flow: SQL filters first, then vector similarity ranking on filtered results, then PageIndex enriches context for top results
- Upgrade existing `search_listings` tool with optional `semantic_query` parameter and `relevance` sort -- not a new separate tool
- Few-result handling: relax-and-explain
- Map provider: Mapbox GL JS (via react-map-gl wrapper)
- Pin style: price labels on each pin (like Zillow/Airbnb) -- highlighted pin for currently discussed listing
- Pin click: popup card with hero photo, address, rent, beds/baths, and "View details" link
- Auto-trigger: map block appears automatically when search returns 3+ results, below the listing cards
- Map shows exactly the top 5 results from the search
- Natural language explanation: CribAI explains WHY each listing matched the query (no numeric score)
- Same listing card component for both semantic and filter-only results
- Default 5 results per search
- Results ordered by semantic relevance when semantic_query is present, by price/sort otherwise

### Claude's Discretion
- Gemini embedding-001 configuration (dimensions, batch vs single calls)
- pgvector index type and parameters (ivfflat vs hnsw)
- Mapbox map styling and zoom defaults
- Popup card exact layout and styling
- How to handle listings without coordinates (geocoding approach)
- Embedding text template exact format

### Deferred Ideas (OUT OF SCOPE)
- Separate batch edge function for embedding generation -- when scaling to multiple campuses (Phase 5+)
- Dedicated NLU parsing service for query decomposition -- evaluate during research, may not be needed if Gemini function calling handles it well
- Map directions/walking time overlay -- future enhancement, not core to search
- Re-ranking based on user behavior (clicks, saves) -- requires Phase 4 saved listings data
- Neighborhood boundary overlays on map -- nice-to-have, complex geodata requirement
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-01 | Listings are embedded with Gemini embedding-001 and stored as pgvector columns | Gemini embedContent API verified, pgvector extension + migration pattern documented, embedding generation pipeline designed |
| SRCH-02 | CribAI performs hybrid search combining vector similarity with SQL filters | Supabase RPC function pattern for hybrid search documented, search_listings upgrade path identified |
| SRCH-03 | CribAI can display listings on an interactive map as a chat block | react-map-gl v8 + Mapbox GL JS verified compatible with React 19/Next.js 15, chat block extension pattern documented |
| SRCH-04 | Search results ranked by semantic relevance to natural language query | Cosine similarity ranking via pgvector `<=>` operator, `relevance` sort option in search_listings |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @google/genai | ^1.43.0 | Gemini embedding-001 embeddings | Already in project, `embedContent` method for embeddings |
| pgvector | (Supabase built-in) | Vector storage + similarity search | Native Postgres extension, HNSW index, cosine distance |
| react-map-gl | ^8.1.0 | React wrapper for Mapbox GL JS | Official visgl wrapper, React 19 compatible (requires >=16.3) |
| mapbox-gl | ^3.5.0 | Map rendering | Required peer dependency for react-map-gl/mapbox |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @mapbox/mapbox-gl-geocoder | (optional) | Forward geocoding for listings missing coordinates | Only if listings lack lat/lng -- scraper already extracts these |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-map-gl | Raw mapbox-gl | More control but more boilerplate, no React component model |
| HNSW index | IVFFlat index | IVFFlat faster to build but slower queries, needs `VACUUM` after bulk inserts; HNSW better for small-medium datasets (<100K) |
| 768 dimensions | 3072 dimensions | Higher accuracy but 4x storage, diminishing returns for ~200 listings |

**Installation:**
```bash
pnpm --filter @campusnest/web add react-map-gl mapbox-gl
pnpm --filter @campusnest/web add -D @types/mapbox-gl
```

## Architecture Patterns

### Recommended Project Structure
```
packages/ai/src/
  embeddings/
    generate-embedding.ts     # embedContent wrapper for single/batch
    synthesize-text.ts        # listing -> rich text description
    embed-listings.ts         # orchestrator: fetch changed, synthesize, embed, upsert
  tools/
    handlers/
      search-listings.ts      # MODIFIED: add semantic_query + RPC call
apps/web/
  components/chat/
    chat-map-block.tsx         # New MapBlock component
    chat-map-popup.tsx         # Pin popup card
    chat-block-renderer.tsx    # MODIFIED: add 'map' case
packages/types/src/
  chat.ts                      # MODIFIED: add mapBlockSchema
  listing.ts                   # MODIFIED: add embedding-related fields
supabase/migrations/
  006_pgvector_embeddings.sql  # Enable pgvector, add column + index + RPC
```

### Pattern 1: Embedding Generation Pipeline
**What:** Post-scrape job that generates/updates embeddings for changed listings
**When to use:** After nightly scrape completes (GitHub Actions step)
**Example:**
```typescript
// Source: Gemini API docs + project patterns
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function generateEmbedding(text: string): Promise<readonly number[]> {
  const response = await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: text,
    config: {
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: 768,
    },
  });
  return response.embeddings![0]!.values!;
}

export async function generateQueryEmbedding(query: string): Promise<readonly number[]> {
  const response = await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: query,
    config: {
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: 768,
    },
  });
  return response.embeddings![0]!.values!;
}
```

### Pattern 2: Listing Text Synthesis
**What:** Transform structured listing data into a rich natural-language description for embedding
**When to use:** Before embedding each listing
**Example:**
```typescript
export function synthesizeListingText(listing: {
  address: string;
  rentMonthly: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  amenities: string[];
  sqft: number | null;
}): string {
  const parts: string[] = [];
  parts.push(`${listing.address}`);
  if (listing.bedrooms !== null) parts.push(`${listing.bedrooms} bedroom`);
  if (listing.bathrooms !== null) parts.push(`${listing.bathrooms} bathroom`);
  if (listing.rentMonthly !== null) parts.push(`$${listing.rentMonthly}/month`);
  if (listing.sqft !== null) parts.push(`${listing.sqft} sq ft`);
  if (listing.amenities.length > 0) {
    parts.push(`Amenities: ${listing.amenities.join(', ')}`);
  }
  // Add neighborhood context based on address/location
  // Add "vibe" descriptors synthesized from amenities
  return parts.join('. ') + '.';
}
```

### Pattern 3: Supabase RPC for Hybrid Search
**What:** Postgres function combining SQL WHERE clauses with vector cosine similarity
**When to use:** Called from search_listings handler when semantic_query is present
**Example:**
```sql
-- Source: Supabase AI docs pattern adapted for CampusNest
CREATE OR REPLACE FUNCTION match_listings_semantic(
  query_embedding extensions.vector(768),
  p_campus_id uuid,
  p_bedrooms smallint DEFAULT NULL,
  p_min_rent numeric DEFAULT NULL,
  p_max_rent numeric DEFAULT NULL,
  p_min_fairness numeric DEFAULT NULL,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  address text,
  rent_monthly numeric,
  bedrooms smallint,
  bathrooms numeric,
  sqft numeric,
  fairness_score numeric,
  true_cost_total numeric,
  amenities jsonb,
  photo_urls text[],
  latitude float8,
  longitude float8,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    l.id, l.address, l.rent_monthly, l.bedrooms, l.bathrooms,
    l.sqft, l.fairness_score, l.true_cost_total, l.amenities,
    l.photo_urls,
    ST_Y(l.location::geometry) as latitude,
    ST_X(l.location::geometry) as longitude,
    1 - (l.embedding <=> query_embedding) as similarity
  FROM listings l
  WHERE l.campus_id = p_campus_id
    AND l.is_active = true
    AND l.embedding IS NOT NULL
    AND (p_bedrooms IS NULL OR
         (p_bedrooms >= 4 AND l.bedrooms >= 4) OR
         l.bedrooms = p_bedrooms)
    AND (p_min_rent IS NULL OR l.rent_monthly >= p_min_rent)
    AND (p_max_rent IS NULL OR l.rent_monthly <= p_max_rent)
    AND (p_min_fairness IS NULL OR l.fairness_score >= p_min_fairness)
  ORDER BY l.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### Pattern 4: Map Chat Block
**What:** New discriminated union member for the chat block system
**When to use:** When search returns 3+ results
**Example:**
```typescript
// Addition to packages/types/src/chat.ts
export const mapBlockSchema = z.object({
  type: z.literal('map'),
  listings: z.array(listingSummarySchema.extend({
    latitude: z.number(),
    longitude: z.number(),
    photoUrl: z.string().nullable(),
  })),
  center: z.object({ lat: z.number(), lng: z.number() }),
  zoom: z.number(),
});
```

### Anti-Patterns to Avoid
- **Embedding at query time:** Never embed listings on-the-fly during search. Pre-compute during scrape pipeline.
- **Storing raw embedding arrays in application code:** Use pgvector's native `vector` type, not JSON arrays.
- **Full table scan for vector search:** Always apply SQL filters BEFORE vector similarity to narrow the candidate set.
- **Separate semantic search tool:** The user explicitly decided to extend `search_listings`, not create a new tool.
- **Numeric match scores in UI:** User decided CribAI explains WHY in natural language, never shows percentages.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector similarity math | Custom cosine distance in JS | pgvector `<=>` operator | Database-level computation with HNSW index acceleration |
| Map rendering | Canvas-based custom map | react-map-gl + Mapbox GL JS | WebGL rendering, tile loading, interaction handling |
| Geocoding | Custom address-to-coords | Mapbox Geocoding API (100K free/month) or rely on scraper lat/lng | Address parsing is deceptively complex |
| Embedding dimension reduction | PCA or custom truncation | Gemini's `outputDimensionality` parameter | Matryoshka-trained model handles truncation natively |
| Query parsing (filters vs semantic) | Regex-based NLU | Gemini function calling (already works) | LLM already extracts structured params via tool schemas |

**Key insight:** Gemini function calling already parses user intent into structured tool parameters. Adding a `semantic_query` string parameter to the existing `search_listings` tool schema lets Gemini naturally extract "quiet, natural light" as the semantic part while still extracting bedrooms=2, max_rent=1500 as hard filters. No separate NLU needed.

## Common Pitfalls

### Pitfall 1: Task Type Mismatch Between Indexing and Querying
**What goes wrong:** Using the same task type for both document embeddings and query embeddings produces poor similarity scores.
**Why it happens:** Gemini embedding-001 optimizes embedding geometry differently based on task type.
**How to avoid:** Use `RETRIEVAL_DOCUMENT` when embedding listings and `RETRIEVAL_QUERY` when embedding user queries.
**Warning signs:** Semantically similar queries returning irrelevant results despite correct implementation.

### Pitfall 2: Missing Embeddings Cause Silent Failures
**What goes wrong:** Listings without embeddings are excluded from semantic search silently.
**Why it happens:** The RPC function filters `WHERE embedding IS NOT NULL`, so un-embedded listings disappear.
**How to avoid:** (1) Track embedding coverage in scrape metrics, (2) Fall back to SQL-only search when no semantic_query is provided, (3) Log warnings when >10% of active listings lack embeddings.
**Warning signs:** Fewer results than expected, especially for newly scraped listings.

### Pitfall 3: Mapbox GL JS CSS Not Loaded
**What goes wrong:** Map renders but controls are unstyled, markers overlap, popups mispositioned.
**Why it happens:** mapbox-gl requires its CSS file imported globally; easy to miss in Next.js App Router.
**How to avoid:** Import `'mapbox-gl/dist/mapbox-gl.css'` in the map component or layout.
**Warning signs:** Map appears but looks broken, controls are plain HTML.

### Pitfall 4: react-map-gl SSR Crash in Next.js
**What goes wrong:** `window is not defined` error during server-side rendering.
**Why it happens:** mapbox-gl accesses `window` and `document` at import time.
**How to avoid:** Use `next/dynamic` with `ssr: false` to lazy-load the map component.
**Warning signs:** Build fails or hydration mismatch errors.

### Pitfall 5: Embedding All Listings on Every Scrape
**What goes wrong:** Redundant API calls, hitting rate limits, slow pipeline.
**Why it happens:** No change detection -- re-embeds unchanged listings.
**How to avoid:** Compare `updated_at` vs `last_embedded_at` timestamps. Only re-embed when content fields change.
**Warning signs:** Embedding step takes 10x longer than expected, Gemini API quota warnings.

### Pitfall 6: pgvector Extension Schema
**What goes wrong:** `type "vector" does not exist` errors.
**Why it happens:** Supabase recommends creating pgvector in the `extensions` schema, so you must qualify the type as `extensions.vector(768)`.
**How to avoid:** Use `CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;` and reference as `extensions.vector(768)` in table definitions.
**Warning signs:** Migration fails on Supabase hosted but works locally.

### Pitfall 7: Listings Without Coordinates
**What goes wrong:** Map block has listings that cannot be plotted.
**Why it happens:** Some scraped listings may have NULL latitude/longitude.
**How to avoid:** (1) Check that scraper extracts lat/lng (it does), (2) For listings missing coordinates, use Mapbox Geocoding API as backfill during embedding pipeline, (3) Exclude coordinate-less listings from map block but still show in listing cards.
**Warning signs:** Pins missing from map, JavaScript errors from null coordinates.

## Code Examples

### Embedding Generation with @google/genai
```typescript
// Source: https://ai.google.dev/gemini-api/docs/embeddings
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Single embedding (for query time)
const response = await ai.models.embedContent({
  model: 'gemini-embedding-001',
  contents: 'quiet apartment near campus with natural light',
  config: {
    taskType: 'RETRIEVAL_QUERY',
    outputDimensionality: 768,
  },
});
const queryVector = response.embeddings![0]!.values!;

// Batch embedding (for document indexing)
const batchResponse = await ai.models.embedContent({
  model: 'gemini-embedding-001',
  contents: [
    'Studio at 123 Langdon St, $950/mo, in-unit laundry, near Lake Mendota',
    '2BR at 456 State St, $1400/mo, parking, AC, walking distance to campus',
  ],
  config: {
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: 768,
  },
});
```

### pgvector Migration
```sql
-- Source: https://supabase.com/docs/guides/database/extensions/pgvector
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Add embedding column to listings
ALTER TABLE listings
  ADD COLUMN embedding extensions.vector(768),
  ADD COLUMN embedding_text text,
  ADD COLUMN last_embedded_at timestamptz;

-- Create HNSW index for cosine similarity
CREATE INDEX idx_listings_embedding ON listings
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index only active listings with embeddings for faster filtered search
CREATE INDEX idx_listings_active_embedded ON listings (campus_id)
  WHERE is_active = true AND embedding IS NOT NULL;
```

### Supabase RPC Call from TypeScript
```typescript
// Source: https://supabase.com/docs/guides/ai/vector-columns
const { data, error } = await context.supabase.rpc('match_listings_semantic', {
  query_embedding: queryVector,
  p_campus_id: context.campusId,
  p_bedrooms: parsed.bedrooms ?? null,
  p_min_rent: parsed.min_rent ?? null,
  p_max_rent: parsed.max_rent ?? null,
  p_min_fairness: parsed.min_fairness ?? null,
  match_count: limit,
});
```

### react-map-gl Map Component (Next.js App Router)
```typescript
// Source: https://visgl.github.io/react-map-gl/docs
'use client';

import { Map, Marker, Popup } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapListing {
  id: string;
  latitude: number;
  longitude: number;
  rentMonthly: number;
  address: string;
}

export function ListingMap({ listings }: { listings: MapListing[] }) {
  return (
    <Map
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{
        latitude: 43.0731,  // UW Madison center
        longitude: -89.4012,
        zoom: 14,
      }}
      style={{ width: '100%', height: 300 }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
    >
      {listings.map(listing => (
        <Marker
          key={listing.id}
          latitude={listing.latitude}
          longitude={listing.longitude}
        >
          <div className="bg-white rounded-full px-2 py-1 text-xs font-semibold shadow-md border">
            ${listing.rentMonthly}
          </div>
        </Marker>
      ))}
    </Map>
  );
}
```

### Dynamic Import for SSR Safety
```typescript
// Source: Next.js docs + react-map-gl patterns
import dynamic from 'next/dynamic';

const ChatMapBlock = dynamic(
  () => import('./chat-map-block').then(mod => mod.ChatMapBlock),
  { ssr: false, loading: () => <div className="h-[300px] bg-gray-100 animate-pulse rounded-lg" /> }
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| text-embedding-004 | gemini-embedding-001 | 2025 | Matryoshka learning, flexible dimensions (128-3072), task-type optimization |
| IVFFlat indexes | HNSW indexes | pgvector 0.5.0 (2023) | Better recall, no vacuum needed, incrementally updatable |
| mapbox-gl + manual React | react-map-gl v8 | 2024 | Separate /mapbox and /maplibre imports, official types |
| Raw SQL vector queries | Supabase RPC functions | Ongoing | PostgREST does not support pgvector operators natively |

**Deprecated/outdated:**
- `text-embedding-004`: Being deprecated by Google in favor of `gemini-embedding-001`
- react-map-gl v5/v6: Legacy architecture, v7+ is a complete rewrite

## Open Questions

1. **Gemini API rate limits for embeddings**
   - What we know: Batch API available at 50% cost, `embedContent` supports array input
   - What's unclear: Exact free-tier rate limits for embedding-001 (vs generative models)
   - Recommendation: Start with sequential single calls, batch if >50 listings need embedding per run

2. **Optimal embedding dimensions for ~200 listings**
   - What we know: 768 recommended as good quality/size tradeoff; 3072 max
   - What's unclear: Whether 768 vs 1536 makes meaningful difference at this dataset size
   - Recommendation: Use 768 -- at ~200 listings, index size is negligible either way, and 768 is the sweet spot per Google docs

3. **Listings missing lat/lng after scrape**
   - What we know: Apartments.com scraper extracts lat/lng from listing pages
   - What's unclear: What percentage of listings actually have coordinates populated
   - Recommendation: Add a geocoding backfill step using Mapbox Geocoding API (100K free/month) during the embedding pipeline for any listings with NULL location

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1+ |
| Config file | `packages/ai/vitest.config.ts` and `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @campusnest/ai test` |
| Full suite command | `pnpm test` (turborepo runs all packages) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-01 | synthesizeListingText produces correct text | unit | `pnpm --filter @campusnest/ai test -- --grep "synthesize"` | No -- Wave 0 |
| SRCH-01 | generateEmbedding calls embedContent with correct params | unit | `pnpm --filter @campusnest/ai test -- --grep "embedding"` | No -- Wave 0 |
| SRCH-01 | embed-listings only processes changed listings | unit | `pnpm --filter @campusnest/ai test -- --grep "embed-listings"` | No -- Wave 0 |
| SRCH-02 | searchListings with semantic_query calls RPC | unit | `pnpm --filter @campusnest/ai test -- --grep "semantic"` | No -- Wave 0 |
| SRCH-02 | searchListings without semantic_query uses SQL (backward compat) | unit | `pnpm --filter @campusnest/ai test -- --grep "search"` | Yes (existing) |
| SRCH-02 | Hybrid search combines filters + similarity correctly | unit | `pnpm --filter @campusnest/ai test -- --grep "hybrid"` | No -- Wave 0 |
| SRCH-03 | MapBlock component renders with listings | unit | `pnpm --filter @campusnest/web test -- --grep "map"` | No -- Wave 0 |
| SRCH-03 | Map block auto-triggers for 3+ results | unit | `pnpm --filter @campusnest/ai test -- --grep "map block"` | No -- Wave 0 |
| SRCH-04 | Results ordered by similarity when semantic_query present | unit | `pnpm --filter @campusnest/ai test -- --grep "relevance"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @campusnest/ai test`
- **Per wave merge:** `pnpm test` (full monorepo suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/ai/src/embeddings/__tests__/synthesize-text.test.ts` -- covers SRCH-01 text synthesis
- [ ] `packages/ai/src/embeddings/__tests__/generate-embedding.test.ts` -- covers SRCH-01 embedding generation
- [ ] `packages/ai/src/embeddings/__tests__/embed-listings.test.ts` -- covers SRCH-01 change detection
- [ ] `packages/ai/src/tools/__tests__/search-listings.test.ts` -- extend existing with SRCH-02 semantic cases
- [ ] `apps/web/__tests__/chat-map-block.test.tsx` -- covers SRCH-03 map rendering

## Sources

### Primary (HIGH confidence)
- [Gemini Embeddings API](https://ai.google.dev/gemini-api/docs/embeddings) - embedContent method, task types, dimensions, batch support
- [Supabase pgvector docs](https://supabase.com/docs/guides/database/extensions/pgvector) - extension setup, vector columns, RPC pattern
- [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search) - RPC function pattern, RRF scoring
- [Supabase Vector Columns](https://supabase.com/docs/guides/ai/vector-columns) - column creation, match_documents RPC pattern
- [react-map-gl docs](https://visgl.github.io/react-map-gl/) - v8 API, mapbox import path, React compatibility
- [@google/genai npm](https://www.npmjs.com/package/@google/genai) - SDK version, embedContent API

### Secondary (MEDIUM confidence)
- [pgvector GitHub](https://github.com/pgvector/pgvector) - HNSW parameters (m=16, ef_construction=64 defaults)
- [Crunchy Data HNSW blog](https://www.crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector) - HNSW tuning recommendations
- [Mapbox Pricing](https://www.mapbox.com/pricing) - 100K free geocoding requests/month, map loads
- [Google Developers Blog](https://developers.googleblog.com/en/gemini-embedding-text-model-now-available-gemini-api/) - Matryoshka learning, dimension flexibility

### Tertiary (LOW confidence)
- Gemini embedding-001 exact rate limits for free tier -- not found in official docs, needs runtime validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via official docs, @google/genai already in project
- Architecture: HIGH - Patterns follow Supabase official recommendations, existing codebase structure is clear
- Pitfalls: HIGH - Well-documented gotchas (SSR, CSS, task type mismatch) from multiple sources
- Map integration: MEDIUM - react-map-gl v8 confirmed compatible with React >=16.3, but React 19 + Next.js 15 specific testing not explicitly documented

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable libraries, 30-day validity)
