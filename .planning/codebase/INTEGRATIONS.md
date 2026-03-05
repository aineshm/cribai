# External Integrations

**Analysis Date:** 2026-03-05

## APIs & External Services

**AI / LLM:**
- Google Gemini 2.5 Flash - CribAI conversational agent and PageIndex summarization
  - SDK: `@google/genai` ^1.43.0
  - Auth: `GEMINI_API_KEY` env var
  - Usage locations:
    - `packages/ai/src/cribai.ts` - Streaming chat with function calling (agentic loop, max 5 tool calls, 30s timeout)
    - `packages/ai/src/pageindex-builder.ts` - Listing data summarization for RAG tree nodes
    - `packages/ai/src/pageindex-traverser.ts` - Query-time RAG traversal
  - Model: `gemini-2.5-flash` (hardcoded in both `cribai.ts` and `pageindex-builder.ts`)

**Web Scraping:**
- Apartments.com - Listing data source
  - Scraper: `services/scraper/scrapers/apartments-com.ts`
  - Framework: Crawlee + Playwright (headless browser)
  - Rate limit: 20 requests/minute, max 10 pages, 30s navigation timeout
  - Extracts: address, rent, bedrooms, bathrooms, sqft, amenities, coordinates, availability
  - Schedule: GitHub Actions cron, nightly at 2am CT (`0 8 * * *` UTC)
  - Workflow: `.github/workflows/nightly-scrape.yml`

**Payments (Phase 2 - stub only):**
- Stripe - Subscription management (not yet implemented)
  - Webhook endpoint: `apps/web/app/api/webhooks/stripe/route.ts` (stub, logs only)
  - Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - Planned events: `checkout.session.completed`, `customer.subscription.updated/deleted`
  - Database field: `profiles.stripe_customer_id` (column exists, not yet populated)

## Data Storage

**Database:**
- Supabase PostgreSQL with PostGIS extension
  - Connection: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client-side) or `SUPABASE_SECRET_KEY` (server-side)
  - Client factories:
    - `packages/supabase/src/client.ts` - Browser client via `createBrowserClient()` from `@supabase/ssr`
    - `packages/supabase/src/server.ts` - SSR client via `createServerComponentClient()` (cookie-based) and `createSecretClient()` (service role, no session)
  - Migrations: `supabase/migrations/`
    - `001_initial_schema.sql` - Core tables (campus_configs, profiles, listings, pageindex_trees, ai_query_logs, landlords, landlord_reviews, sublets, roommate_profiles) + RLS policies
    - `002_tour_requests.sql` - Tour scheduling with dedup index

**Tables:**

| Table | Purpose | RLS |
|-------|---------|-----|
| `campus_configs` | University/campus configuration, scrape settings, geo | Public read for `is_public` |
| `profiles` | User profiles extending `auth.users`, subscription tier | Own data only |
| `listings` | Scraped housing listings with fairness scores, PostGIS location | Campus-scoped read |
| `pageindex_trees` | Hierarchical RAG tree (JSON) per campus | No direct user access |
| `ai_query_logs` | Rate limiting + usage tracking | Own data only |
| `landlords` | Property management companies | Public read |
| `landlord_reviews` | User reviews (requires edu verification to write) | Public read, verified write |
| `tour_requests` | Scheduled property tours with dedup | Own data only |
| `sublets` | User-posted sublet listings (Phase 2) | Campus-scoped read |
| `roommate_profiles` | Roommate matching preferences (Phase 2) | Not yet active |

**File Storage:**
- Not currently used. Listing photos stored as URLs in `raw_data` JSONB. Lease docs referenced by `lease_doc_path` text field but no upload implementation.

**Caching:**
- Turborepo build cache (`.turbo/cache/`)
- No application-level caching (Redis, etc.)

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (built-in)
  - Implementation: Magic link / OTP email flow
  - Callback: `apps/web/app/auth/callback/route.ts` - Handles PKCE code exchange and token hash verification
  - Middleware: `apps/web/middleware.ts` - Guards `/{campusSlug}/cribai` routes, blocks unauthenticated `/api/ai/*`
  - Session management: Cookie-based via `@supabase/ssr`

**Edu Verification:**
- Supabase Edge Function: `supabase/functions/verify-edu/index.ts`
  - Validates email domain against `campus_configs.edu_domains`
  - Auto-verifies for MVP (no actual email confirmation)
  - Updates `profiles.is_edu_verified` and `profiles.campus_id`
  - Required for: writing landlord reviews

**Custom JWT Claims:**
- Function `auth.custom_claims(uid)` adds `campus_id`, `is_edu_verified`, `subscription_tier` to JWT

**Rate Limiting:**
- Tiered by subscription: free=10/hr, pro=50/hr, premium=200/hr
- Dual implementation:
  1. Edge Function: `supabase/functions/rate-limiter/index.ts` - Called from Next.js middleware
  2. Inline check: `apps/web/app/api/ai/cribai/route.ts` - Queries `ai_query_logs` directly

## Supabase Edge Functions

| Function | Path | Trigger | Purpose |
|----------|------|---------|---------|
| `rate-limiter` | `supabase/functions/rate-limiter/index.ts` | HTTP (from middleware) | Check AI query rate limits per user/tier |
| `rebuild-pageindex` | `supabase/functions/rebuild-pageindex/index.ts` | HTTP (service role) | Rebuild PageIndex RAG trees for all campuses |
| `recalculate-fairness` | `supabase/functions/recalculate-fairness/index.ts` | HTTP (after scrape via GitHub Actions) | Recalculate fairness scores for all active listings |
| `verify-edu` | `supabase/functions/verify-edu/index.ts` | HTTP (authenticated user) | Verify `.edu` email domain and link user to campus |

All edge functions use Deno runtime with `@supabase/supabase-js@2` via ESM imports from `esm.sh`.

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Datadog, etc.)

**Logs:**
- `console.log` / `console.warn` throughout
- AI query logging to `ai_query_logs` table (usage tracking, not observability)
- Scraper logs via Crawlee's built-in `log` object

## CI/CD & Deployment

**Hosting:**
- Vercel - Next.js frontend (`apps/web/`)
- Supabase Cloud - Database, Auth, Edge Functions

**CI Pipeline:**
- GitHub Actions
  - `nightly-scrape.yml` - Scheduled scraper + fairness recalculation
  - Runs on `ubuntu-latest` with pnpm 9 + Node 22
  - Post-scrape: triggers `recalculate-fairness` edge function via curl

## Environment Configuration

**Required env vars:**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (public)
- `SUPABASE_SECRET_KEY` - Supabase service role key (server-only)
- `GEMINI_API_KEY` - Google Gemini API key (server-only)

**Future env vars (Phase 2):**
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (public)

**Legacy:**
- `ANTHROPIC_API_KEY` - Listed in `.env.example` as "being migrated to Gemini"

**Secrets location:**
- GitHub Actions secrets (for CI)
- Vercel environment variables (for production)
- Supabase dashboard (for edge functions)

## API Routes

**Next.js API:**
- `POST /api/ai/cribai` - CribAI streaming chat endpoint (SSE)
  - Route: `apps/web/app/api/ai/cribai/route.ts`
  - Auth: Optional (degraded experience without auth)
  - Rate limited: Yes (middleware + inline)
- `POST /api/webhooks/stripe` - Stripe webhook receiver (stub)
  - Route: `apps/web/app/api/webhooks/stripe/route.ts`

## Webhooks & Callbacks

**Incoming:**
- `POST /api/webhooks/stripe` - Stripe payment events (stub, Phase 2)
- `GET /auth/callback` - Supabase Auth magic link callback

**Outgoing:**
- `POST ${SUPABASE_URL}/functions/v1/recalculate-fairness` - Triggered post-scrape from GitHub Actions
- `POST ${SUPABASE_URL}/functions/v1/rate-limiter` - Called from Next.js middleware on AI requests

---

*Integration audit: 2026-03-05*
