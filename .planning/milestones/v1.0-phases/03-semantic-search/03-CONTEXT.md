# Phase 3: Semantic Search - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

CribAI understands qualitative preferences and ranks listings by semantic relevance, not just SQL filters. Covers: vector embeddings for listings, hybrid search (semantic + hard filters), interactive map display in chat, and semantic result presentation. No new listing sources (Phase 5), no saved listings (Phase 4), no chat persistence (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Embedding Strategy
- Rich synthesis via Gemini: generate a natural-language description per listing combining address, rent, bedrooms/baths, amenities, neighborhood context, and "vibe"
- Use Gemini embedding-001 to embed the synthesized text
- Vector embeddings are for RANKING (narrowing candidate set by semantic similarity); PageIndex remains the primary context retrieval mechanism for CribAI's detailed responses
- Post-scrape pipeline: after nightly scrape completes, generate/update embeddings for new or changed listings
- Change detection: only re-embed when listing fields that affect the embedding text change (rent, amenities, description, photos, etc.) — track via `last_embedded_at` timestamp vs `updated_at`
- Deferred: separate batch edge function for embedding generation — implement when scaling to multiple campuses

### Hybrid Search Behavior
- Auto-detect: CribAI (via Gemini) parses user queries into hard filters (beds, price, campus) + semantic query string ("quiet, natural light") — researcher should evaluate best approach (function calling extraction, structured output, or dedicated NLU)
- Search flow: SQL filters first (narrow candidate set), then vector similarity ranking on filtered results, then PageIndex enriches context for top results
- Upgrade existing `search_listings` tool with optional `semantic_query` parameter and `relevance` sort — not a new separate tool
- Few-result handling: relax-and-explain — show exact matches first, then proactively suggest relaxed criteria with transparency ("Only 2 exact matches. Here are 3 more slightly above your budget...")

### Map Display in Chat
- Map provider: Mapbox GL JS (via react-map-gl wrapper)
- Pin style: price labels on each pin (like Zillow/Airbnb) — highlighted pin for currently discussed listing
- Pin click: popup card with hero photo, address, rent, beds/baths, and "View details" link — CribAI has context of the focused listing so user can ask follow-up questions about it in chat
- Auto-trigger: map block appears automatically when search returns 3+ results, below the listing cards — single-listing responses don't show map unless asked
- Map shows exactly the top 5 results from the search

### Search Results Presentation
- Natural language explanation: CribAI explains WHY each listing matched the query (no numeric score, no match percentage) — e.g., "quiet residential street, south-facing windows"
- Same listing card component for both semantic and filter-only results — the difference is in CribAI's accompanying text
- Default 5 results per search (consistent with current search_listings default)
- Results ordered by semantic relevance when semantic_query is present, by price/sort otherwise

### Claude's Discretion
- Gemini embedding-001 configuration (dimensions, batch vs single calls)
- pgvector index type and parameters (ivfflat vs hnsw)
- Mapbox map styling and zoom defaults
- Popup card exact layout and styling
- How to handle listings without coordinates (geocoding approach)
- Embedding text template exact format

</decisions>

<specifics>
## Specific Ideas

- "The AI IS the product" — semantic search is the core differentiator over traditional listing sites
- PageIndex already handles a lot of RAG cost — vector embeddings complement rather than replace it
- CribAI should feel like a knowledgeable local who knows the neighborhoods, not a search engine returning results
- Map popup + chat awareness = user clicks a pin and can immediately ask "is this one quiet?" without re-specifying the listing

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/ai/src/tools/handlers/search-listings.ts`: Current SQL-only search — extend with `semantic_query` parameter and vector ranking
- `packages/ai/src/tools/schemas.ts`: Gemini FunctionDeclaration definitions — update search_listings schema
- `packages/ai/src/cribai.ts`: Agentic loop with SSE streaming — map block is a new ChatEvent type
- `packages/ai/src/pageindex-traverser.ts`: LLM-guided tree traversal — continues to provide rich context after vector ranking narrows candidates
- `apps/web/components/chat/`: Block-based chat UI — add MapBlock component
- `packages/types/src/chat.ts`: Chat block type definitions — add map block type
- `packages/types/src/listing.ts`: Listing schema — add embedding column type

### Established Patterns
- Gemini function calling with Zod-validated tool schemas
- SSE streaming with typed ChatEvent blocks (listing cards, comparison tables, tour confirmations)
- Supabase PostGIS already enabled — pgvector extension needs to be added
- Campus-scoped multi-tenancy — all queries filter by campus_id
- Service role client for background jobs (scraper uses this pattern)

### Integration Points
- `supabase/migrations/`: New migration for pgvector extension, embedding column, and vector index
- `.github/workflows/nightly-scrape.yml`: Add embedding generation step after scrape
- `packages/ai/src/tools/handlers/search-listings.ts`: Primary modification point for hybrid search
- `apps/web/components/chat/`: New MapBlock component integrates into existing block renderer
- `apps/web/app/(campus)/[campusSlug]/`: Map component needs Mapbox API key via env var

</code_context>

<deferred>
## Deferred Ideas

- Separate batch edge function for embedding generation — when scaling to multiple campuses (Phase 5+)
- Dedicated NLU parsing service for query decomposition — evaluate during research, may not be needed if Gemini function calling handles it well
- Map directions/walking time overlay — future enhancement, not core to search
- Re-ranking based on user behavior (clicks, saves) — requires Phase 4 saved listings data
- Neighborhood boundary overlays on map — nice-to-have, complex geodata requirement

</deferred>

---

*Phase: 03-semantic-search*
*Context gathered: 2026-03-06*
