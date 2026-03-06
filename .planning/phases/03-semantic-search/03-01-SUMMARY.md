---
phase: 03-semantic-search
plan: 01
subsystem: database, ai
tags: [pgvector, embeddings, gemini, hnsw, cosine-similarity, semantic-search]

requires:
  - phase: 02-data-pipeline
    provides: "Scraped listings with photo_urls, active/inactive lifecycle"
provides:
  - "pgvector extension and HNSW index on listings.embedding"
  - "match_listings_semantic RPC for hybrid vector + filter search"
  - "Embedding pipeline: synthesize text, generate embedding, batch orchestrator"
  - "MapBlock and MapListing types for chat UI"
  - "updated_at column with auto-trigger on listings table"
affects: [03-02-hybrid-search, 03-03-map-display, nightly-scrape-workflow]

tech-stack:
  added: [pgvector, gemini-embedding-001, HNSW index]
  patterns: [asymmetric-retrieval-embedding, change-detection-via-timestamps, sequential-rate-limited-processing]

key-files:
  created:
    - supabase/migrations/006_pgvector_embeddings.sql
    - packages/ai/src/embeddings/synthesize-text.ts
    - packages/ai/src/embeddings/generate-embedding.ts
    - packages/ai/src/embeddings/embed-listings.ts
    - packages/ai/src/embeddings/index.ts
    - packages/ai/src/embeddings/__tests__/synthesize-text.test.ts
    - packages/ai/src/embeddings/__tests__/generate-embedding.test.ts
    - packages/ai/src/embeddings/__tests__/embed-listings.test.ts
  modified:
    - packages/types/src/listing.ts
    - packages/types/src/chat.ts
    - packages/types/src/index.ts
    - packages/ai/src/index.ts

key-decisions:
  - "Used extensions.vector(768) qualified type per Supabase conventions"
  - "HNSW index with m=16, ef_construction=64 for balance of speed and recall"
  - "Asymmetric task types: RETRIEVAL_DOCUMENT for listings, RETRIEVAL_QUERY for search"
  - "Sequential embedding processing to respect Gemini rate limits"
  - "Added updated_at column and trigger to listings for change detection"

patterns-established:
  - "Embedding pipeline pattern: synthesize text -> generate vector -> update row"
  - "Change detection: updated_at > last_embedded_at for incremental re-embedding"
  - "Neighborhood-aware text synthesis with vibe descriptors from amenities"

requirements-completed: [SRCH-01]

duration: 4min
completed: 2026-03-06
---

# Phase 3 Plan 1: Embedding Foundation Summary

**pgvector HNSW index with Gemini embedding-001 pipeline, hybrid search RPC, and MapBlock chat type**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-06T03:38:31Z
- **Completed:** 2026-03-06T03:42:14Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- pgvector extension enabled with HNSW cosine similarity index on listings.embedding (vector(768))
- match_listings_semantic RPC function for hybrid search combining vector similarity with SQL filters (bedrooms, rent range, fairness)
- Complete embedding pipeline: synthesize rich NL text from listing fields, generate 768-dim embeddings via Gemini, batch orchestrate with change detection
- MapBlock and MapListing types added to chat block discriminated union for map display

## Task Commits

Each task was committed atomically:

1. **Task 1: Database migration and type updates** - `105ce7c` (feat)
2. **Task 2: Embedding pipeline tests (RED)** - `30d18ad` (test)
3. **Task 2: Embedding pipeline modules (GREEN)** - `9720a65` (feat)

## Files Created/Modified
- `supabase/migrations/006_pgvector_embeddings.sql` - pgvector extension, embedding columns, HNSW index, match_listings_semantic RPC, updated_at trigger
- `packages/ai/src/embeddings/synthesize-text.ts` - Rich NL text synthesis from listing fields with neighborhood context and vibe derivation
- `packages/ai/src/embeddings/generate-embedding.ts` - Gemini embedding-001 wrapper with asymmetric RETRIEVAL_DOCUMENT/RETRIEVAL_QUERY task types
- `packages/ai/src/embeddings/embed-listings.ts` - Batch orchestrator processing only changed listings sequentially
- `packages/ai/src/embeddings/index.ts` - Barrel exports for embedding modules
- `packages/types/src/listing.ts` - Added embeddingText and lastEmbeddedAt optional fields
- `packages/types/src/chat.ts` - Added MapBlock with listings (lat/lng/photoUrl), center, zoom
- `packages/types/src/index.ts` - Exported MapBlock, MapListing, mapBlockSchema, mapListingSchema

## Decisions Made
- Used `extensions.vector(768)` qualified type per Supabase conventions (avoids schema conflict)
- HNSW index chosen over IVFFlat for better recall without need for training data; m=16 and ef_construction=64 balance speed with quality
- Asymmetric embedding task types (RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY) per Gemini best practices for retrieval use cases
- Sequential processing in batch orchestrator to respect Gemini API rate limits (not parallelized)
- Added `updated_at` column with auto-update trigger to listings table (was missing, needed for embedding change detection)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added updated_at column and trigger to listings table**
- **Found during:** Task 1 (Database migration)
- **Issue:** Plan references change detection via `updated_at > last_embedded_at` but listings table had no `updated_at` column
- **Fix:** Added `updated_at timestamptz DEFAULT now()` column and `BEFORE UPDATE` trigger to auto-set timestamp
- **Files modified:** supabase/migrations/006_pgvector_embeddings.sql
- **Verification:** Migration SQL is syntactically valid with proper trigger function
- **Committed in:** 105ce7c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for change detection logic. No scope creep.

## Issues Encountered
- Supabase mock chain in embed-listings tests needed restructuring - initial mock didn't match the `.from().select().eq().or()` chain pattern. Fixed by creating proper chainable mock objects.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Embedding foundation complete: migration, pipeline modules, and types ready
- Next plan (03-02) can upgrade search_listings tool with semantic_query parameter using match_listings_semantic RPC
- embedChangedListings can be integrated into nightly scrape workflow
- MapBlock type ready for chat UI rendering in 03-03

## Self-Check: PASSED

- All 8 created files verified on disk
- All 3 task commits verified in git log (105ce7c, 30d18ad, 9720a65)
- Types build passes
- 13/13 embedding tests pass

---
*Phase: 03-semantic-search*
*Completed: 2026-03-06*
