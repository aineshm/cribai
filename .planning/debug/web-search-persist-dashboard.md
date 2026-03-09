---
status: diagnosed
trigger: "Investigate web search results not persisted to corpus/URLs not inline (Test 3) and saved web listings not on dashboard (Test 7)"
created: 2026-03-08T00:00:00Z
updated: 2026-03-08T00:00:00Z
---

## Issue 1: Web search results not persisted, URLs not inline (Test 3)

### Root Cause

Three distinct gaps in the web_search tool handler and chat rendering pipeline:

**Gap A: No auto-persist of web search results to listings corpus**

File: `packages/ai/src/tools/handlers/web-search.ts`

The `persistWebListing()` function exists in this file (lines 23-67) but is NEVER CALLED by the `webSearch()` handler (lines 74-137). The function was designed for a "save on favorite" flow (see comment on line 19: "Web results are ephemeral in chat. They become persistent listings only when a user saves them to favorites"). The user expectation is that search results are auto-persisted immediately.

The `webSearch()` handler receives `_context` (note the underscore -- unused parameter, line 76), meaning it never uses the Supabase client to persist anything.

**Gap B: Web search returns `type: 'text'` block instead of `type: 'listing_card'` block**

File: `packages/ai/src/tools/handlers/web-search.ts`, function `buildResult()` (lines 139-158)

The `buildResult()` function returns a `clientBlock` with `type: 'text'` containing a markdown-formatted string. This means web search results render as plain text in the chat, not as interactive listing cards.

Compare with `search-listings.ts` which returns `type: 'listing_card'` blocks with structured `ListingSummary` objects -- those render as rich cards via `ChatListingCard`.

For web results to appear as listing cards, `buildResult()` would need to:
1. Map Tavily results to `ListingSummary` objects (requires persisting them first to get UUIDs)
2. Return a `clientBlock` with `type: 'listing_card'`

**Gap C: URLs are in the text block but not rendered as clickable links**

File: `apps/web/components/chat/chat-block-renderer.tsx`, line 34

The text block renderer uses `<p className="whitespace-pre-wrap text-sm">{block.content}</p>` -- plain text rendering with no markdown/link parsing. Even though `buildResult()` includes URLs in the content string (line 148: `` `${i + 1}. **${r.title}** - ${r.url}` ``), the markdown bold and bare URLs are rendered as literal text.

There is no `web_search_result` or `source_citation` block type in the ChatBlock discriminated union (`packages/types/src/chat.ts`). The type system has no concept of web search results with clickable source links.

### Evidence

1. `webSearch()` function signature uses `_context` (unused) -- no DB writes happen
2. `persistWebListing()` exists but is only called by the `/api/save-web-listing` route (manual save flow)
3. `buildResult()` returns `type: 'text'` -- not `type: 'listing_card'`
4. `ChatBlockRenderer` renders text blocks as plain `<p>` elements -- no link detection
5. `chatBlockSchema` discriminated union has no web-search-specific block type

### Files Involved

- `packages/ai/src/tools/handlers/web-search.ts`: `webSearch()` does not call `persistWebListing()`, `buildResult()` returns text block
- `packages/types/src/chat.ts`: No block type for web search results with source URLs
- `apps/web/components/chat/chat-block-renderer.tsx`: Text block renders as plain text, no link parsing

### What Needs to Change

1. `webSearch()` must call `persistWebListing()` for each result (use `context` instead of `_context`), creating listing records with `source: 'web_search'`
2. `buildResult()` must return a `listing_card` block (or a new `web_search_result` block type) with structured data including source URLs
3. Either add a new ChatBlock type for web results with source citations, or extend `ListingSummary` rendering to show `sourceUrl` when present
4. `ChatBlockRenderer` text block should support markdown links or a dedicated component should handle source URLs

---

## Issue 2: Saved web listings don't appear on dashboard (Test 7)

### Root Cause

The dashboard page is a static placeholder with no data queries.

File: `apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx`

The entire dashboard (lines 17-50) renders three hardcoded cards ("Upcoming Appointments", "Recently Viewed", "Saved Items") with static empty-state text. There are ZERO Supabase queries on this page. The "Saved Items" card always shows "No saved items yet" regardless of database state.

This is not a filtering issue or a source-type exclusion -- there is simply no query at all. The dashboard was scaffolded as a UI shell but never wired to real data.

Compare with the saved listings page (`apps/web/app/(campus)/[campusSlug]/saved/page.tsx`) which does query `saved_listings` joined with `listings` (lines 26-40) and correctly renders results. That page works because it has actual Supabase queries.

### Evidence

1. Dashboard `page.tsx` has zero `supabase.from()` calls (only `supabase.auth.getUser()` for auth redirect)
2. The `cards` array (lines 17-30) is a static constant with no dynamic data
3. Saved listings page at `/saved` correctly queries and displays saved listings including web-sourced ones
4. The `save-web-listing` API route correctly persists listings (confirmed by Test 7 description: "listings appear in saved listings page")

### Files Involved

- `apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx`: Placeholder with no data queries

### What Needs to Change

1. Dashboard must query `saved_listings` (joined with `listings`) for the "Saved Items" card -- similar to the query in `saved/page.tsx`
2. Dashboard should query `tour_requests` for the "Upcoming Appointments" card
3. Dashboard should render actual listing data (e.g., count + recent items) instead of static empty text
4. No source filtering is needed -- the existing `saved/page.tsx` query pattern already includes web-sourced listings without discrimination
