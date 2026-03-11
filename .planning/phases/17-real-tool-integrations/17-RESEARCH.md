# Phase 17: Real Tool Integrations - Research

**Researched:** 2026-03-10
**Domain:** External API integration (Google Places, Walk Score), Supabase caching, Gemini text generation
**Confidence:** HIGH

## Summary

Phase 17 replaces three stub tool handlers (`get_reviews`, `get_neighborhood_info`, `contact_pm`) with real implementations backed by Google Places API (New), Walk Score API, and Gemini-generated text. All three handlers must preserve the existing `ToolResult` interface (`modelContext: string`, `clientBlock: ChatBlock`, optional `mapBlock`), use Zod input validation, and access Supabase via `ToolContext.supabase`.

The caching layer is a new `api_cache` Supabase table with JSONB storage and TTL-based expiration checked on read. The `landlords` table needs `phone` and `email` columns added, and listings need a `landlord_id` FK to enable the contact_pm lookup chain. Gemini calls for review summarization and draft message generation use the existing `@google/genai` SDK pattern (`ai.models.generateContent`).

**Primary recommendation:** Use Google Places API (New) REST endpoints directly via `fetch` (no SDK needed), Walk Score REST API via `fetch`, and Gemini Flash for text generation. Cache all external API responses in a shared `api_cache` table with configurable TTL.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Reviews tool: Google Places API only for v1.2 (no Reddit/web search aggregation)
- Gemini summarizes Google Places reviews into 2-3 sentence summary
- Response: Summary at top + 2-3 notable review quotes with source attribution
- Cache TTL: 24 hours for reviews
- Neighborhood: Walk Score API (walk/transit/bike) + Google Places Nearby Search (amenities)
- Amenity scope: Student essentials only -- grocery stores, cafes/restaurants, gyms, pharmacies, laundromats within walking distance
- Input: Auto-resolve address from listing_id via DB lookup (preferred). Address string accepted as fallback
- Cache TTL: 7 days for neighborhood
- PM Contact tone: Casual friendly -- "Hey! I saw your listing at [address]..."
- Content: Auto-include listing details (address, rent, beds) from DB. User custom message appended
- Gemini generates the draft inquiry message
- Display: Contact card (PM name, company, phone, email) + draft message as copyable text
- DB schema change: Add phone and email columns to landlords table via migration
- No outbound email -- draft only, user sends manually
- Cache store: New api_cache Supabase table with key, response JSONB, expires_at
- TTL enforcement: Check on read only -- expired entries overwritten on next fetch
- No background cleanup job

### Claude's Discretion
- Reviews empty state fallback behavior
- Safety data inclusion in neighborhood response
- Cache key format (address-based vs. request hash)
- Exact Gemini prompt wording for review summary and draft inquiry
- Error handling when external APIs are down or return unexpected responses
- Loading/pending states for API calls

### Deferred Ideas (OUT OF SCOPE)
- Reddit/web search review aggregation
- Background cache cleanup job
- Full amenity map (bars, parks, libraries, bus stops, bike share)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOOLS-01 | Reviews tool returns real Google Places ratings and recent reviews for a property (replaces stub) | Google Places API Place Details (New) endpoint returns reviews with rating, text, author, publish time. Text Search finds place_id from address. Gemini Flash summarizes reviews. |
| TOOLS-02 | PM contact tool returns real contact data from landlords table and generates a draft inquiry message (replaces stub) | Landlords table needs phone/email columns added. Listings need landlord_id FK. Gemini Flash generates casual draft message. |
| TOOLS-03 | Neighborhood info tool returns real Walk Score + nearby amenities from Google Places (replaces stub) | Walk Score API returns walk/transit/bike scores. Google Places Nearby Search returns categorized amenities. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google/genai` | ^1.43.0 | Gemini Flash calls for review summary + draft message | Already in use in cribai.ts and pageindex-builder.ts |
| `@supabase/supabase-js` | ^2.47.0 | DB operations (cache read/write, landlord lookup, listing lookup) | Already the project standard |
| `zod` | ^3.24.0 | Input validation for tool handlers | Already used in all tool handlers |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Native `fetch` | Built-in | Google Places API + Walk Score API HTTP calls | Node 18+ built-in, no need for axios/node-fetch |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native fetch | `@googlemaps/google-maps-services-js` | SDK is for legacy Places API, not Places API (New). Native fetch is simpler for REST calls |
| Supabase cache table | In-memory LRU cache | Memory cache lost on serverless cold starts. Supabase persists across invocations and is shared across all users |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
packages/ai/src/
  tools/
    handlers/
      get-reviews.ts          # Rewrite: Google Places + Gemini summary
      get-neighborhood-info.ts # Rewrite: Walk Score + Google Places Nearby
      contact-pm.ts           # Rewrite: DB lookup + Gemini draft message
    lib/
      api-cache.ts            # NEW: Supabase-backed cache (get/set with TTL)
      google-places.ts        # NEW: Google Places API client (Text Search, Place Details, Nearby Search)
      walkscore.ts            # NEW: Walk Score API client
    __tests__/
      get-reviews.test.ts     # Rewrite tests for real implementation
      get-neighborhood-info.test.ts
      contact-pm.test.ts
      api-cache.test.ts       # NEW: cache read/write/expiry tests
      google-places.test.ts   # NEW: API client tests with mocked fetch
      walkscore.test.ts       # NEW: API client tests with mocked fetch
supabase/migrations/
  014_api_cache_landlord_contacts.sql  # NEW: api_cache table + landlords phone/email + listings landlord_id FK
```

### Pattern 1: Supabase-backed API Cache
**What:** A reusable cache layer that stores external API responses in a Supabase table with TTL expiration.
**When to use:** Any external API call that is expensive or rate-limited.
**Example:**
```typescript
// packages/ai/src/tools/lib/api-cache.ts
import type { SupabaseClient } from '@supabase/supabase-js';

interface CacheEntry {
  readonly key: string;
  readonly response: unknown;
  readonly expires_at: string;
}

export async function getCached<T>(
  supabase: SupabaseClient,
  key: string,
): Promise<T | null> {
  const { data } = await supabase
    .from('api_cache')
    .select('response, expires_at')
    .eq('key', key)
    .single();

  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) return null; // expired
  return data.response as T;
}

export async function setCache(
  supabase: SupabaseClient,
  key: string,
  response: unknown,
  ttlMs: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await supabase
    .from('api_cache')
    .upsert({ key, response, expires_at: expiresAt }, { onConflict: 'key' });
}
```

### Pattern 2: External API Client Module
**What:** Thin wrapper around fetch for each external API, handling auth headers, error mapping, and response typing.
**When to use:** Every external API integration.
**Example:**
```typescript
// packages/ai/src/tools/lib/google-places.ts
const BASE_URL = 'https://places.googleapis.com/v1';

export interface PlaceReview {
  readonly rating: number;
  readonly text: { readonly text: string };
  readonly authorAttribution: { readonly displayName: string };
  readonly relativePublishTimeDescription: string;
  readonly publishTime: string;
}

export interface PlaceDetailsResult {
  readonly id: string;
  readonly displayName: { readonly text: string };
  readonly rating?: number;
  readonly userRatingCount?: number;
  readonly reviews?: readonly PlaceReview[];
}

export async function textSearchPlace(
  address: string,
  apiKey: string,
): Promise<string | null> {
  const response = await fetch(`${BASE_URL}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id',
    },
    body: JSON.stringify({ textQuery: address }),
  });
  const data = await response.json();
  return data.places?.[0]?.id ?? null;
}

export async function getPlaceDetails(
  placeId: string,
  apiKey: string,
  fieldMask: string,
): Promise<PlaceDetailsResult> {
  const response = await fetch(`${BASE_URL}/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
  });
  if (!response.ok) throw new Error(`Places API error: ${response.status}`);
  return response.json();
}
```

### Pattern 3: Gemini Text Generation in Tool Handlers
**What:** Use the existing `createGeminiClient` factory to call Gemini Flash for summarization/generation tasks within tool handlers.
**When to use:** Review summarization and draft message generation.
**Example:**
```typescript
// Inside a tool handler
import { createGeminiClient } from '../../gemini-client';

const ai = createGeminiClient();
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: `Summarize these reviews for a student...`,
});
const summary = response.text ?? '';
```

### Pattern 4: Address Resolution from listing_id
**What:** When a tool receives listing_id, look up the address from the listings table before calling external APIs.
**When to use:** Reviews and neighborhood tools that need an address for external API calls.
**Example:**
```typescript
async function resolveAddress(
  listingId: string | undefined,
  addressArg: string | undefined,
  supabase: SupabaseClient,
): Promise<{ address: string; listing?: ListingRow }> {
  if (addressArg) return { address: addressArg };
  if (!listingId) throw new Error('Provide either listing_id or address');

  const { data, error } = await supabase
    .from('listings')
    .select('address, rent_monthly, bedrooms, bathrooms, landlord_id')
    .eq('id', listingId)
    .single();

  if (error || !data) throw new Error('Listing not found');
  return { address: data.address, listing: data };
}
```

### Anti-Patterns to Avoid
- **Calling external APIs without caching:** Every Google Places and Walk Score call MUST check cache first. These APIs have rate limits and cost money.
- **Hardcoding API keys in source:** Use `process.env.GOOGLE_PLACES_API_KEY` and `process.env.WALKSCORE_API_KEY`.
- **Making Gemini calls synchronously in sequence:** Review summary and draft message each need only one Gemini call, but don't chain them unnecessarily.
- **Returning raw API responses to the client:** Always transform external data into the `ToolResult` shape with human-readable `modelContext` and properly typed `clientBlock`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Place ID lookup from address | Custom geocoding + matching | Google Places Text Search API | Handles address normalization, fuzzy matching, returns canonical place ID |
| Walkability scoring | Custom algorithm from amenity distances | Walk Score API | Industry standard, accounts for road network topology, pedestrian infrastructure |
| Review aggregation | Custom scraping or multi-source merging | Google Places reviews field | Single API call returns up to 5 reviews with ratings, ToS compliant |
| Cache expiration logic | Custom timer/cron cleanup | TTL check on read (stale-while-fetch pattern) | Simple, no background process, harmless stale rows |

**Key insight:** All three tools are essentially "fetch from external API, cache result, format for display" -- the complexity is in API integration details, not business logic.

## Common Pitfalls

### Pitfall 1: Google Places API Field Mask Billing
**What goes wrong:** Requesting `reviews` triggers the "Enterprise + Atmosphere" SKU, which is the most expensive tier. Requesting unnecessary fields inflates costs.
**Why it happens:** Places API (New) bills based on which fields you request, not how much data you receive.
**How to avoid:** Request only the exact fields needed. For reviews: `reviews,rating,userRatingCount,displayName`. For nearby search: `places.displayName,places.formattedAddress,places.types`. Never use `*` or omit the field mask.
**Warning signs:** Unexpectedly high Google Cloud billing.

### Pitfall 2: Walk Score API Server-Side Only
**What goes wrong:** Calling Walk Score from client-side JavaScript fails or violates ToS.
**Why it happens:** Walk Score requires server-side calls only. Their API docs explicitly state this.
**How to avoid:** All Walk Score calls must go through the tool handler (server-side), never from the browser.
**Warning signs:** CORS errors, API key exposure in network tab.

### Pitfall 3: Google Places Text Search Returns Multiple Results
**What goes wrong:** Searching "123 Langdon St" returns multiple places, and the wrong one is selected.
**Why it happens:** Text Search does fuzzy matching and may return businesses at the address, not the building itself.
**How to avoid:** Include city/state in the search query (e.g., "123 Langdon St, Madison, WI"). Take the first result (highest relevance). Consider adding `includedTypes: ["apartment_building", "premise"]` if results are inconsistent.
**Warning signs:** Reviews for a restaurant instead of the apartment building.

### Pitfall 4: Listings Table Has No landlord_id FK
**What goes wrong:** The `contact_pm` tool cannot find the landlord for a listing because `listings` has no `landlord_id` column.
**Why it happens:** Original schema did not link listings to landlords directly.
**How to avoid:** Migration must add `landlord_id uuid REFERENCES landlords(id)` to the `listings` table. The contact_pm handler must handle the case where `landlord_id` is NULL (many existing listings won't have landlords assigned).
**Warning signs:** "Landlord not found" errors for all listings.

### Pitfall 5: Walk Score API US/Canada Only
**What goes wrong:** Walk Score returns status 2 (score unavailable) for addresses outside US/Canada.
**Why it happens:** Walk Score only covers United States and Canada.
**How to avoid:** CampusNest is US-only (UW-Madison), so this is not a current concern. But the handler should still handle status != 1 gracefully.
**Warning signs:** Missing walk scores with no error.

### Pitfall 6: Gemini Call Adds Latency to Tool Execution
**What goes wrong:** Review summary or draft message generation adds 1-3 seconds to tool execution, pushing toward the 30-second total timeout in the agentic loop.
**Why it happens:** Each Gemini Flash call takes ~500ms-2s.
**How to avoid:** Use `gemini-2.5-flash` (fastest model). Keep prompts short and focused. Consider skipping Gemini summarization if only 1-2 reviews exist (just return them directly).
**Warning signs:** Tool calls timing out in the agentic loop.

### Pitfall 7: Google Places API Key vs. Gemini API Key
**What goes wrong:** Using the Gemini API key for Google Places calls, or vice versa.
**Why it happens:** Both are Google APIs but use different API keys with different permissions.
**How to avoid:** Use `GOOGLE_PLACES_API_KEY` for Places API calls (must have Places API enabled in Google Cloud Console). Use `GEMINI_API_KEY` for Gemini calls. These are separate environment variables.
**Warning signs:** 403 errors from Places API, "API not enabled" errors.

## Code Examples

### Google Places Text Search (find place_id from address)
```typescript
// Source: https://developers.google.com/maps/documentation/places/web-service/text-search
const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
    'X-Goog-FieldMask': 'places.id,places.displayName',
  },
  body: JSON.stringify({ textQuery: '123 Langdon St, Madison, WI' }),
});
const data = await response.json();
const placeId = data.places?.[0]?.id; // e.g., "ChIJ..."
```

### Google Places Place Details with Reviews
```typescript
// Source: https://developers.google.com/maps/documentation/places/web-service/place-details
const placeId = 'ChIJ...'; // from Text Search
const response = await fetch(
  `https://places.googleapis.com/v1/places/${placeId}`,
  {
    headers: {
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
      'X-Goog-FieldMask': 'displayName,rating,userRatingCount,reviews',
    },
  },
);
const place = await response.json();
// place.reviews is an array of Review objects:
// { rating: 4.0, text: { text: "Great place..." }, authorAttribution: { displayName: "Jane" }, relativePublishTimeDescription: "2 months ago" }
```

### Google Places Nearby Search (amenities)
```typescript
// Source: https://developers.google.com/maps/documentation/places/web-service/nearby-search
const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.types,places.location',
  },
  body: JSON.stringify({
    includedTypes: ['grocery_or_supermarket', 'cafe', 'restaurant', 'gym', 'pharmacy', 'laundry'],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: 43.0731, longitude: -89.4012 },
        radius: 1000.0, // ~0.6 miles walking distance
      },
    },
  }),
});
```

### Walk Score API
```typescript
// Source: https://www.walkscore.com/professional/api.php
const params = new URLSearchParams({
  format: 'json',
  address: '123 Langdon St, Madison, WI 53703',
  lat: '43.0731',
  lon: '-89.4012',
  transit: '1',
  bike: '1',
  wsapikey: process.env.WALKSCORE_API_KEY!,
});
const response = await fetch(`https://api.walkscore.com/score?${params}`);
const data = await response.json();
// data.walkscore: 85, data.description: "Very Walkable"
// data.transit?.score: 52, data.bike?.score: 78
```

### Gemini Review Summary
```typescript
// Uses existing createGeminiClient pattern from cribai.ts
import { createGeminiClient } from '../../gemini-client';

const ai = createGeminiClient();
const reviewTexts = reviews.map((r) => `${r.rating}/5: "${r.text.text}"`).join('\n');
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: `You are summarizing Google Places reviews for a student apartment.
Summarize these reviews in 2-3 sentences. Be honest and balanced.
Focus on what matters to students: noise, maintenance responsiveness, management quality, value.

Reviews:
${reviewTexts}`,
});
const summary = response.text ?? 'Unable to summarize reviews.';
```

### api_cache Table Migration
```sql
-- 014_api_cache_landlord_contacts.sql
CREATE TABLE api_cache (
  key        text PRIMARY KEY,
  response   jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for TTL queries (optional, helpful for future cleanup)
CREATE INDEX idx_api_cache_expires ON api_cache (expires_at);

-- RLS: service role only (tool handlers use service client)
ALTER TABLE api_cache ENABLE ROW LEVEL SECURITY;
-- No user-facing policies needed -- only server-side access

-- Add contact columns to landlords
ALTER TABLE landlords ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE landlords ADD COLUMN IF NOT EXISTS email text;

-- Add landlord_id FK to listings (nullable -- many listings won't have one initially)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS landlord_id uuid REFERENCES landlords(id);
CREATE INDEX idx_listings_landlord ON listings (landlord_id) WHERE landlord_id IS NOT NULL;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Google Places API (Legacy) | Google Places API (New) v1 | 2023-2024 | New REST endpoints, field mask billing, POST for search |
| `@googlemaps/google-maps-services-js` SDK | Native `fetch` to REST endpoints | 2024+ | SDK not updated for Places API (New). Direct fetch is simpler |
| Google AI-powered `reviewSummary` field | Available but expensive Enterprise+Atmosphere SKU | 2025 | Google offers built-in review summaries, but using our own Gemini call is cheaper and more customizable |

**Deprecated/outdated:**
- Google Places API (Legacy) endpoints (`maps.googleapis.com/maps/api/place/`) -- still work but new projects should use Places API (New) (`places.googleapis.com/v1/`)
- Walk Score XML format -- use `format=json` parameter

## Open Questions

1. **Walk Score API Key Provisioning**
   - What we know: Walk Score requires an API key requested through their website
   - What's unclear: Whether the key has been provisioned yet (STATE.md lists this as a blocker)
   - Recommendation: Request key immediately if not done. The handler should gracefully degrade if the key is missing (return scores as "unavailable" rather than throwing)

2. **Google Places API Key Permissions**
   - What we know: A separate `GOOGLE_PLACES_API_KEY` is needed with Places API (New) enabled
   - What's unclear: Whether this key exists in the Google Cloud project
   - Recommendation: Verify the key has "Places API (New)" enabled in Google Cloud Console. This is a different API than the Maps JavaScript API used for map rendering

3. **Listings-to-Landlords Mapping Data**
   - What we know: Adding `landlord_id` FK to listings is part of the migration
   - What's unclear: How existing listings will get landlord_id values populated. Most scraped listings won't have this.
   - Recommendation: contact_pm handler must handle `landlord_id IS NULL` gracefully -- return "Contact information not available for this listing" with the listing's `contact_email` (from migration 011) as fallback

4. **Geocoding for Walk Score**
   - What we know: Walk Score requires lat/lon coordinates in addition to address
   - What's unclear: Whether listings table has lat/lon readily available (it has PostGIS `location` geography column)
   - Recommendation: Extract lat/lon from the listings `location` column via `ST_Y(location::geometry)` and `ST_X(location::geometry)`. If location is NULL, use Google Geocoding or skip Walk Score for that address.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.x |
| Config file | packages/ai/vitest.config.ts (or package.json `test` script) |
| Quick run command | `pnpm --filter @campusnest/ai test -- --run` |
| Full suite command | `pnpm run test` (runs all workspace packages) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOOLS-01a | Reviews tool returns Google Places ratings and reviews | unit | `pnpm --filter @campusnest/ai test -- --run src/tools/__tests__/get-reviews.test.ts` | Exists (needs rewrite) |
| TOOLS-01b | Reviews include Gemini-generated summary | unit | Same file | Exists (needs rewrite) |
| TOOLS-01c | Reviews are cached with 24h TTL | unit | `pnpm --filter @campusnest/ai test -- --run src/tools/__tests__/api-cache.test.ts` | Wave 0 |
| TOOLS-02a | PM contact returns landlord data from DB | unit | `pnpm --filter @campusnest/ai test -- --run src/tools/__tests__/contact-pm.test.ts` | Exists (needs rewrite) |
| TOOLS-02b | PM contact generates Gemini draft message | unit | Same file | Exists (needs rewrite) |
| TOOLS-03a | Neighborhood returns Walk Score data | unit | `pnpm --filter @campusnest/ai test -- --run src/tools/__tests__/get-neighborhood-info.test.ts` | Exists (needs rewrite) |
| TOOLS-03b | Neighborhood returns Google Places amenities | unit | Same file | Exists (needs rewrite) |
| TOOLS-03c | Neighborhood results cached with 7-day TTL | unit | `pnpm --filter @campusnest/ai test -- --run src/tools/__tests__/api-cache.test.ts` | Wave 0 |
| ALL | External APIs are mocked (fetch + Gemini) | unit | All test files | Needs mocking setup |
| ALL | Response shape matches ToolResult interface | unit | All test files | Exists in stubs |

### Sampling Rate
- **Per task commit:** `pnpm --filter @campusnest/ai test -- --run`
- **Per wave merge:** `pnpm run test && pnpm run build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/ai/src/tools/__tests__/api-cache.test.ts` -- covers cache read/write/expiry/upsert
- [ ] `packages/ai/src/tools/__tests__/google-places.test.ts` -- covers Text Search, Place Details, Nearby Search with mocked fetch
- [ ] `packages/ai/src/tools/__tests__/walkscore.test.ts` -- covers Walk Score API with mocked fetch
- [ ] Mock setup for `global.fetch` in test files (vi.stubGlobal or vi.spyOn)
- [ ] Mock setup for `createGeminiClient` in test files that need Gemini generation

## Sources

### Primary (HIGH confidence)
- [Google Places API (New) - Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search) - endpoint URL, request format, field masks, place types
- [Google Places API (New) - Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details) - endpoint URL, review fields, field mask billing
- [Google Places API (New) - Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search) - address-to-place-id lookup
- [Google Places API (New) - Data Fields](https://developers.google.com/maps/documentation/places/web-service/data-fields) - complete field list, SKU tiers, reviewSummary availability
- [Google Places API (New) - REST Reference](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places) - Review object structure (rating, text, authorAttribution, publishTime)
- [Walk Score API](https://www.walkscore.com/professional/api.php) - endpoint, parameters, response format, status codes
- Existing codebase: `packages/ai/src/cribai.ts`, `gemini-client.ts`, tool handlers, test helpers

### Secondary (MEDIUM confidence)
- [Walk Score Public Transit API](https://www.walkscore.com/professional/public-transit-api.php) - transit score details
- Google Places API pricing changes March 2025 - billing model verified but exact per-request costs not confirmed

### Tertiary (LOW confidence)
- Walk Score API rate limits not documented publicly -- may need to discover through usage
- Google Places API review count limit (appears to return up to 5 reviews by default, no official documentation of this limit found)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies needed
- Architecture: HIGH - patterns directly follow existing codebase conventions (cribai.ts, web-search handler, test helpers)
- API integration: HIGH - verified endpoints, request/response formats from official Google and Walk Score docs
- Pitfalls: HIGH - derived from official API documentation constraints and observed codebase gaps (landlord_id FK missing)
- Caching: HIGH - simple TTL-on-read pattern, proven in web-search-cache.ts (similar approach)

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (APIs are stable, versioned endpoints)
