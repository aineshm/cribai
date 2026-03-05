# Codebase Concerns

**Analysis Date:** 2026-03-05

## Tech Debt

**Stripe webhook is a stub:**
- Issue: The Stripe webhook handler at `apps/web/app/api/webhooks/stripe/route.ts` does nothing. It accepts all POST requests, logs the body length, and returns `{ received: true }` without verifying the webhook signature or processing any events.
- Files: `apps/web/app/api/webhooks/stripe/route.ts`
- Impact: Subscription tier changes (free/pro/premium) cannot be applied automatically. The `profiles.subscription_tier` column exists but has no mechanism to update beyond manual DB edits. Rate limits reference tiers that users can never reach.
- Fix approach: Install `stripe` package, verify webhook signature with `STRIPE_WEBHOOK_SECRET`, handle `checkout.session.completed` and `customer.subscription.updated/deleted` events to update `profiles.subscription_tier`.

**Landlord-listing linkage is missing:**
- Issue: The `listings` table has no `landlord_id` foreign key. The `get-landlord-info` tool handler returns a hardcoded "coming soon" message when called with a `listing_id`.
- Files: `packages/ai/src/tools/handlers/get-landlord-info.ts` (lines 23-33), `supabase/migrations/001_initial_schema.sql`
- Impact: CribAI cannot answer "who is the landlord for this listing?" which is a core use case. The landlord reviews system exists but is disconnected from listings.
- Fix approach: Add `landlord_id uuid REFERENCES landlords(id)` to the `listings` table via a new migration. Update the scraper normalizer to extract property management company. Update `get-landlord-info.ts` to join through the FK.

**Duplicate auth callback routes:**
- Issue: Two auth callback route handlers exist at different paths that do the same thing with minor differences.
- Files: `apps/web/app/(auth)/callback/route.ts`, `apps/web/app/auth/callback/route.ts`
- Impact: Confusion about which callback URL to configure in Supabase. Risk of one route being updated while the other is not. The `(auth)` group version and the `auth/` version have slightly different code (the non-grouped one uses `new URL()` for redirect).
- Fix approach: Consolidate to a single callback route. Update Supabase auth settings to point to the canonical one. Delete the other.

**Empty `apps/mobile/` directory:**
- Issue: An empty mobile app directory exists in the monorepo.
- Files: `apps/mobile/`
- Impact: Minor — clutters project structure, may confuse contributors.
- Fix approach: Remove the empty directory or add a README placeholder.

**Duplicate rate limiting logic:**
- Issue: Rate limiting is implemented in three places with the same constants but different code paths: the middleware calls the edge function, the CribAI route has its own inline check, and the edge function itself.
- Files: `apps/web/middleware.ts` (lines 60-81), `apps/web/app/api/ai/cribai/route.ts` (lines 88-115), `supabase/functions/rate-limiter/index.ts`
- Impact: Race conditions between middleware rate-limit check and route-level check. If middleware passes but the route check also queries the same table, it doubles the DB load. The middleware calls the edge function via HTTP (adding latency to every AI request), while the route does an inline query.
- Fix approach: Choose one rate-limiting strategy. The inline check in the route is more efficient (no HTTP round-trip). Remove the middleware edge function call for `/api/ai/*` routes, or remove the inline check from the route and rely solely on the middleware.

**Amenity filtering is done client-side:**
- Issue: The `search-listings` tool handler fetches all matching listings from the DB then filters by amenities in JavaScript rather than using a Supabase/PostgreSQL query.
- Files: `packages/ai/src/tools/handlers/search-listings.ts` (lines 82-90)
- Impact: Fetches more rows than needed from the database. With large listing datasets, this wastes bandwidth and memory. The `limit` is applied before amenity filtering, so the tool may return fewer results than expected.
- Fix approach: Use PostgreSQL `jsonb` containment operator (`@>`) or `cs` (contains) filter in Supabase query to filter amenities server-side. Apply `limit` after amenity filtering.

**AI query log column name mismatch:**
- Issue: The `ai_query_logs` table schema defines `query_text` as the column name, but the CribAI route inserts into a `query` column.
- Files: `supabase/migrations/001_initial_schema.sql` (line 106: `query_text text NOT NULL`), `apps/web/app/api/ai/cribai/route.ts` (line 240: `query`)
- Impact: The fire-and-forget insert (`void supabase.from('ai_query_logs').insert(...)`) silently fails. AI query logs are never persisted, making rate limiting based on `ai_query_logs` count unreliable (always returns 0 queries). Users effectively have no rate limit.
- Fix approach: Change the insert to use `query_text` instead of `query`, or add a migration renaming the column. Also: stop using fire-and-forget for this insert — at minimum log errors.

## Security Considerations

**Edu verification auto-approves without email confirmation:**
- Risk: The `verify-edu` edge function auto-sets `is_edu_verified = true` if the email domain matches a campus. No verification email is sent to confirm the user actually owns the `.edu` address.
- Files: `supabase/functions/verify-edu/index.ts` (lines 53-64)
- Current mitigation: Comment acknowledges this is MVP behavior (line 54: "In production: send verification email").
- Recommendations: Implement actual email verification flow: set status to `pending`, send a verification email with a token, set to `verified` only after the user clicks the link.

**Listings page uses service-role client for public data:**
- Risk: The listings page and listing detail page use `createSecretClient()` (which uses `SUPABASE_SECRET_KEY`, the service-role key that bypasses RLS) to fetch listings data.
- Files: `apps/web/app/(campus)/[campusSlug]/listings/page.tsx` (line 17), `apps/web/app/(campus)/[campusSlug]/listings/[id]/page.tsx` (line 15)
- Current mitigation: These are server components, so the secret key is never exposed to the client. The queries are read-only.
- Recommendations: Use the cookie-based `createServerComponentClient()` instead, which respects RLS. The service-role client should only be used for operations that genuinely need to bypass RLS (e.g., admin operations, the CribAI tool context).

**Open redirect in auth callback:**
- Risk: The `next` query parameter in the auth callback is used directly for redirects without validation. An attacker could craft a URL like `/auth/callback?code=...&next=https://evil.com`.
- Files: `apps/web/app/(auth)/callback/route.ts` (line 10-11), `apps/web/app/auth/callback/route.ts` (lines 12-13)
- Current mitigation: The `apps/web/app/auth/callback/route.ts` version uses `new URL(next, origin)` which restricts to same-origin. The `(auth)` version concatenates the string directly (`${origin}${next}`).
- Recommendations: Validate that `next` starts with `/` and does not contain `//` or protocol prefixes. Use the `new URL()` approach consistently.

**Unauthenticated users can access CribAI API route:**
- Risk: The middleware blocks unauthenticated users from `/api/ai/*`, but the CribAI route handler itself allows unauthenticated access (lines 142-162 treat auth as optional). If middleware is bypassed (e.g., edge function cold-start race), unauthenticated users get AI access without rate limiting.
- Files: `apps/web/middleware.ts` (lines 84-87), `apps/web/app/api/ai/cribai/route.ts` (lines 142-170)
- Current mitigation: Middleware blocks unauthenticated requests. Unauthenticated users skip rate limiting entirely (line 165: `if (userId)`).
- Recommendations: Add authentication check in the route handler as defense-in-depth. Do not rely solely on middleware for security.

## Performance Bottlenecks

**PageIndex traversal makes multiple LLM calls per user query:**
- Problem: Each CribAI query triggers the `PageIndexTraverser` which makes up to 3 sequential Gemini API calls (one per tree depth level) just to select which branches to traverse, before the main chat LLM call.
- Files: `packages/ai/src/pageindex-traverser.ts`
- Cause: The tree traversal uses an LLM call at each depth level to decide which branches are relevant. With `maxDepth=3` and `maxBranches=3`, this is up to 3 sequential LLM calls plus 1+ streaming calls for the actual response.
- Improvement path: Cache traversal results for similar queries. Consider using embeddings instead of LLM calls for branch selection. Pre-compute keyword mappings for common query patterns.

**Middleware calls edge function on every AI request:**
- Problem: The middleware makes an HTTP fetch to the `rate-limiter` edge function for every `/api/ai/*` request, adding network latency before the request even reaches the route handler.
- Files: `apps/web/middleware.ts` (lines 60-81)
- Cause: External HTTP call to Supabase edge function instead of inline DB query.
- Improvement path: Remove the middleware rate-limit check (the route already does its own check). Or move to an in-memory rate limiter (e.g., `Map` with sliding window) that doesn't require DB queries.

**No pagination on listings page:**
- Problem: The listings page fetches all active listings for a campus with no pagination or limit.
- Files: `apps/web/app/(campus)/[campusSlug]/listings/page.tsx` (line 74)
- Cause: The Supabase query has no `.limit()` or `.range()` call.
- Improvement path: Add cursor-based or offset pagination. Add `.limit(20)` and implement a "load more" or pagination UI.

## Fragile Areas

**SSE streaming parser in chat client:**
- Files: `apps/web/components/cribai-chat.tsx` (lines 106-191)
- Why fragile: The SSE parser manually splits on newlines and reassembles a buffer. It handles both old format (`{ text: "..." }`) and new format (`{ type: "text", content: "..." }`) events. The dual-format support adds complexity and edge cases.
- Safe modification: Add comprehensive unit tests for the `parseSSEEvent` function and the buffer reassembly logic. Consider using the `EventSource` API or a well-tested SSE client library.
- Test coverage: No tests exist for the chat component or SSE parsing logic.

**Scraper CSS selector dependencies:**
- Files: `services/scraper/scrapers/apartments-com.ts`
- Why fragile: The scraper depends on specific CSS selectors (`article.placard`, `a.property-link`, `.rentInfoDetail .rentPrice`, etc.) from Apartments.com. Any site redesign breaks the scraper silently (returns null/empty results).
- Safe modification: Add monitoring for scrape result counts. Alert when a scrape returns 0 listings for a campus that previously had listings. Add fallback selectors.
- Test coverage: The normalizer has tests (`services/scraper/__tests__/normalizer.test.ts`) but the scraper itself has no tests (would require mocking Playwright).

**CribAI agentic loop:**
- Files: `packages/ai/src/cribai.ts` (lines 87-185)
- Why fragile: The loop manages tool calls, function responses, content accumulation, and timeout checking in a single method. The `contents` array is mutated in place. Breaking changes in the Gemini SDK `@google/genai` types (`FunctionCall`, `Part`) would break the loop.
- Safe modification: Extract tool execution into a separate method. Add integration tests that mock Gemini responses with tool calls.
- Test coverage: No tests for the `CribAI` class or the agentic loop. Only individual tool handlers are tested.

## Missing Critical Features

**No listing data cleanup or staleness detection:**
- Problem: Listings are marked `is_active` but there is no mechanism to deactivate stale listings. The `last_seen_at` column exists but nothing checks it.
- Blocks: Users may see listings that are no longer available, damaging trust.

**No email notifications for tour requests:**
- Problem: Tour requests are stored in the database but no email is sent to anyone — not the student, not the landlord/property manager.
- Blocks: Tour scheduling is effectively a dead feature. The confirmation block says "The student will receive confirmation at [email]" but no email is sent.

**No admin interface:**
- Problem: There is no admin panel for managing campuses, reviewing tour requests, monitoring scraper health, or viewing AI usage metrics.
- Blocks: Operations require direct database access via Supabase dashboard.

## Test Coverage Gaps

**No tests for CribAI engine:**
- What's not tested: The `CribAI` class, `PageIndexTraverser`, `PageIndexBuilder`, SSE streaming, and the API route handler.
- Files: `packages/ai/src/cribai.ts`, `packages/ai/src/pageindex-traverser.ts`, `packages/ai/src/pageindex-builder.ts`, `apps/web/app/api/ai/cribai/route.ts`
- Risk: The core AI flow (traversal + multi-turn tool calling + streaming) has zero test coverage. Regressions in the agentic loop or SSE encoding would go undetected.
- Priority: High

**No tests for frontend components:**
- What's not tested: All React components (`cribai-chat.tsx`, `listing-card.tsx`, `listing-grid.tsx`, `listing-filters.tsx`, `true-cost-calculator.tsx`, `fairness-badge.tsx`, all `chat/*` components).
- Files: `apps/web/components/`
- Risk: UI regressions, broken rendering of chat blocks (listing cards, comparison tables, tour confirmations, legal disclaimers).
- Priority: Medium

**No tests for middleware:**
- What's not tested: Auth redirect logic, rate limiting integration, cookie handling.
- Files: `apps/web/middleware.ts`
- Risk: Auth bypass, rate limiting failures.
- Priority: High

**No tests for auth callback routes:**
- What's not tested: PKCE flow, token hash flow, redirect handling, error cases.
- Files: `apps/web/app/(auth)/callback/route.ts`, `apps/web/app/auth/callback/route.ts`
- Risk: Login failures go undetected until users report them.
- Priority: Medium

**No tests for Supabase edge functions:**
- What's not tested: `verify-edu`, `rate-limiter`, `recalculate-fairness`, `rebuild-pageindex`.
- Files: `supabase/functions/`
- Risk: Edu verification bypass, rate limiting failures, fairness score corruption.
- Priority: Medium

**No tests for scraper:**
- What's not tested: The `ApartmentsComScraper` class, `BaseScraper`, scraper runner.
- Files: `services/scraper/scrapers/apartments-com.ts`, `services/scraper/scrapers/base-scraper.ts`, `services/scraper/run.ts`
- Risk: Scraper silently breaks on Apartments.com redesigns. Only the normalizer has tests.
- Priority: Low (scraper breakage is detectable by monitoring listing counts)

## Dependencies at Risk

**`@google/genai` SDK:**
- Risk: The Gemini SDK is relatively new and its API surface may change. The codebase uses `generateContentStream`, function calling, and `FunctionCall`/`Part` types extensively.
- Impact: Breaking changes in the SDK would affect `packages/ai/src/cribai.ts` and `packages/ai/src/pageindex-traverser.ts`.
- Migration plan: Pin the SDK version. Monitor Gemini SDK changelog. The `CribAI` class abstracts the SDK well, so changes would be localized.

**Apartments.com scraper fragility:**
- Risk: Web scraping is inherently fragile. Apartments.com may change their HTML structure, add bot detection, or block the scraper IP.
- Impact: No new listing data flows into the system. Existing listings become stale.
- Migration plan: Add additional scraper sources (Zillow, Craigslist). Implement a scraper health monitoring system. Consider using official APIs where available.

---

*Concerns audit: 2026-03-05*
