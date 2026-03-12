# Phase 17: Real Tool Integrations - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace three "coming soon" tool stubs with real implementations that return live data: Google Places reviews (with Gemini summary), Walk Score + Google Places neighborhood amenities, and PM contact info with Gemini-generated draft inquiry messages. Each tool caches results via Supabase to avoid redundant API calls. Existing `ToolResult` interface is preserved.

</domain>

<decisions>
## Implementation Decisions

### Reviews Tool (get_reviews)
- Data source: Google Places API only for v1.2 (no Reddit/web search aggregation)
- Gemini summarizes the Google Places reviews into a cohesive 2-3 sentence summary
- Response format: Summary at top + 2-3 notable review quotes with source attribution below
- Empty state: Claude's discretion on fallback (honest empty state vs. neighborhood-level reviews)
- Cache TTL: 24 hours

### Neighborhood Tool (get_neighborhood_info)
- Data sources: Walk Score API (walk/transit/bike scores) + Google Places Nearby Search (amenities)
- Amenity scope: Student essentials only — grocery stores, cafes/restaurants, gyms, pharmacies, laundromats within walking distance
- Display: Scores as structured data + categorized nearby places (name + distance). Agent uses the full data in modelContext to answer follow-up questions naturally.
- Input: Auto-resolve address from listing_id via DB lookup (preferred input). Address string also accepted as fallback.
- Safety/crime data: Claude's discretion based on what APIs return
- Cache TTL: 7 days

### PM Contact Tool (contact_pm)
- Tone: Casual friendly — "Hey! I saw your listing at [address]..."
- Content: Auto-include listing details (address, rent, beds) from DB. User's custom message appended if provided.
- Gemini generates the draft inquiry message
- Display: Contact card (PM name, company, phone, email) + draft message as copyable text below
- DB schema change: Add `phone` and `email` columns to `landlords` table via migration
- No outbound email sent — draft only, user sends manually

### Caching Strategy
- Cache store: New `api_cache` Supabase table with key, response JSONB, expires_at
- TTL enforcement: Check on read only — expired entries overwritten on next fetch
- No background cleanup job (stale rows are harmless at current scale)
- Cache key format: Claude's discretion (address-based vs. request hash)

### Claude's Discretion
- Reviews empty state fallback behavior
- Safety data inclusion in neighborhood response
- Cache key format (address-based vs. request hash)
- Exact Gemini prompt wording for review summary and draft inquiry
- Error handling when external APIs are down or return unexpected responses
- Loading/pending states for API calls

</decisions>

<specifics>
## Specific Ideas

- Reviews should feel like a synthesized summary, not a raw dump of Google Places data
- Neighborhood data should be rich enough that the agent can answer follow-up questions about the area ("is there a gym nearby?")
- Draft messages should feel like a real student wrote them — casual, friendly, not corporate
- PM contact card should make it easy for the student to actually reach out (phone + email visible)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/ai/src/tools/handlers/get-reviews.ts` — stub to replace (preserves input schema pattern)
- `packages/ai/src/tools/handlers/get-neighborhood-info.ts` — stub to replace
- `packages/ai/src/tools/handlers/contact-pm.ts` — stub to replace
- `packages/ai/src/tools/handlers/get-landlord-info.ts` — existing handler that queries landlords table (reference for DB access pattern)
- `packages/ai/src/tools/types.ts` — `ToolResult`, `ToolContext`, `ToolHandler` interfaces (must conform)
- `packages/ai/src/tools/schemas.ts` — Gemini `FunctionDeclaration` schemas already defined for all three tools
- Existing test files for all three tools in `__tests__/` (need updating for real implementations)

### Established Patterns
- Zod `inputSchema.parse(args)` at handler entry for validation
- `ToolContext.supabase` for all DB operations
- Named exports, kebab-case files, `readonly` interfaces
- `@google/genai` SDK already in use for Gemini calls in `cribai.ts`

### Integration Points
- `packages/ai/src/tools/executor.ts` — dispatches tool calls to handlers (no changes needed)
- `packages/ai/src/tools/index.ts` — barrel file re-exports (no changes needed)
- `supabase/migrations/` — new migration for `api_cache` table + landlords phone/email columns
- `GOOGLE_PLACES_API_KEY` and Walk Score API key need to be provisioned

</code_context>

<deferred>
## Deferred Ideas

- Reddit/web search review aggregation — multi-source review synthesis pulling from Reddit r/UWMadison and other community sources. Good idea for v2 when review coverage matters more.
- Background cache cleanup job — periodic deletion of expired api_cache rows. Not needed at current scale.
- Full amenity map (bars, parks, libraries, bus stops, bike share) — expand beyond student essentials in a future iteration.

</deferred>

---

*Phase: 17-real-tool-integrations*
*Context gathered: 2026-03-10*
