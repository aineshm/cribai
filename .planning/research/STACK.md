# Stack Research

**Domain:** Native Agent Backend — Mission Executor, HITL, Realtime Status, Steering Bar, Real Tool Integrations
**Researched:** 2026-03-10
**Confidence:** HIGH (core patterns verified against official Vercel, Next.js, Supabase docs; tool integrations verified via npm/Google APIs)
**Scope:** NEW additions only for v1.2. Existing stack (Next.js 15.1, Supabase, Gemini 2.5 Flash, Tavily, Mapbox, shadcn/ui, Framer Motion, Vitest) is proven and not re-evaluated.

---

## What This Research Covers

The v1.2 milestone adds:
1. Mission executor backend — async agent pipeline that writes to a `missions` table and executes search/shortlist/contact/schedule flows
2. Missions DB schema with HITL draft versioning, idempotency keys, and expiration
3. Supabase Realtime subscriptions — live mission status updates pushed to the Concierge UI
4. Steering bar intent parsing — free-text amendment via Gemini function calling
5. Real tool integrations — replacing `get_reviews`, `contact_pm`, and `get_neighborhood_info` stub handlers with actual data

---

## Recommended Stack

### Core New Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `after()` from `next/server` | Built into Next.js 15.1+ | Fire-and-forget mission executor background tasks | Stable since Next.js v15.1.0. Schedules async work after the 202 Accepted response is sent. Available in Route Handlers. No new package needed — already in the `next` dep. Replaces the older `@vercel/functions waitUntil()` pattern. Official Vercel recommendation is `after()` for any Next.js ≥15.1. |
| Supabase Realtime (existing `@supabase/supabase-js`) | ^2.47.0 (already installed) | Push `missions` table `UPDATE` events to Concierge UI clients | Zero new dependency. Subscribe to `postgres_changes` filtered by `user_id=eq.${userId}` on the `missions` table. RLS is enforced — users only receive events for rows they own. Already used in v1.0 for price change notifications. Pattern: `supabase.channel().on('postgres_changes', { event: 'UPDATE', table: 'missions', filter: \`user_id=eq.${userId}\` }, callback).subscribe()`. |
| `@googlemaps/places` | ^2.3.0 | Neighborhood info, AI-generated area summaries, nearby place data | Official Google Places API (New) Node.js client. Exposes `neighborhoodSummary`, `generativeSummary`, `reviewSummary` fields introduced in 2025. Replaces the `get_neighborhood_info` stub. Last published 16 days ago (March 2026). Maintained by Google. Existing Mapbox API key is NOT usable — separate Google Maps Platform API key required. |
| Tavily Extract (existing `@tavily/core`) | ^0.7.2 (already installed) | Scrape and structure landlord contact pages, review aggregation fallback | Zero new dependency. Tavily's `.extract()` method fetches and structures page content from a URL list. Use for `get_reviews` (Reddit, Google Maps, Yelp URLs passed as extract targets) and `contact_pm` (extract contact email/phone from listing source URL). Same API key already in env. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `resend` | ^4.x | Send HITL draft approval emails to students | When a mission reaches `waiting_approval` status and a draft is ready. Resend has a generous free tier (3,000 emails/month), native React Email template support, and no infra to manage. An alternative is Supabase Edge Functions with SMTP, but Resend is simpler to integrate. Only install if email HITL flow is in v1.2 scope. |
| `zod` | ^3.24.0 (already installed) | Validate mission creation payloads, steering bar parse results | Already present. Use to define and validate the `CreateMissionInput` schema in the `/api/missions` route handler. |

### What Does NOT Need a New Package

| Capability | How It's Already Handled |
|------------|--------------------------|
| Steering bar intent parsing | Existing `@google/genai` + Gemini function calling. Define a `parse_steering_intent` function schema, call Gemini with the current mission state + user input, get back a structured `{ action, params }` object. Same pattern as the 11-tool CribAI loop. |
| Mission status polling (fallback) | A custom `useInterval` hook (~15 lines) + Supabase `.from('missions').select()` query. If Realtime is too complex for a phase, fall back to 5s polling with no library needed. |
| Idempotency keys | `crypto.randomUUID()` (Node.js built-in). Insert as `idempotency_key` column. Upsert with `onConflict: 'idempotency_key'` to deduplicate duplicate POSTs. |
| Mission expiration | Postgres `expires_at TIMESTAMPTZ` column + a Supabase cron or GitHub Actions nightly job. No queueing library needed. |
| HITL draft versioning | `mission_drafts` table with `version INTEGER` column + `approved_at TIMESTAMPTZ`. Append-only — never update existing draft rows, insert new versions. |

---

## Installation

```bash
# Google Places API (New) Node.js client — for neighborhood info and AI summaries
pnpm add @googlemaps/places --filter @campusnest/ai

# Resend (conditional — only if email HITL notifications are in v1.2 scope)
pnpm add resend --filter @campusnest/web

# after() and Supabase Realtime — already available in existing packages
# No install needed
```

---

## Key Architecture Decisions

### Mission Executor: `after()` + Supabase, Not a Queue

The v1.2 mission executor is implemented as a Next.js Route Handler that:
1. Validates the incoming request and creates a `missions` row with status `pending`
2. Returns `202 Accepted` immediately
3. Calls `after(async () => { runMissionExecutor(missionId) })` to fire the agent pipeline in the background

This works because:
- `after()` is officially stable in Next.js 15.1 (which this project already uses per its `next: ^15.1.0` dep)
- Vercel Hobby plan allows 60s serverless functions (enough for a search + shortlist pipeline)
- Vercel Fluid Compute extends this to 300s if needed for longer missions — no plan upgrade required
- No new infrastructure (no Redis, no queue, no Lambda) — the `missions` table IS the queue

**Do NOT use:** Inngest, QStash, BullMQ, or LangGraph in v1.2. PROJECT.md explicitly defers state machine frameworks to v2. These are premature for a table-plus-polling pattern.

### Realtime: Supabase Postgres Changes, Not SSE

Supabase Realtime `postgres_changes` is the correct upgrade from the v1.1 polling recommendation:
- The Concierge UI `ConciergeProvider` context currently holds mock missions state. Replace `mockMissions` with a live Supabase Realtime subscription filtered to the authenticated user's missions.
- RLS is automatically enforced — users only receive events for rows where `user_id = auth.uid()`.
- Subscribe on mount, unsubscribe on unmount: `supabase.removeChannel(channel)`.
- No WebSocket server needed — `@supabase/supabase-js` manages the connection.

**Pattern for `ConciergeProvider.tsx`:**
```typescript
// Replace useState(mockMissions) with Supabase Realtime
useEffect(() => {
  const channel = supabase
    .channel('missions-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'missions', filter: `user_id=eq.${userId}` },
      (payload) => {
        // Update missions state from payload.new / payload.eventType
      }
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [userId]);
```

### Real Tool Integrations: No Scraping, Use APIs + Tavily Extract

**`get_neighborhood_info` → `@googlemaps/places` + Tavily web search:**
- Call `@googlemaps/places` with the listing's lat/lng to get `neighborhoodSummary`, `generativeSummary`, and nearby places (restaurants, transit, parks).
- Supplement with a Tavily search for `"[address] neighborhood crime safety transit"` to get community-sourced context.
- Requires a Google Maps Platform API key with Places API (New) enabled. Add as `GOOGLE_PLACES_API_KEY` env var.

**`get_reviews` → Tavily Extract:**
- Pass the listing's source URL + related review URLs (Reddit r/UWMadison search URL, Google Maps search URL for the address) to `tavily.extract({ urls: [...] })`.
- Tavily returns structured text content from each page. Pass the content to Gemini to summarize into a `reviews` block.
- No scraping infra needed — Tavily handles JS-rendered pages.

**`contact_pm` → Tavily Extract + listing `contact_email` column:**
- The `listings` table already has a `contact_email` column (added in migration 011). If populated, use it directly.
- If null, extract the listing's `source_url` via `tavily.extract()` to find contact info on the original listing page.
- Compose the PM message via Gemini using the current mission context + user's stated request.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `after()` from `next/server` | `waitUntil` from `@vercel/functions` | Use `waitUntil` only if the project downgrades to Next.js < 15.1. Vercel explicitly recommends `after()` for Next.js 15.1+. |
| Supabase Realtime `postgres_changes` | 5-second polling interval | Polling is acceptable for initial implementation — mission state transitions happen at most once per 30 seconds in practice. Realtime is the cleaner long-term solution. |
| `@googlemaps/places` v2.3.0 (Places API New) | `@googlemaps/google-maps-services-js` (legacy) | The legacy package targets Places API (Old) which lacks `neighborhoodSummary` and AI summaries. Use the new client. |
| Tavily Extract for reviews | Building a Reddit/Yelp scraper | A dedicated scraper creates infra overhead and fragility. Tavily's extract endpoint handles JS rendering, deduplication, and rate limiting — leveraging the existing Tavily key. |
| `resend` for HITL email | Supabase Edge Function + SMTP | Resend has a simpler API, native React Email support, and no credentials to rotate. Use Supabase SMTP only if Resend's free tier is exhausted. |
| Simple `missions` table + `mission_drafts` table | LangGraph state machines | LangGraph adds significant complexity and a new dependency. PROJECT.md explicitly defers this to v2. The table pattern is sufficient for v1.2's fire-and-forget missions. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `Inngest` / `QStash` / `BullMQ` | Full job queue infrastructure is premature for v1.2 mission volume (< 100 missions/day per user). Adds dependencies, cost, and debugging surface. | `after()` + `missions` table as queue |
| `LangGraph` | PROJECT.md explicitly defers state machine frameworks to v2. Adds a major dependency with significant learning curve. | Simple `missions` table with `status` enum + `after()` executor |
| `@vercel/functions waitUntil()` | Deprecated in favor of `after()` for Next.js ≥15.1. Vercel's official docs say to use `after()` instead. | `import { after } from 'next/server'` |
| `tailwindcss-animate` | Already documented in v1.1 research — incompatible with Tailwind v4. | `tw-animate-css` (already installed) |
| Google Places API (Old) via `@googlemaps/google-maps-services-js` | Old API lacks `neighborhoodSummary`, `generativeSummary`, and AI area summaries added in 2025. Less structured responses. | `@googlemaps/places` v2.x (Places API New) |
| SSE (`ReadableStream` in route handler) | Adds ~80 lines of boilerplate for mission status updates that Supabase Realtime handles natively. Vercel serverless functions terminate, making SSE unreliable for long-running missions. | Supabase Realtime `postgres_changes` |
| Persistent WebSockets (e.g., `ws`, Pusher) | Vercel serverless functions don't support persistent WebSocket connections without Vercel Pro Edge + custom infra. | Supabase Realtime (already provisioned, handles WebSocket lifecycle) |

---

## Stack Patterns by Variant

**For the mission executor route handler:**
- Create mission row → return 202 → call `after()` with the executor logic.
- Set `export const maxDuration = 60` in the route file for Hobby plan (60s limit). Fluid Compute extends to 300s if needed.
- The executor writes status updates (`running → waiting_approval → completed`) back to the `missions` table as it progresses — Realtime pushes these to the client automatically.

**For the `get_neighborhood_info` tool replacement:**
- Fetch from Google Places API (New) using the listing's PostGIS coordinates (already stored as `location GEOMETRY`).
- Use `fields: ['displayName', 'neighborhoodSummary', 'generativeSummary', 'nearbyPlaces']`.
- Cache the result on the listing row (add a `neighborhood_cache JSONB` column) with a 7-day TTL to avoid repeated API calls.

**For HITL draft approval flow:**
- Mission reaches `waiting_approval` status.
- `mission_drafts` table stores draft content with `version`, `mission_id`, `content JSONB`, `created_at`, `approved_at`.
- Client Concierge UI shows a `draft_ready` action card — user clicks Approve/Edit/Reject.
- PATCH `/api/missions/[id]/drafts/[draftId]/approve` updates `approved_at`, transitions mission to next status.
- Optional: send an email notification via Resend when draft is ready.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `after()` from `next/server` | Next.js 15.1+ | Stable as of v15.1.0 (confirmed in Next.js changelog). This project uses `next: ^15.1.0` — compatible. |
| `@supabase/supabase-js` ^2.47.0 | Realtime `postgres_changes` filter syntax | `filter: 'user_id=eq.{value}'` syntax is current. RLS enforcement on Realtime requires Realtime to be enabled for the `missions` table in Supabase dashboard. |
| `@googlemaps/places` ^2.3.0 | Node.js 18+ | Follows Node.js LTS release schedule. Compatible with Vercel's Node.js 20 runtime. Requires Google Maps Platform API key with Places API (New) enabled. |
| `@tavily/core` ^0.7.2 | Already installed | `.extract()` method available since ^0.6.x. Existing `TAVILY_API_KEY` env var is reused. |
| `resend` ^4.x | Next.js 15, React 19 | No peer dep conflicts. Use from Route Handlers (server-side only). Never import in Client Components. |

---

## New Environment Variables Required

| Variable | Source | Purpose |
|----------|--------|---------|
| `GOOGLE_PLACES_API_KEY` | Google Maps Platform Console | `@googlemaps/places` client authentication for neighborhood info |
| `RESEND_API_KEY` | Resend Dashboard | Transactional email for HITL draft notifications (conditional) |

Existing variables reused: `TAVILY_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`.

---

## Sources

- [Next.js `after()` docs](https://nextjs.org/docs/app/api-reference/functions/after) — confirmed stable in v15.1.0, Route Handler support, maxDuration interaction — HIGH confidence
- [Vercel `@vercel/functions` reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package) — confirmed `after()` is the recommended replacement for `waitUntil()` in Next.js ≥15.1 — HIGH confidence
- [Vercel function duration limits](https://vercel.com/docs/functions/limitations) — 60s Hobby plan, 300s Fluid Compute Hobby — HIGH confidence
- [Supabase Realtime Postgres Changes docs](https://supabase.com/docs/guides/realtime/postgres-changes) — `postgres_changes` filter syntax, RLS enforcement behavior — HIGH confidence
- [Supabase Realtime with Next.js guide](https://supabase.com/docs/guides/realtime/realtime-with-nextjs) — channel subscription and unsubscription pattern — HIGH confidence
- [Supabase Realtime RLS announcement](https://supabase.com/blog/realtime-row-level-security-in-postgresql) — confirmed RLS applies to Realtime broadcasts — HIGH confidence
- [`@googlemaps/places` npm](https://www.npmjs.com/package/@googlemaps/places) — v2.3.0 current, Places API (New) client — HIGH confidence
- [Google Places API AI summaries](https://developers.google.com/maps/documentation/places/web-service/area-summaries) — `neighborhoodSummary`, `generativeSummary` fields — HIGH confidence
- [Tavily Extract docs](https://docs.tavily.com/documentation/api-reference/endpoint/extract) — extract endpoint for structured web content from URLs — MEDIUM confidence (WebSearch)
- [Resend Node.js docs](https://resend.com/docs/send-with-nodejs) — npm package, free tier, React Email integration — MEDIUM confidence (WebSearch)

---

*Stack research for: CampusNest v1.2 Native Agent Backend*
*Researched: 2026-03-10*
