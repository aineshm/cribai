# Phase 5: Agentic Data Pipeline + Web Search - Research

**Researched:** 2026-03-06
**Domain:** Web scraping pipeline (Craigslist, Zillow), real-time web search API for AI agent, embedding pipeline
**Confidence:** MEDIUM-HIGH

## Summary

Phase 5 has three main workstreams: (1) fixing the scraper pipeline to produce 100+ real listings by debugging Craigslist, adding Zillow, removing Google Places, and removing caps; (2) adding a `web_search` Gemini function-calling tool so CribAI can research live when the corpus is thin; and (3) enhancing the scraper with verbose diagnostics and per-source reporting.

The scraper fixes are mostly debugging and extending existing code. The Craigslist scraper exists but silently fails in GitHub Actions due to datacenter IP blocking. Zillow requires a new scraper extending `BaseScraper`. The web search tool follows the established tool pattern (schema + handler + executor registration) and needs a third-party search API.

**Primary recommendation:** Use Tavily as the web search API (purpose-built for AI agents, structured responses with relevance scores, 1,000 free credits/month). Fix Craigslist by acknowledging datacenter blocking is inherent and adding a residential proxy fallback or accepting it as a local-dev-only source. Add Zillow via HTML scraping with fetch (no Playwright needed for their rental pages).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Remove Google Places as a listing source entirely -- it returns buildings, not rental listings
- Fix Craigslist scraper (currently fails in production) -- RSS-based, simpler and harder to block
- Add Zillow as a new scraper source (free/accessible methods only)
- Keep Apartments.com behind `ENABLE_APARTMENTS_COM` feature flag -- frequently blocked, bonus source only
- Remove all artificial caps -- scrapers pull all available listings (goal: 100+ real listings)
- Both Craigslist and Apartments.com currently fail silently in production -- only Google Places (~40 buildings) was producing data
- Add verbose console logging: per-source request count, response codes, items found, failure reason
- Add GitHub Actions job summary with formatted diagnostic report
- 0 listings from a source = log detailed failure reason (blocked, timeout, parse error, empty response)
- CribAI auto-triggers web search when fewer than 1 unique property matches the query (v1 threshold)
- All matching units from corpus still displayed -- threshold is based on unique properties, not individual units
- "Searching the web for more options..." indicator shown during web search
- Web results are session-cached (no repeat API calls within same conversation)
- Web results are ephemeral -- not stored in the database
- When a user saves a web-sourced listing to favorites, it gets persisted to the listings table (source='web_search') and receives a full embedding
- Web results use the same ListingCard component as corpus results -- no separate UI treatment
- ALL listing cards (corpus and web) show source citation ("via Craigslist", "via Apartments.com", "via web search")
- Web results interleaved with corpus results by relevance -- Gemini handles the merging/ranking conversationally
- No on-the-fly embedding for web results -- Gemini's contextual understanding handles relevance ranking without vector similarity
- Incremental embedding only -- embed new listings and re-embed changed ones
- Keep sequential processing -- acceptable at 100-500 listing volume
- Embed web-sourced listings only when user saves to favorites

### Claude's Discretion
- Web search API choice (Serper vs Tavily vs other -- research and recommend)
- Zillow scraper implementation approach (RSS, API, or HTML scraping)
- Craigslist scraper debugging and fix strategy
- Verbose logging format and detail level
- How Gemini merges/ranks web results with corpus results in its response
- Session cache implementation (in-memory, conversation context, or lightweight store)

### Deferred Ideas (OUT OF SCOPE)
- Google Places API as `get_neighborhood_info` tool -- Phase 6
- Raise web search threshold from <1 to <3 unique properties -- v2 enhancement
- User-level labeled caching of web results -- v2
- Proxy rotation and advanced anti-bot for Apartments.com -- add only if basic stealth insufficient
- Batch embedding with rate limit handling -- only if sequential hits limits at scale
- On-the-fly embedding for web results -- v2 optimization
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-03 | Manual listing submission form allows landlords or students to add listings directly | Web-sourced listings saved to favorites creates a "user-contributed" listing path; full manual submission form is secondary to the web search flow |
| DATA-04 | Multi-source scraping covers Madison-specific PM sites | Zillow scraper addition + Craigslist fix provides multi-source coverage for Madison area |
| DATA-07 | Reddit/review scraping pipeline collects recent reviews for Madison-area properties | Not directly addressed by CONTEXT.md decisions; may need separate plan or deferral |
| AGENT-01 | CribAI has a web_search tool for real-time web research | Tavily API integration as Gemini function-calling tool; auto-trigger on <1 unique property match |
| AGENT-02 | User gets augmented results from live web research when corpus is insufficient | Web results interleaved with corpus results via Gemini conversational ranking; same ListingCard UI |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tavily/core | latest | Web search API for AI agents | Purpose-built for LLM tool calling; structured results with relevance scores; 1,000 free credits/month; simple SDK |
| vitest | existing | Unit testing | Already used across all packages |
| @google/genai | existing | Gemini function calling | Already used for CribAI tools |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crawlee | existing | Playwright-based scraping | Already used for Apartments.com; NOT needed for Zillow |
| playwright | existing | Browser automation | Behind ENABLE_APARTMENTS_COM flag only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tavily | Serper.dev | Serper is cheaper at scale ($0.30/1k vs ~$8/1k), but returns raw Google results requiring more parsing. Tavily returns AI-optimized structured results with content snippets and relevance scores, better for agent tool use. Free tier: Serper 2,500 one-time vs Tavily 1,000/month recurring. |
| Tavily | SerpAPI | More expensive ($50/5k queries), overkill for this use case |
| HTML scraping for Zillow | Zillow API | Zillow has no public API for rentals; their terms prohibit competitive use |

**Web Search API Recommendation: Tavily**

Rationale (confidence: HIGH):
1. **AI-native responses**: Returns `content` (text snippet), `title`, `url`, `score` (relevance) per result -- perfect for feeding into Gemini's context
2. **Free tier**: 1,000 credits/month recurring, basic search = 1 credit, more than enough for v1
3. **Simple SDK**: `@tavily/core` -- 4 lines of code to search. No complex parsing needed
4. **Topic filtering**: Can search `general` topic with time range filters
5. **Response includes content**: Unlike Serper which returns snippets, Tavily returns full page content extracts -- better for Gemini to reason over

Serper is the fallback if Tavily's free tier is hit. Both use env vars, so switching is trivial.

**Installation:**
```bash
pnpm add --filter @campusnest/ai @tavily/core
```

## Architecture Patterns

### Recommended Project Structure
```
services/scraper/scrapers/
  base-scraper.ts          # Existing abstract class
  craigslist.ts            # Fix: better error handling, diagnostic logging
  zillow.ts                # NEW: Zillow rental scraper
  apartments-com.ts        # Existing, behind feature flag
  google-places.ts         # REMOVE from buildScrapers(), keep file for future enrichment

packages/ai/src/tools/
  schemas.ts               # Add web_search FunctionDeclaration
  executor.ts              # Register web_search handler
  handlers/
    web-search.ts          # NEW: Tavily-powered web search handler
    search-listings.ts     # Modify: count unique properties, return count in result

packages/ai/src/lib/
  web-search-cache.ts      # NEW: Session-level Map cache for web results

services/scraper/
  run.ts                   # Update buildScrapers(), add per-source diagnostic logging
  metrics.ts               # Add per-source breakdown to ScrapeMetrics
  diagnostics.ts           # NEW: Per-source diagnostic reporting
```

### Pattern 1: Web Search Tool Handler
**What:** Gemini function-calling tool that queries Tavily when corpus results are thin
**When to use:** Auto-triggered by Gemini when search_listings returns <1 unique property
**Example:**
```typescript
// packages/ai/src/tools/handlers/web-search.ts
import { tavily } from '@tavily/core';
import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';

const inputSchema = z.object({
  query: z.string().describe('Search query for rental listings'),
  location: z.string().optional().describe('City or area to search in'),
});

export async function webSearch(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return {
      modelContext: 'Web search is not available (API key not configured).',
      clientBlock: { type: 'text', content: 'Web search unavailable.' },
    };
  }

  const tvly = tavily({ apiKey });
  const searchQuery = parsed.location
    ? `${parsed.query} apartments rentals near ${parsed.location}`
    : `${parsed.query} apartments rentals Madison WI`;

  const response = await tvly.search(searchQuery, {
    maxResults: 8,
    searchDepth: 'basic',  // 1 credit per search
    topic: 'general',
  });

  // Parse results into listing-like objects for display
  const webListings = response.results.map((r, i) => ({
    id: `web_${i}_${Date.now()}`,
    title: r.title,
    url: r.url,
    content: r.content,
    score: r.score,
  }));

  const modelContext = webListings.length === 0
    ? 'Web search returned no relevant results.'
    : `Found ${webListings.length} web results:\n${webListings
        .map((r, i) => `${i + 1}. ${r.title} (${r.url})\n   ${r.content.slice(0, 200)}`)
        .join('\n')}`;

  return {
    modelContext,
    clientBlock: {
      type: 'listing_card',
      listings: webListings.map(r => ({
        id: r.id,
        address: r.title,
        rentMonthly: 0,  // Gemini extracts from content
        source: 'web_search',
        sourceUrl: r.url,
        // Minimal fields -- Gemini summarizes the rest conversationally
      })),
    },
  };
}
```

### Pattern 2: Per-Source Diagnostic Logging
**What:** Structured diagnostic output per scraper source for GH Actions job summary
**When to use:** Every scraper run
**Example:**
```typescript
// services/scraper/diagnostics.ts
interface SourceDiagnostic {
  readonly source: string;
  readonly requestCount: number;
  readonly responseCode: number | null;
  readonly itemsFound: number;
  readonly itemsUpserted: number;
  readonly failureReason: string | null;
  readonly durationMs: number;
}

function formatDiagnosticReport(diagnostics: readonly SourceDiagnostic[]): string {
  const lines = ['## Per-Source Diagnostics', '', '| Source | Requests | Status | Found | Upserted | Duration | Notes |', '|--------|----------|--------|-------|----------|----------|-------|'];
  for (const d of diagnostics) {
    const status = d.failureReason ? 'FAILED' : 'OK';
    const notes = d.failureReason ?? (d.itemsFound === 0 ? 'No listings found' : '');
    lines.push(`| ${d.source} | ${d.requestCount} | ${status} | ${d.itemsFound} | ${d.itemsUpserted} | ${d.durationMs}ms | ${notes} |`);
  }
  return lines.join('\n');
}
```

### Pattern 3: Session Cache for Web Results
**What:** In-memory Map keyed by search query, scoped to conversation context
**When to use:** Prevent duplicate Tavily API calls within the same chat session
**Example:**
```typescript
// packages/ai/src/lib/web-search-cache.ts
const cache = new Map<string, { results: unknown[]; timestamp: number }>();
const TTL_MS = 30 * 60 * 1000; // 30 minutes

export function getCachedResults(query: string): unknown[] | null {
  const entry = cache.get(query.toLowerCase().trim());
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(query.toLowerCase().trim());
    return null;
  }
  return entry.results;
}

export function setCachedResults(query: string, results: unknown[]): void {
  cache.set(query.toLowerCase().trim(), { results, timestamp: Date.now() });
}
```

**Note:** This cache lives in the Next.js server process. Since each chat API route handler runs per-request, the cache works as a module-level singleton within a single server instance. For serverless (Vercel), each invocation gets its own memory, so the cache is effectively per-conversation per-function-invocation. This is acceptable for v1 -- the main goal is preventing duplicate calls within a single multi-tool-call turn.

### Pattern 4: Zillow Scraper (RSS + Fetch)
**What:** New scraper extending BaseScraper for Zillow rental listings
**When to use:** Part of nightly scrape pipeline
**Example approach:**
```typescript
// services/scraper/scrapers/zillow.ts
export class ZillowScraper extends BaseScraper {
  readonly source = 'zillow';

  async scrape(): Promise<readonly RawListing[]> {
    // Zillow search URLs return HTML with JSON-LD structured data
    // and inline __NEXT_DATA__ JSON containing listing details
    // Approach: fetch search results page, parse __NEXT_DATA__ JSON
    const url = this.buildSearchUrl();
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    // Parse response...
  }
}
```

### Anti-Patterns to Avoid
- **Swallowing scraper errors silently:** Current behavior -- Craigslist returns 403, logs a warning, returns empty array, and the pipeline treats it as "0 listings found" with no alarm. Fix: track per-source status codes and surface in diagnostics.
- **Using Google Places as a listing source:** Returns buildings/complexes, not individual rental units. No rent, no beds, no availability.
- **Embedding web search results:** They are ephemeral and do not need vector embeddings. Gemini handles relevance ranking conversationally.
- **Hardcoding API keys:** All search API keys must be env vars (TAVILY_API_KEY).
- **Making Zillow scraper depend on Playwright:** Use plain fetch + HTML parsing. Zillow rental search pages include structured data in `__NEXT_DATA__` or JSON-LD that can be parsed without a headless browser.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Web search | Custom Google scraper | Tavily `@tavily/core` | Rate limiting, parsing, relevance scoring, legal compliance |
| RSS parsing | Full XML parser | Regex-based `parseRssItems` (existing) | Craigslist RSS is simple enough; existing parser works well |
| Session caching | Redis/external store | In-memory Map | v1 volume doesn't justify external cache; per-process Map is sufficient |
| Zillow data extraction | Full Playwright crawler | fetch + JSON parse from `__NEXT_DATA__` | Zillow embeds structured listing data in page source; no JS rendering needed |

**Key insight:** The web search tool is about leveraging an existing API (Tavily) and letting Gemini do the heavy lifting of interpreting results. Don't over-engineer the parsing -- Gemini is the "parser."

## Common Pitfalls

### Pitfall 1: Craigslist Datacenter IP Blocking
**What goes wrong:** GitHub Actions runs on datacenter IPs that Craigslist blocks. The scraper gets 403s and returns 0 listings.
**Why it happens:** Craigslist aggressively blocks datacenter IP ranges (AWS, Azure, GCP -- which is where GitHub Actions runs).
**How to avoid:** Accept that Craigslist may not work from GH Actions. Add explicit diagnostics so the failure is visible. Consider: (a) the scraper still works for local development/testing, (b) Zillow + Apartments.com may cover the gap, (c) a residential proxy service is the real fix but is deferred.
**Warning signs:** Response status 403 or empty XML body from Craigslist RSS endpoint.

### Pitfall 2: Zillow Anti-Scraping Measures
**What goes wrong:** Zillow may block or return CAPTCHAs for automated requests.
**Why it happens:** Zillow has increasingly aggressive bot detection.
**How to avoid:** Use realistic User-Agent headers, add delays between requests, parse `__NEXT_DATA__` JSON (less detectable than DOM scraping). If blocked, the scraper should log the failure clearly and not crash the pipeline.
**Warning signs:** 403 responses, CAPTCHA pages, empty `__NEXT_DATA__` blocks.

### Pitfall 3: Web Search API Rate Limits
**What goes wrong:** Hitting Tavily's 1,000 credit/month free tier limit mid-month.
**Why it happens:** Each CribAI conversation that triggers web search uses 1 credit per search.
**How to avoid:** Session caching prevents duplicate calls. Monitor credit usage. At v1 scale (few users), 1,000/month is plenty. Add a graceful fallback message when credits are exhausted.
**Warning signs:** Tavily API returns 429 or credit exhaustion error.

### Pitfall 4: Web Results Don't Match ListingSummary Type
**What goes wrong:** Web search results have different fields than corpus listings (no `id` UUID, no `fairnessScore`, no `bedrooms` as separate field).
**Why it happens:** Web results are unstructured text from search engines, not database records.
**How to avoid:** Create a minimal `WebSearchResult` type for the chat block. The ChatListingCard component needs to handle optional fields gracefully. Gemini extracts structured data (rent, beds) from the web result content and presents it conversationally.
**Warning signs:** TypeScript type errors when trying to use web results as `ListingSummary`.

### Pitfall 5: Google Places Removal Breaks Existing Listings
**What goes wrong:** Removing Google Places scraper means existing `google_places` source listings stop getting `last_seen_at` updates and eventually go stale.
**Why it happens:** The staleness lifecycle marks listings not seen in 7 days as inactive.
**How to avoid:** Run a one-time cleanup: mark all `source='google_places'` listings as inactive immediately (or delete them). They have no rent/beds data anyway and are not useful.

### Pitfall 6: Scraper Metrics Don't Distinguish Sources
**What goes wrong:** Current `ScrapeMetrics` has a single `upserted` counter -- can't tell which source produced listings.
**Why it happens:** Metrics were designed for single-source awareness.
**How to avoid:** Add per-source breakdown to metrics: `Record<string, { found: number; upserted: number; errors: number }>`.

## Code Examples

### Web Search FunctionDeclaration (for schemas.ts)
```typescript
// Source: existing pattern in packages/ai/src/tools/schemas.ts
const webSearch: FunctionDeclaration = {
  name: 'web_search',
  description:
    'Search the web for rental listings and housing information when the local database does not have enough results. Use this when search_listings returns fewer than 1 unique property matching the query, or when the user explicitly asks to search the web.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Search query describing what the user is looking for (e.g., "3 bedroom apartments near UW Madison under $1500")',
      },
      location: {
        type: Type.STRING,
        description: 'City or area to focus the search on (e.g., "Madison WI")',
      },
    },
    required: ['query'],
  },
};
```

### Updated buildScrapers (for run.ts)
```typescript
// Remove Google Places, add Zillow
function buildScrapers(config: ScraperConfig): readonly BaseScraper[] {
  const scrapers: BaseScraper[] = [
    new CraigslistScraper(config),
    new ZillowScraper(config),
  ];

  if (process.env.ENABLE_APARTMENTS_COM === 'true') {
    scrapers.push(new ApartmentsComScraper(config));
  }

  return scrapers;
}
```

### Source Citation on ListingCard
```typescript
// Add to ListingCard component
{listing.source && (
  <span className="text-xs text-[var(--surface-400)]">
    via {listing.source === 'apartments.com' ? 'Apartments.com'
      : listing.source === 'craigslist' ? 'Craigslist'
      : listing.source === 'zillow' ? 'Zillow'
      : listing.source === 'web_search' ? 'web search'
      : listing.source}
  </span>
)}
```

### Updated ChatToolIndicator Labels
```typescript
const TOOL_LABELS: Record<string, string> = {
  search_listings: 'Searching listings',
  get_listing_detail: 'Loading listing details',
  compare_listings: 'Comparing listings',
  schedule_tour: 'Scheduling tour',
  explain_lease_term: 'Looking up lease term',
  get_landlord_info: 'Fetching landlord info',
  get_saved_listings: 'Loading saved listings',
  web_search: 'Searching the web for more options',  // NEW
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Google Places as listing source | Real aggregator sources (Craigslist, Zillow, Apartments.com) | Phase 5 | Actually get rent/beds/availability data |
| Silent scraper failures | Per-source diagnostic reporting | Phase 5 | Know immediately what's broken |
| Corpus-only search | Corpus + live web search fallback | Phase 5 | Core differentiator: CribAI researches like a human agent |
| Artificial scraper caps | Uncapped listing collection | Phase 5 | 100+ real listings in database |

**Deprecated/outdated:**
- `GooglePlacesScraper` as listing source: returns buildings, not listings. Remove from `buildScrapers()`, keep file for potential future enrichment (Phase 6 `get_neighborhood_info`).
- `MAX_RESULTS = 20` in Google Places scraper: irrelevant once removed.
- `MAX_PAGES = 10` in Apartments.com: remove the cap per user decision.

## Open Questions

1. **Craigslist viability from GH Actions**
   - What we know: Craigslist blocks datacenter IPs (confirmed by current production failure + web research)
   - What's unclear: Whether any User-Agent or header trick can bypass the block without a residential proxy
   - Recommendation: Debug locally first to confirm the RSS parser works. In GH Actions, log the 403 clearly. Accept Craigslist may be a local-dev/residential-proxy source only. Zillow + web search compensate.

2. **Zillow __NEXT_DATA__ reliability**
   - What we know: Zillow embeds listing data in `__NEXT_DATA__` JSON on rental search pages
   - What's unclear: Whether this data structure is stable across all page types, and whether Zillow blocks fetch-based requests
   - Recommendation: Test the approach against live Zillow rental search pages. If `__NEXT_DATA__` is not available, fall back to JSON-LD structured data parsing.

3. **DATA-03 (manual listing submission) scope**
   - What we know: The roadmap maps DATA-03 to Phase 5, but CONTEXT.md focuses on scraper fixes and web search
   - What's unclear: Whether a full manual submission form is expected in this phase
   - Recommendation: The "save web-sourced listing to favorites" flow partially addresses user-contributed listings. A full manual submission form may be better suited for a separate plan within this phase or deferred.

4. **DATA-07 (Reddit reviews) scope**
   - What we know: Mapped to Phase 5 in roadmap, but not mentioned in CONTEXT.md decisions
   - What's unclear: Whether Reddit review scraping is in scope for Phase 5
   - Recommendation: Likely deferred or minimal -- CONTEXT.md does not mention it. The planner should confirm scope with the user or plan it as a separate optional wave.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing across all packages) |
| Config file | `services/scraper/vitest.config.ts`, `packages/ai/vitest.config.ts` |
| Quick run command | `pnpm --filter @campusnest/scraper test -- --run` |
| Full suite command | `pnpm test` (turborepo runs all package tests) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-04 | Zillow scraper produces listings with rent/beds | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/zillow.test.ts` | No -- Wave 0 |
| DATA-04 | Craigslist scraper parses RSS correctly (existing parser) | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/craigslist.test.ts` | No -- Wave 0 |
| DATA-04 | Google Places removed from buildScrapers | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/run.test.ts` | No -- Wave 0 |
| AGENT-01 | web_search handler calls Tavily and returns structured results | unit | `pnpm --filter @campusnest/ai test -- --run __tests__/web-search.test.ts` | No -- Wave 0 |
| AGENT-01 | web_search tool registered in executor | unit | `pnpm --filter @campusnest/ai test -- --run __tests__/executor.test.ts` | No -- Wave 0 |
| AGENT-02 | Session cache prevents duplicate API calls | unit | `pnpm --filter @campusnest/ai test -- --run __tests__/web-search-cache.test.ts` | No -- Wave 0 |
| DATA-04 | Per-source diagnostic metrics reported | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/diagnostics.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @campusnest/scraper test -- --run && pnpm --filter @campusnest/ai test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `services/scraper/__tests__/zillow.test.ts` -- covers Zillow RSS/HTML parsing
- [ ] `services/scraper/__tests__/craigslist.test.ts` -- covers Craigslist RSS parsing (existing parser, new tests)
- [ ] `services/scraper/__tests__/run.test.ts` -- covers buildScrapers without Google Places
- [ ] `services/scraper/__tests__/diagnostics.test.ts` -- covers per-source diagnostic output
- [ ] `packages/ai/__tests__/web-search.test.ts` -- covers Tavily handler with mocked API
- [ ] `packages/ai/__tests__/web-search-cache.test.ts` -- covers session cache TTL and dedup
- [ ] `packages/ai/__tests__/executor.test.ts` -- covers web_search registration

## Sources

### Primary (HIGH confidence)
- Tavily official docs (https://docs.tavily.com/sdk/javascript/quick-start) -- SDK integration, response format
- Tavily API reference (https://docs.tavily.com/documentation/api-reference/endpoint/search) -- Full request/response schema
- Tavily pricing (https://docs.tavily.com/documentation/api-credits) -- Credit-based pricing, free tier details
- Serper.dev (https://serper.dev/) -- Pricing, feature comparison
- Existing codebase -- `services/scraper/`, `packages/ai/src/tools/`

### Secondary (MEDIUM confidence)
- WebSearch on Craigslist IP blocking -- multiple sources confirm datacenter IP blocking, residential proxies as primary workaround
- WebSearch on Zillow scraping -- `__NEXT_DATA__` approach documented by multiple scraping guides (dev.to, iproyal.com)

### Tertiary (LOW confidence)
- Zillow `__NEXT_DATA__` stability -- based on scraping guides, not official Zillow documentation. Structure may change without notice.
- Craigslist RSS feed availability -- HN thread from 2020 suggested feeds were removed, but current codebase successfully uses them locally, suggesting they still exist but are IP-restricted.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Tavily is well-documented, SDK is simple, existing tool pattern is proven
- Architecture: HIGH -- Follows established patterns (BaseScraper, tool handlers, executor registration)
- Scraper fixes: MEDIUM -- Craigslist and Zillow have inherent anti-bot challenges; success depends on target site behavior
- Pitfalls: HIGH -- Based on actual production failures (Craigslist 403s) and known patterns

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (30 days -- scraping targets may change their defenses)
