# Fix AI Agent Search Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 broken/hollow features in the CribAI agent search pipeline: DB function ambiguity, raw error exposure, map sync, amenities animation, and hollow lease summary.

**Architecture:** Each fix is surgical and isolated. The DB migration is applied via Supabase MCP. The TypeScript fixes are minimal edits to existing files — no new abstractions, no restructuring.

**Tech Stack:** PostgreSQL (Supabase MCP), TypeScript, Next.js 16, React, framer-motion

---

## Background

Audit found these live bugs:

| # | Bug | Root Cause |
|---|-----|-----------|
| P0 | Semantic search crashes on every query | Two overloaded `match_listings_semantic` functions in DB (7-param + 10-param with geo). PostgREST can't disambiguate. Geo version was added directly to DB, not in any migration. |
| P1 | Raw DB error shown to user in chat | `search-listings.ts` throws on RPC error. Gemini catches it and echoes the raw message including full function signatures. |
| P1 | Main MapPanel never updates after AI search | `ExploreClient` always passes full SSR listing dataset to `MapPanel`. AI search results (with lat/lng) live in `mapBlock` inside the chat stream but never flow back to `MapPanel`. |
| P1 | Amenities section visually blank | `AmenitiesGrid` uses `whileInView="animate"` — animation doesn't fire when the element is outside the initial viewport on slow renders or when the page is screenshot before scroll. |
| P1 | "AI Lease Summary" is a lie | Shows only `listing.leaseTerm` — same as "Lease Details" above it. No AI, no summary, just a duplicate field with a Sparkles icon. |

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/migrations/022_fix_semantic_search_ambiguity.sql` | **Create**: Drop geo-overloaded version, keep 7-param version |
| `packages/ai/src/tools/handlers/search-listings.ts` | **Modify**: Return graceful ToolResult on RPC error instead of throwing |
| `apps/web/app/api/ai/cribai/route.ts` | **Read**: Confirm how tool_result events are emitted in SSE stream |
| `apps/web/components/cribai-chat.tsx` | **Modify**: Expose `onMapListings` callback when mapBlock arrives in tool_result SSE event |
| `apps/web/app/(main)/explore/ExploreClient.tsx` | **Modify**: Wire `onMapListings` to override `MapPanel` listings when AI search results arrive |
| `apps/web/components/listing/AmenitiesGrid.tsx` | **Modify**: Replace `whileInView="animate"` with `animate="animate"` |
| `apps/web/components/listing/ListingContent.tsx` | **Modify**: Remove hollow "AI Lease Summary" section; enhance Lease Details to show all structured lease fields |

---

## Task 1: Fix P0 — Drop Ambiguous DB Function

**Files:**
- Create: `supabase/migrations/022_fix_semantic_search_ambiguity.sql`

- [ ] **Step 1: Verify the two live versions**

```sql
SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname = 'match_listings_semantic';
```

Expected: 2 rows — one with 7 params, one with 10 params (including p_latitude, p_longitude, p_radius_m).

- [ ] **Step 2: Create the migration**

Create `supabase/migrations/022_fix_semantic_search_ambiguity.sql`:

```sql
-- Drop the geo-enabled overload that was added directly to the DB (not via migration).
-- The handler in packages/ai/src/tools/handlers/search-listings.ts only calls
-- the 7-param version, so this overload is unused and causes PostgREST ambiguity.
DROP FUNCTION IF EXISTS match_listings_semantic(
  extensions.vector,
  uuid,
  smallint,
  numeric,
  numeric,
  numeric,
  integer,
  double precision,
  double precision,
  double precision
);
```

- [ ] **Step 3: Apply via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with the SQL above.

- [ ] **Step 4: Verify only one version remains**

Re-run the pg_proc query. Expected: 1 row.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/022_fix_semantic_search_ambiguity.sql
git commit -m "fix: drop geo-overloaded match_listings_semantic to resolve PostgREST ambiguity"
```

---

## Task 2: Fix P1 — Graceful Error Handling in search-listings.ts

**Files:**
- Modify: `packages/ai/src/tools/handlers/search-listings.ts:79-81`

The handler currently throws on RPC error, which causes Gemini to display the raw error including full DB function signatures. Replace with a graceful fallback.

- [ ] **Step 1: Replace throw with graceful return**

In `semanticSearch()` at lines 79-81, replace:
```typescript
if (error) {
  throw new Error(`Semantic search failed: ${error.message}`);
}
```

With:
```typescript
if (error) {
  return {
    modelContext: 'Search is temporarily unavailable. Let me try a different approach — try rephrasing your request or I can search by specific filters instead.',
    clientBlock: { type: 'listing_card' as const, listings: [] },
  };
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm --filter @campusnest/ai build
```
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/tools/handlers/search-listings.ts
git commit -m "fix: return graceful error message from semantic search instead of throwing"
```

---

## Task 3: Fix P1 — Map Sync: AI Results Flow to MapPanel

**Files:**
- Modify: `apps/web/components/cribai-chat.tsx`
- Modify: `apps/web/app/(main)/explore/ExploreClient.tsx`

When a `tool_result` SSE event contains a `mapBlock`, the listings with lat/lng should be passed to `MapPanel` via a callback so the map highlights the AI-found results.

**How SSE events work (from codebase):**
- `{ type: 'tool_result', block: { modelContext, clientBlock, mapBlock? } }` — emitted per tool call
- `cribai-chat.tsx` already parses `tool_call` events for `onSearchContext`; we add `tool_result` parsing for map listings

- [ ] **Step 1: Check cribai route SSE format**

Read `apps/web/app/api/ai/cribai/route.ts` lines around tool_result emission to confirm the exact SSE shape sent for tool results.

- [ ] **Step 2: Add MapListing type import to cribai-chat.tsx**

At the top of `cribai-chat.tsx`, check for an existing `MapListing` type in the imports. If it doesn't exist, define it inline:
```typescript
interface MapSearchListing {
  readonly id: string;
  readonly address: string;
  readonly rentMonthly: number;
  readonly latitude: number;
  readonly longitude: number;
}
```

- [ ] **Step 3: Add `onMapListings` prop to CribAIChat**

In the `CribAIChatProps` interface, add:
```typescript
onMapListings?: (listings: readonly MapSearchListing[]) => void;
```

- [ ] **Step 4: Parse mapBlock from tool_result SSE events**

In the SSE parsing section of `cribai-chat.tsx` (where `tool_call` events are handled), add a handler for `tool_result` events:
```typescript
if (event.type === 'tool_result' && event.block?.mapBlock && onMapListings) {
  const mapListings = (event.block.mapBlock.listings ?? [])
    .filter((l: { latitude?: number; longitude?: number }) =>
      l.latitude != null && l.longitude != null
    )
    .map((l: {
      id: string; address: string; rentMonthly: number;
      latitude: number; longitude: number;
    }) => ({
      id: l.id,
      address: l.address,
      rentMonthly: l.rentMonthly,
      latitude: l.latitude,
      longitude: l.longitude,
    }));
  onMapListings(mapListings);
}
```

- [ ] **Step 5: Wire in ExploreClient**

In `ExploreClient.tsx`:

1. Add state:
```typescript
const [aiMapListings, setAiMapListings] = useState<readonly ExploreListing[] | null>(null);
```

2. Add callback:
```typescript
const handleMapListings = useCallback((results: readonly MapSearchListing[]) => {
  // Convert MapSearchListing → ExploreListing shape for MapPanel
  const asExploreListings: readonly ExploreListing[] = results.map(r => ({
    id: r.id,
    title: r.address,
    address: r.address,
    price: r.rentMonthly,
    latitude: r.latitude,
    longitude: r.longitude,
    // Required ExploreListing fields with safe defaults
    beds: null,
    baths: null,
    sqft: null,
    photoUrl: null,
    source: null,
  }));
  setAiMapListings(asExploreListings);
}, []);
```

3. Pass to CribAIChat:
```tsx
<CribAIChat
  ...existing props...
  onMapListings={handleMapListings}
/>
```

4. Pass to MapPanel (use AI results when available, fall back to full dataset):
```tsx
<MapPanel
  listings={aiMapListings ?? listings}
  ...existing props...
/>
```

- [ ] **Step 6: Build check**

```bash
pnpm --filter web build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/cribai-chat.tsx apps/web/app/(main)/explore/ExploreClient.tsx
git commit -m "fix: wire AI search mapBlock results to main MapPanel"
```

---

## Task 4: Fix P1 — Amenities Grid Animation

**Files:**
- Modify: `apps/web/components/listing/AmenitiesGrid.tsx:65-91`

`whileInView` requires the element to be scrolled into view. If the element is below the fold, animations never trigger and items render invisible until scroll. Use `animate` (always plays) instead.

- [ ] **Step 1: Replace whileInView with animate**

In `AmenitiesGrid.tsx`, change the outer `motion.div`:
```tsx
// Before
<motion.div
  className="grid grid-cols-2 sm:grid-cols-3 gap-3"
  variants={staggerContainer}
  initial="initial"
  whileInView="animate"
  viewport={{ once: true, margin: '-50px' }}
>

// After
<motion.div
  className="grid grid-cols-2 sm:grid-cols-3 gap-3"
  variants={staggerContainer}
  initial="initial"
  animate="animate"
>
```

- [ ] **Step 2: Build check**

```bash
pnpm --filter web build 2>&1 | grep -E "error|Error" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/listing/AmenitiesGrid.tsx
git commit -m "fix: use animate instead of whileInView in AmenitiesGrid so items always render"
```

---

## Task 5: Fix P1 — Remove Hollow AI Lease Summary

**Files:**
- Modify: `apps/web/components/listing/ListingContent.tsx:200-220`

The "AI Lease Summary" section (lines 200-220) just displays `listing.leaseTerm` — the exact same value shown in "Lease Details" directly above. It has a Sparkles icon but contains zero AI. Remove the section entirely.

- [ ] **Step 1: Remove the AI Lease Summary section**

Delete lines 200-220 from `ListingContent.tsx`:
```tsx
{/* AI Lease Summary */}
{listing.leaseTerm && (
  <>
    <Separator />
    <motion.div
      className="rounded-3xl border border-teal-100 bg-teal-50 p-6"
      variants={staggerItem}
    >
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="size-5 text-teal-700" />
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-teal-900">
          AI Lease Summary
        </h2>
      </div>
      <div className="flex items-start gap-2.5">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-600" />
        <span className="text-sm leading-relaxed text-teal-800">{listing.leaseTerm}</span>
      </div>
    </motion.div>
  </>
)}
```

- [ ] **Step 2: Remove now-unused imports**

Check if `Sparkles` and `CheckCircle2` are still used elsewhere in the file. If not, remove from the import statement at the top.

- [ ] **Step 3: Build check**

```bash
pnpm --filter web build 2>&1 | grep -E "error|Error" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/listing/ListingContent.tsx
git commit -m "fix: remove hollow AI Lease Summary section that duplicated Lease Details"
```

---

## Final Verification

- [ ] **Step 1: Full build passes**
```bash
cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm run build
```

- [ ] **Step 2: Smoke test semantic search in browser**

Navigate to `http://localhost:3000/explore` and type "Find me a 2-bedroom apartment under $1200". Expected:
- No error message shown
- Context bar chips update: "Under $1,200", "2 bed"
- Map panel updates to show only matched listings

- [ ] **Step 3: Verify amenities render on listing detail**

Navigate to any listing detail page with amenities. Scroll past the fold. Expected: amenities grid renders without needing to scroll back.

- [ ] **Step 4: Verify AI Lease Summary is gone**

Navigate to a listing with a lease term. Expected: "Lease Details" shows once, no duplicate "AI Lease Summary" card.
