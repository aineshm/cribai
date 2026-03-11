# Phase 5: Agentic Data Pipeline + Web Search - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

CribAI has enough real listings to be useful AND can research on-demand when the corpus is thin. Covers: fixing the scraper pipeline (remove Google Places, fix Craigslist, add Zillow), removing artificial caps, adding a `web_search` tool so CribAI can research live when corpus results are insufficient, and updating the embedding pipeline for new volume. No chat persistence (Phase 6), no new agent tools beyond web_search (Phase 6), no saved listings UI (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Scraper Sources
- Remove Google Places as a listing source entirely — it returns buildings, not rental listings
- Fix Craigslist scraper (currently fails in production) — RSS-based, simpler and harder to block
- Add Zillow as a new scraper source (free/accessible methods only)
- Keep Apartments.com behind `ENABLE_APARTMENTS_COM` feature flag — frequently blocked, bonus source only
- Remove all artificial caps — scrapers pull all available listings (goal: 100+ real listings)

### Scraper Reliability & Debugging
- Both Craigslist and Apartments.com currently fail silently in production — only Google Places (~40 buildings) was producing data
- Add verbose console logging: per-source request count, response codes, items found, failure reason
- Add GitHub Actions job summary with formatted diagnostic report
- 0 listings from a source = log detailed failure reason (blocked, timeout, parse error, empty response)

### Web Search Tool — Trigger
- CribAI auto-triggers web search when fewer than 1 unique property matches the query (v1 threshold)
- Future: raise threshold to <3 properties in v2 for more aggressive augmentation
- All matching units from corpus still displayed — threshold is based on unique properties, not individual units
- "Searching the web for more options..." indicator shown during web search

### Web Search Tool — API & Caching
- Search API: Claude's discretion — research Serper and Tavily during planning, pick best primary + fallback strategy (both have free tiers)
- Web results are session-cached (no repeat API calls within same conversation)
- Web results are ephemeral — not stored in the database
- When a user saves a web-sourced listing to favorites, it gets persisted to the listings table (source='web_search') and receives a full embedding

### Web Search Tool — Presentation
- Web results use the same ListingCard component as corpus results — no separate UI treatment
- ALL listing cards (corpus and web) show source citation ("via Craigslist", "via Apartments.com", "via web search")
- Web results interleaved with corpus results by relevance — Gemini handles the merging/ranking conversationally
- No on-the-fly embedding for web results — Gemini's contextual understanding handles relevance ranking without vector similarity

### Embedding Pipeline
- Incremental only — embed new listings and re-embed changed ones (Phase 3's updated_at vs last_embedded_at detection)
- Keep sequential processing — acceptable at 100-500 listing volume
- No on-the-fly embedding for web search results (skip embedding, let Gemini rank)
- Embed web-sourced listings only when user saves to favorites (promotes to corpus)

### Claude's Discretion
- Web search API choice (Serper vs Tavily vs other — research and recommend)
- Zillow scraper implementation approach (RSS, API, or HTML scraping)
- Craigslist scraper debugging and fix strategy
- Verbose logging format and detail level
- How Gemini merges/ranks web results with corpus results in its response
- Session cache implementation (in-memory, conversation context, or lightweight store)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `services/scraper/scrapers/craigslist.ts`: Existing Craigslist RSS scraper — needs debugging/fixing
- `services/scraper/scrapers/apartments-com.ts`: Crawlee/Playwright scraper — behind feature flag, frequently blocked
- `services/scraper/scrapers/google-places.ts`: Google Places scraper — to be REMOVED as listing source
- `services/scraper/scrapers/base-scraper.ts`: `BaseScraper` abstract class — extend for Zillow
- `services/scraper/run.ts`: Orchestrator with metrics + lifecycle — update scraper list, add verbose logging
- `services/scraper/metrics.ts`: Metrics output — enhance with per-source diagnostics
- `packages/ai/src/tools/schemas.ts`: 6 Gemini FunctionDeclarations — add web_search tool
- `packages/ai/src/tools/executor.ts`: Tool dispatch registry — register web_search handler
- `packages/ai/src/tools/handlers/`: 6 existing tool handlers — add web-search handler
- `apps/web/components/listing-card.tsx`: ListingCard component — add source citation display

### Established Patterns
- New scraper: extend `BaseScraper`, register in `run.ts` `buildScrapers()` array
- New AI tool: schema in `schemas.ts` → handler in `handlers/` → register in `executor.ts`
- Gemini function calling with agentic loop (max 5 tool calls, 30s timeout)
- SSE streaming with typed ChatEvent blocks
- Service role client for background jobs (scraper)
- Sequential embedding processing to respect Gemini rate limits (Phase 3 decision)

### Integration Points
- `services/scraper/run.ts`: Remove GooglePlacesScraper, fix CraigslistScraper, add ZillowScraper
- `packages/ai/src/tools/`: New web_search tool (schema, handler, executor registration)
- `apps/web/components/listing-card.tsx`: Add source citation to all cards
- `apps/web/components/chat/`: "Searching the web..." indicator (tool indicator component exists)
- `.github/workflows/nightly-scrape.yml`: Enhanced job summary with per-source diagnostics
- Phase 4's saved_listings table: web-sourced listings saved here get embedded on save

</code_context>

<specifics>
## Specific Ideas

- "The main purpose is to show that the real estate process can be agent-ified" — web search is THE differentiator proving CribAI does what a human agent does (research on behalf of the student)
- Google Places API could power a future `get_neighborhood_info` tool (Phase 6) for "what's near this apartment?" queries — not a listing source
- Unit vs property distinction: an apartment building can have 5 available 4BRs and 2 available 5BRs — that's still 1 property. Threshold counts unique properties, not units
- The "wow moment" is CribAI saying "I couldn't find enough in our database, so I searched the web and found these options" — the agentic research loop in action

</specifics>

<deferred>
## Deferred Ideas

- Google Places API as `get_neighborhood_info` tool (airports, groceries, restaurants near a listing) — Phase 6
- Raise web search threshold from <1 to <3 unique properties — v2 enhancement
- User-level labeled caching of web results — v2, overlaps with saved listings
- Proxy rotation and advanced anti-bot for Apartments.com — add only if basic stealth insufficient
- Batch embedding with rate limit handling — only if sequential hits limits at scale
- On-the-fly embedding for web results — v2 optimization if Gemini's conversational ranking proves insufficient

</deferred>

---

*Phase: 05-agentic-data-pipeline-web-search*
*Context gathered: 2026-03-06*
