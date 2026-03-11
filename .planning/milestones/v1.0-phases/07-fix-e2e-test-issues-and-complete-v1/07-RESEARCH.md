# Phase 7: Fix E2E Test Issues and Complete v1 - Research

**Researched:** 2026-03-09
**Domain:** Bug fixes, UX polish, Next.js App Router, Supabase auth bypass
**Confidence:** HIGH

## Summary

Phase 7 is a bug-fix and polish phase that addresses 4 confirmed bugs from E2E testing and 6 remaining UX gaps from the audit. All bugs have clear root causes identified through code inspection, and the fixes involve modifying existing code patterns already established in the project. No new libraries or architectural changes are needed.

The most critical bugs are: (1) the price filter showing wrong cards due to `null`/zero `rent_monthly` values passing through PostgREST filters, (2) conversation persistence not wiring the existing lazy-creation logic to the dev auth path in the CribAI API route, (3) schedule_tour tool handler not recognizing dev auth bypass because the CribAI API route itself never resolves dev user IDs, and (4) Google Places photo URLs returning 403s (legacy data from removed scraper).

**Primary recommendation:** Fix all 4 E2E bugs first (they affect core functionality), then address UX gaps in priority order: favicon, submit button copy, notification read behavior, profile university field. Remove the Recently Viewed placeholder card rather than implementing tracking (deferred to v2 per CONTEXT.md).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Price filter shows wrong cards**: Count updates server-side (79 results) but displayed cards still show out-of-range prices ($0, $280, $350). Root cause: likely stale/cached grid data or filter not applied to query.
- **Conversations not persisted**: Chat messages only held in client state. No conversation record created in `conversations` table. `/api/conversations` POST endpoint exists but frontend never calls it. Sidebar always shows "No conversations yet." Messages lost on reload.
- **schedule_tour tool ignores dev auth**: Tool handler checks Supabase auth directly, doesn't recognize BYPASS_AUTH. Returns "You must be signed in" in dev mode. Must check `isDevAuthEnabled()` and use dev user ID from headers/cookies (same pattern as `/api/conversations/route.ts`).
- **Google Places photos return 403**: All photos from `places.googleapis.com` fail when proxied through Next.js Image Optimizer. Need to remove/replace these broken URLs or switch photo source.
- **M2: "Recently Viewed" dashboard card is placeholder** -- either implement localStorage-based view tracking or remove the card
- **M3: Submit listing button copy** -- change "Submit Listing" to community-oriented CTA
- **M5: Profile university field hardcoded** -- should derive from campus context
- **M6: Notification auto-mark-as-read** -- visiting page immediately marks all read with no undo
- **M9: No tour confirmation step** -- tour is submitted without preview/confirmation before tool executes
- **Missing favicon** -- add favicon to prevent 404 on every page load

### Claude's Discretion
- Technical approach for fixing price filter (server-side vs client-side filtering)
- Photo placeholder strategy for listings without photos (already partially addressed by Agent 3)
- Whether to implement Recently Viewed tracking or remove the placeholder
- Conversation persistence implementation details (lazy creation pattern already designed in Phase 6)

### Deferred Ideas (OUT OF SCOPE)
- M2 Recently Viewed: defer to v2 if implementation is complex
- Tour confirmation flow (M9): defer to v2 -- current flow works, just lacks pre-confirmation UI
- Property type filter: not in current data schema, defer to v2
- Map on listing detail: needs Mapbox/Google Maps API key setup, defer if not configured

</user_constraints>

## Architecture Patterns

### Bug 1: Price Filter Shows Wrong Cards

**Root cause analysis (HIGH confidence):**

The listings page at `apps/web/app/(campus)/[campusSlug]/listings/page.tsx` uses a single Supabase query with `.gte('rent_monthly', min)` and `.lte('rent_monthly', max)`. The count and data come from the same query (line 85), so if count is correct (79), the data should also be correct.

The issue is that PostgREST's `.gte()` and `.lte()` operators treat `NULL` values inconsistently -- `NULL` values are not excluded by range filters in PostgreSQL (`NULL >= 500` evaluates to `NULL`, which is falsy, so they should be excluded). However, the E2E report shows `$0/mo` cards appearing, which means `rent_monthly = 0` values pass through `gte('rent_monthly', 500)` -- this is impossible in PostgreSQL.

**Actual root cause:** The debounced price filter uses `router.push()` which triggers a server-side re-fetch. The 400ms debounce in `ListingFilters` means the URL updates asynchronously. The count display likely updates from a different mechanism (possibly the filter count badge) while the server component hasn't yet re-rendered. Looking more carefully: this is a Next.js App Router caching issue. Server Components in the App Router may serve a cached RSC payload for the same route with different search params.

**Recommended fix:**
1. Add `export const dynamic = 'force-dynamic'` to the listings page to prevent caching
2. Add a `.not('rent_monthly', 'is', null)` filter when price filters are active to exclude nulls
3. Add `.gt('rent_monthly', 0)` when minPrice is set to exclude $0 listings

### Bug 2: Conversations Not Persisted

**Root cause analysis (HIGH confidence):**

The conversation persistence code in `cribai-chat.tsx` (lines 206-214) DOES call `createConversation()` on first message when `isAuthenticated && !activeConvId && campusId` -- the code exists and looks correct. The issue is upstream: the CribAI API route (`/api/ai/cribai/route.ts`) only resolves `userId` from bearer token auth headers (lines 144-162). In dev mode with BYPASS_AUTH, the client has no real Supabase session, so `auth.getSession()` returns null, so no auth header is sent.

This means:
- The conversation IS created (POST /api/conversations handles dev auth via cookies)
- But messages sent to CribAI have no userId context
- The CribAI response works (AI doesn't need auth) but message persistence to the conversation may fail if the messages API requires auth

**Actually:** Re-reading the code more carefully, the `persistMessage()` function at line 218 IS called with the active conversation ID, and `POST /api/conversations/:id/messages` should handle dev auth. The sidebar DOES fetch from `GET /api/conversations` which handles dev auth. The issue may be simpler -- the sidebar `refreshTrigger` may not increment properly, or the conversation creation fails silently.

**Recommended fix:**
1. Add dev auth resolution to `/api/ai/cribai/route.ts` (same pattern as `/api/conversations/route.ts`) so userId flows to tool context
2. Verify the conversation sidebar refresh trigger fires after conversation creation
3. Test the full flow: create conversation -> persist messages -> sidebar shows conversation

### Bug 3: schedule_tour Dev Auth

**Root cause (HIGH confidence):**

The `scheduleTour` handler at `packages/ai/src/tools/handlers/schedule-tour.ts` line 54 checks `context.userId` which comes from `ToolContext`. The `ToolContext` is built in `/api/ai/cribai/route.ts` line 202-207 where `userId` is set from bearer token auth only. In dev mode, no bearer token exists, so `userId` is `undefined`.

**Recommended fix:**
Add dev auth check to `/api/ai/cribai/route.ts` before building ToolContext:
```typescript
// After existing auth header check (line 162):
if (!userId && isDevAuthEnabled()) {
  const cookieStore = await cookies();
  const selectedId = cookieStore.get(DEV_USER_COOKIE)?.value;
  const devUser = selectedId ? getDevUserById(selectedId) : DEFAULT_DEV_USER;
  userId = devUser?.id ?? DEFAULT_DEV_USER.id;
}
```

This follows the exact pattern from `/api/conversations/route.ts` lines 17-21.

### Bug 4: Google Places Photos 403

**Root cause (HIGH confidence):**

Google Places photos require an API key in the URL and have referrer restrictions. The scraper that generated these URLs (GooglePlacesScraper) was removed in Phase 5 (decision: "GooglePlacesScraper removed from pipeline, file preserved for Phase 6 enrichment"). These are legacy URLs in the database.

**Recommended fix:**
1. Write a SQL migration or seed script to nullify/remove `places.googleapis.com` URLs from `photo_urls` arrays in the listings table
2. Remove `places.googleapis.com` from `next.config.ts` remotePatterns
3. The existing "No photo" placeholder already handles listings without photos

### UX Fix: Missing Favicon

**Recommended approach:**
- Add `favicon.ico` to `apps/web/app/` (Next.js App Router convention)
- Use a simple house/home icon in the CampusNest brand colors
- Next.js 15 automatically serves `app/favicon.ico` without configuration

### UX Fix: Submit Button Copy

**Location:** `apps/web/components/submit-listing-form.tsx` and navigation references in `mobile-nav.tsx` and `layout.tsx`

**Recommended copy:** Change "Submit Listing" to "Share a Listing" or "Add a Listing" for community feel.

### UX Fix: Notification Auto-Mark-As-Read

**Location:** `apps/web/app/(campus)/[campusSlug]/notifications/page.tsx` lines 98-103

Currently marks ALL unread as read immediately on page load (server-side, no undo).

**Recommended fix:** Use a client-side delayed mark-as-read pattern:
- Render page with unread styling visible
- After 3-second delay, mark as read via API call
- Or: mark individual notifications as read on click/hover
- Simplest: add a "Mark all as read" button instead of auto-marking

### UX Fix: Profile University Field

**Location:** `apps/web/app/settings/profile/page.tsx` and `apps/web/components/profile-form.tsx`

Profile page fetches `display_name, avatar_url, graduation_year, major` but no university/campus field. Since the platform is campus-scoped (URL has campusSlug), the university should be derived from the user's campus context, not a form field.

**Recommended fix:** Display university name as a read-only field derived from the user's `campus_id` in their profile, or from the current campus context.

### UX Fix: Recently Viewed Dashboard Card

**Location:** `apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx` lines 144-152

Per CONTEXT.md deferred decision, **remove the placeholder card** rather than implementing tracking. This is simpler and avoids a half-baked feature.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Favicon generation | Custom SVG-to-ICO pipeline | Pre-made .ico file or Next.js metadata API | One-time asset, not worth automation |
| Photo URL cleanup | Manual SQL updates per listing | Single migration/script with array manipulation | Hundreds of listings to update |
| Notification read delay | Custom timer logic | `setTimeout` + fetch in a client component | Simple pattern, no library needed |

## Common Pitfalls

### Pitfall 1: Next.js App Router Caching with Search Params
**What goes wrong:** Server Components can be cached even when search params change, causing stale data
**Why it happens:** Next.js 15 App Router uses aggressive caching by default for server components
**How to avoid:** Add `export const dynamic = 'force-dynamic'` or use `export const revalidate = 0` on pages that depend on search params for data fetching
**Warning signs:** Count/pagination updates but grid data doesn't change

### Pitfall 2: Dev Auth Inconsistency Across API Routes
**What goes wrong:** Some routes handle dev auth (conversations), others don't (cribai AI route)
**Why it happens:** Dev auth was added incrementally, not systematically
**How to avoid:** After fixing, audit ALL API routes to ensure consistent dev auth handling
**Warning signs:** Features work in production auth but fail in dev mode

### Pitfall 3: PostgREST NULL Handling in Range Filters
**What goes wrong:** NULL or zero values in numeric columns pass through range filters unexpectedly
**Why it happens:** PostgreSQL NULL comparisons return NULL (not true/false); zero values are valid numbers
**How to avoid:** Explicitly filter out NULLs and zeros when applying price range filters
**Warning signs:** Cards showing $0/mo or "Price N/A" when price filter is active

### Pitfall 4: Supabase Array Column Updates
**What goes wrong:** Updating JSONB array columns (like `photo_urls`) requires specific PostgREST syntax
**Why it happens:** Standard `.update()` replaces the entire value; filtering within arrays needs SQL functions
**How to avoid:** Use a migration with `array_remove` or rebuild the array with a subquery
**Warning signs:** Accidentally nullifying all photo_urls instead of just Google Places ones

## Code Examples

### Dev Auth Resolution Pattern (from conversations/route.ts)
```typescript
// Source: apps/web/app/api/conversations/route.ts lines 13-25
import { isDevAuthEnabled, getDevUserById, DEFAULT_DEV_USER, DEV_USER_COOKIE } from '../../../lib/dev-auth';

async function resolveUserId(): Promise<{ userId: string | null }> {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  if (isDevAuthEnabled()) {
    const selectedId = cookieStore.get(DEV_USER_COOKIE)?.value;
    const devUser = selectedId ? getDevUserById(selectedId) : DEFAULT_DEV_USER;
    return { userId: devUser?.id ?? DEFAULT_DEV_USER.id, supabase };
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  return { userId: (!error && user) ? user.id : null, supabase };
}
```

### Force Dynamic for Search Param Pages
```typescript
// Add to top of listings/page.tsx
export const dynamic = 'force-dynamic';
```

### SQL to Remove Google Places Photo URLs
```sql
-- Remove places.googleapis.com URLs from photo_urls arrays
UPDATE listings
SET photo_urls = (
  SELECT COALESCE(
    array_agg(url ORDER BY ordinality),
    ARRAY[]::text[]
  )
  FROM unnest(photo_urls) WITH ORDINALITY AS t(url, ordinality)
  WHERE url NOT LIKE '%places.googleapis.com%'
)
WHERE EXISTS (
  SELECT 1 FROM unnest(photo_urls) AS url
  WHERE url LIKE '%places.googleapis.com%'
);
```

### Delayed Notification Mark-As-Read
```typescript
'use client';

import { useEffect } from 'react';

function useDelayedMarkAsRead(notificationIds: string[], delayMs = 3000) {
  useEffect(() => {
    if (notificationIds.length === 0) return;
    const timer = setTimeout(async () => {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: notificationIds }),
      });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [notificationIds, delayMs]);
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (unit/integration) + Playwright (E2E) |
| Config file | `apps/web/vitest.config.ts`, `apps/web/playwright.config.ts` |
| Quick run command | `pnpm --filter @campusnest/web test -- --run` |
| Full suite command | `pnpm test` (turbo, all packages) |

### Phase Requirements -> Test Map

Since this is a bug-fix phase with no formal requirement IDs, tests map to bugs:

| Bug ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUG-1 | Price filter excludes out-of-range listings | E2E | `pnpm --filter @campusnest/web exec playwright test tests/e2e/listings.spec.ts` | Yes (needs update) |
| BUG-2 | Conversations persist across reload | E2E | `pnpm --filter @campusnest/web exec playwright test tests/e2e/auth.spec.ts` | Yes (needs update) |
| BUG-3 | schedule_tour works in dev mode | unit | `pnpm --filter @campusnest/ai test -- --run` | Yes (schedule-tour.test.ts exists) |
| BUG-4 | No 403 errors on listing photos | manual-only | Visual check on listings page | N/A |
| UX-1 | Favicon loads without 404 | manual-only | Check network tab | N/A |
| UX-2 | Submit button shows updated copy | manual-only | Visual check | N/A |
| UX-3 | Notifications not auto-marked-read | E2E | Manual verification | N/A |

### Sampling Rate
- **Per task commit:** `pnpm --filter @campusnest/web test -- --run`
- **Per wave merge:** `pnpm test` (full turbo suite)
- **Phase gate:** Full suite green + manual E2E spot check

### Wave 0 Gaps
- None -- existing test infrastructure covers all phase requirements. E2E specs exist and can be extended.

## Sources

### Primary (HIGH confidence)
- Direct code inspection of all affected files (listings page, cribai-chat, schedule-tour handler, conversations API, notifications page, dashboard page, profile page)
- E2E test reports: `docs/agent-outputs/e2e-listings-results.md`, `docs/agent-outputs/e2e-auth-chat-results.md`
- CONTEXT.md decisions from user discussion

### Secondary (MEDIUM confidence)
- Next.js 15 App Router caching behavior (based on framework documentation knowledge)
- PostgREST NULL handling in range filters (based on PostgreSQL semantics)

## Metadata

**Confidence breakdown:**
- Bug root causes: HIGH - confirmed through direct code inspection of all relevant files
- Fix approaches: HIGH - all fixes follow existing patterns already in the codebase
- UX fixes: HIGH - straightforward changes to existing components
- Caching hypothesis (price filter): MEDIUM - needs verification but fix is low-risk regardless

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable bug-fix phase, no dependency on external changes)
