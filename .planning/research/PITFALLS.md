# Pitfalls Research

**Domain:** Native agent backend — mission executor, HITL draft approval, Realtime status, steering bar intent parsing, real tool integrations — added to existing Next.js 15 + Supabase + Gemini app (CampusNest v1.2)
**Researched:** 2026-03-10
**Confidence:** HIGH (Supabase limits verified against official docs; Gemini issues verified against official GitHub/forum; HITL and agent patterns cross-referenced across multiple 2025-2026 sources)

---

## Critical Pitfalls

### Pitfall 1: Edge Function Wall Clock Limit Kills Long-Running Mission Steps

**What goes wrong:**
A mission step (e.g. search → shortlist → PM contact draft) takes longer than 150 seconds on the free tier. The Edge Function hits the wall clock limit and is forcibly terminated mid-execution. The mission row in the DB is left in `running` status permanently because the shutdown handler never fires (or fires too late). The Concierge UI shows an endlessly spinning mission that the user cannot cancel — the backend died silently.

**Why it happens:**
Supabase Edge Functions have a hard wall clock limit of 150 seconds on the free tier (400 seconds on paid). The agent loop calls Gemini (400–2000ms per turn), then calls external APIs (reviews, neighborhood data, PM contact lookup), then writes results to the DB. Multi-step missions that chain 3–5 of these operations can easily exceed 2 minutes on slow external API responses. Developers test with fast local mocks that return in <100ms and never observe the timeout in dev.

**How to avoid:**
- Design each mission step as a single Edge Function invocation targeting <60 seconds (leaving generous headroom below the 150s limit).
- Split multi-step missions into discrete steps stored as rows in a `mission_steps` table. Each step is dispatched separately via pgmq or a `pg_cron` + Edge Function worker pattern.
- Use `EdgeRuntime.waitUntil()` to ensure DB writes complete even if the response is sent early, but do not rely on this for the full mission — it does not extend the wall clock.
- Add a `beforeunload` handler inside the Edge Function to set the mission step status to `failed` with a reason of `timeout` when the runtime signals shutdown.
- Upgrade to Pro ($25/month) to get 400s wall clock if multi-step missions need to run in a single invocation.

**Warning signs:**
- Mission rows stuck in `running` for more than 5 minutes with no `updated_at` change
- No `failed` or `timeout` terminal states ever appearing in the missions table during testing
- External API calls made without `AbortController` timeouts
- Edge Function invocations visible in Supabase logs with status `wall-clock limit reached`

**Phase to address:**
Phase 1 (Mission DB Schema + Executor Architecture) — step decomposition must be a schema-level decision before any executor code is written.

---

### Pitfall 2: Fire-and-Forget Pattern Loses Missions Silently on Edge Function Cold Start Failure

**What goes wrong:**
The API route returns `202 Accepted` to the client immediately and calls `EdgeRuntime.waitUntil(runMission(missionId))`. If the Edge Function cold-starts slowly and the runtime decides to terminate the worker before `waitUntil` registers (a known edge case in Deno Deploy / Supabase Edge runtimes), the background promise is dropped entirely. The mission was accepted, the user sees "Starting..." in the UI, but no executor ever runs. The mission sits in `pending` forever.

**Why it happens:**
`EdgeRuntime.waitUntil()` assumes the Edge Function worker is already alive and executing. On cold starts, the request/response cycle can complete before the background promise is scheduled. Supabase's documentation explicitly notes: "When testing locally, instances terminate automatically after request completion, preventing background tasks from finishing." This also happens in production under low-traffic conditions that cause cold starts.

**How to avoid:**
- Use the pgmq message queue (Supabase's built-in `pgmq` extension) instead of pure fire-and-forget. On mission creation: insert the mission row + enqueue a message to the queue in the same DB transaction. A separate Edge Function worker triggered by pg_cron (or a long-polling consumer) dequeues and executes missions. The queue provides durability — if the consumer crashes, the message is redelivered.
- If staying with `waitUntil`, add a pg_cron job that runs every 2 minutes and looks for missions in `pending` status with `created_at` older than 3 minutes, then re-enqueues them. This is a recovery net, not the primary execution path.
- Never set mission status to `running` before the executor actually starts processing. Set it inside the executor, not in the HTTP route.

**Warning signs:**
- Missions visible with `status = 'pending'` and `created_at` > 5 minutes old
- Edge Function logs showing requests that return 202 with no subsequent background execution log entry
- Local dev testing shows background tasks not completing (this is expected locally — must test with `per_worker` policy in config.toml)

**Phase to address:**
Phase 1 (Mission DB Schema + Executor Architecture) — queue vs. waitUntil decision must be made before Phase 1 ends.

---

### Pitfall 3: Gemini 2.5 Flash Cannot Mix Function Calling and `responseSchema` in the Same Request

**What goes wrong:**
The steering bar intent parsing uses Gemini function calling to classify user input (e.g. `classify_intent` tool). Separately, the mission executor uses structured JSON output (`responseSchema`) to get shortlist results in a typed format. A developer attempts to combine both in a single Gemini call — using `tools` for function calling AND `generationConfig.responseSchema` for typed output. Gemini 2.5 Flash returns a 400 error or silently ignores the schema.

**Why it happens:**
This is a confirmed Gemini 2.5 Flash limitation as of late 2025: "Function calling with a response mime type of 'application/json' is unsupported in Gemini 2.5 models." When tool call messages are present in the conversation history, structured output mode fails entirely. The 2.0 models do not have this restriction, but 2.5 does. Developers who tested with 2.0 are caught off-guard when they switch to 2.5 Flash for its improved reasoning.

**How to avoid:**
- For steering bar intent parsing: use function calling exclusively. Define a `classify_intent` function with an enum parameter. Do not set `responseSchema`. Parse the function call arguments for the intent classification.
- For mission executor structured output (shortlist, draft email body): use `responseSchema` exclusively, no tools. Split the call if you need both classification and structured output — first classify via function call, then use the classification result as input to a structured output call.
- In the mission executor, separate the "reasoning" turns (which may use tools) from the "output" turns (which produce structured JSON). Never attempt both in the same turn.
- Pin Gemini model versions (e.g. `gemini-2.5-flash-latest`) but also test against explicit version strings to catch regression when Google updates the model.

**Warning signs:**
- Gemini API returning 400 `InvalidArgument` with messages mentioning `response_mime_type` and `tools`
- Steering bar intent calls returning raw JSON text instead of a function call
- Inconsistent behavior between staging (using 2.0) and production (using 2.5)

**Phase to address:**
Phase 2 (Steering Bar Intent Parsing) and Phase 3 (Mission Executor Loop) — the separation pattern must be established in the first Gemini call that uses either feature.

---

### Pitfall 4: Gemini Agentic Loop Enters Infinite Tool Call Cycle

**What goes wrong:**
The mission executor's agentic loop calls Gemini, receives a function call, executes the tool, feeds results back, and repeats. Under certain input conditions (e.g. a listing search that returns 0 results, or a tool that returns a partial error), Gemini 2.5 Flash enters a cycle where it calls the same tool repeatedly with marginally different parameters, never progressing to a final answer. The loop runs until the Edge Function's wall clock limit is hit, consuming credits for dozens of Gemini API calls and external API calls per mission.

**Why it happens:**
Gemini's built-in loop detection (comparing last 3 outputs) catches exact repetitions but not near-repetitions. A tool that returns "no results found" on every call triggers the model to try different search parameters indefinitely — each call is different enough to bypass detection. The existing CribAI implementation caps at 5 tool calls per turn (from Phase 6 v1.0 docs), but the mission executor's multi-turn loop across `waitUntil` calls may not inherit this cap.

**How to avoid:**
- Implement a hard turn counter on the mission executor loop. Cap at 8 total Gemini API calls per mission (not per turn). Store the call count in the mission row and check it at the start of each loop iteration.
- Tools that can return empty results must return a clearly terminal signal: `{ status: "no_results", suggestion: "broaden_criteria" }` rather than `{ results: [] }`. This tells the model to stop retrying rather than continue searching.
- Implement a staleness check: if two consecutive tool calls have identical parameters, immediately exit the loop with a `max_retries_exceeded` status.
- Log every Gemini call (model, input token count, output token count, tool called) in a `mission_logs` table. This is essential for debugging infinite loops and cost tracking.
- Set `AbortController` timeout on every Gemini API call (30 seconds recommended) so a slow API response cannot consume the entire wall clock budget.

**Warning signs:**
- Supabase Edge Function logs showing the same external API called 5+ times in a single mission execution
- Mission costs (if tracked) far exceeding expected per-mission budget
- Gemini API forum issues: "Gemini 2.5 Flash stuck in tool call loop when using tools and structured output" (confirmed bug pattern as of 2025)

**Phase to address:**
Phase 3 (Mission Executor Agentic Loop) — the turn counter and terminal tool response format must be part of the initial implementation, not added after observing the problem.

---

### Pitfall 5: Supabase Realtime 200-Connection Free Tier Limit Blocks During Mission Execution

**What goes wrong:**
The Concierge UI opens a Supabase Realtime channel subscription to receive live mission status updates. During a busy period (or load testing), the project hits the 200 concurrent connection limit on the free tier. New channel joins are silently rejected — the UI shows no error, just no updates. Users think their missions are running normally but receive no status events. The fallback polling (if any exists) is the only thing keeping the UI alive.

**Why it happens:**
Supabase Realtime free tier limits: 200 concurrent connections, 100 messages/second, 20 presence messages/second. A web app where multiple browser tabs are open (each opening its own Realtime connection) can hit this limit with fewer than 200 active users. The client SDK does not surface a clear error when the connection limit is reached — it may silently fail or retry indefinitely.

**How to avoid:**
- Each user should have exactly one Realtime channel subscription for mission updates (not one per mission card). Use a single channel scoped to `missions:user_id=eq.${userId}` that receives updates for all of that user's missions.
- Implement a polling fallback: if the Realtime channel has not received an event in 30 seconds, fall back to polling the missions table every 5 seconds. Resume Realtime when the channel reconnects.
- Keep mission status payload small (< 256KB, which is the free tier broadcast limit). Only send `{ mission_id, status, last_action, updated_at }` — do not embed full mission data in the Realtime payload.
- For v1.2, the concurrent connection limit (200) is unlikely to be hit in early usage. Design for the limit from the start (one channel per user, not per mission), but do not prematurely optimize for 10K users.

**Warning signs:**
- `supabase.channel()` calls inside a per-mission component (not a per-user root component)
- No reconnection or fallback logic for when `channel.on('status', ...)` fires with `CLOSED` or `CHANNEL_ERROR`
- Zero Realtime events received in the UI despite missions changing state in the DB (silent failure)

**Phase to address:**
Phase 4 (Realtime Status Updates) — channel architecture must be decided before the first subscription is written.

---

### Pitfall 6: Realtime Postgres Changes RLS Bypass Exposes Mission Data Across Users

**What goes wrong:**
The Realtime Postgres Changes subscription listens for `UPDATE` events on the `missions` table. RLS is enabled on the table with a policy `user_id = auth.uid()`. The developer assumes Realtime respects this RLS policy and all users only receive their own mission updates. In fact, Realtime Postgres Changes operate under a separate authorization system from Realtime Channel authorization — and without explicit Realtime authorization configuration, all subscribers on the same channel can receive all changes, ignoring row-level RLS.

**Why it happens:**
Supabase's own documentation states: "Realtime Postgres Changes are separate from Channel authorization, and the private Channel option does not apply to Postgres Changes." Realtime uses its own JWT-based authorization for channels, and Postgres Changes additionally require the table to have Realtime enabled AND the subscription filter to be evaluated against the authenticated user context. Developers who are familiar with RLS for REST API calls assume it automatically applies to Realtime — it does not in the same way.

**How to avoid:**
- Subscribe to a filtered Realtime channel: `channel.on('postgres_changes', { event: '*', schema: 'public', table: 'missions', filter: \`user_id=eq.${userId}\` }, handler)`. The filter is applied server-side.
- Additionally, configure Realtime authorization in Supabase: the channel must be created with `{ config: { private: true } }` and the JWT must be passed so Supabase validates the subscription against the RLS policy.
- Test cross-user isolation explicitly in integration tests: create two users, start a mission for each, verify user A's Realtime subscription does not receive user B's mission updates.
- Do not embed sensitive data (PM contact info, email drafts) in the Realtime payload. Use the Realtime event as a trigger to fetch fresh data from the REST API, which does enforce RLS correctly.

**Warning signs:**
- Realtime channel subscriptions with no `filter` parameter on the `missions` table
- No integration test for cross-user Realtime isolation
- Channel opened with `supabase.channel('missions')` (global channel) instead of `supabase.channel(\`missions:${userId}\`)`

**Phase to address:**
Phase 4 (Realtime Status Updates) — test cross-user isolation before shipping, not after.

---

### Pitfall 7: HITL Stale Draft Approval Executes on Wrong Parameters

**What goes wrong:**
The agent generates a PM contact email draft (Draft v1: "2BR at Oak Street, $1200/mo"). The user does not immediately approve. The agent refines the mission criteria and regenerates a draft (Draft v2: "2BR at Elm Street, $1100/mo"). The user returns, sees a draft card (now showing v2 in the DB), but their browser tab still shows v1 (cached). They approve the draft shown in their tab. The server applies the approval but the draft version has already advanced — or worse, the server accepts a stale approval because there is no versioning check, and sends the wrong email to the PM.

**Why it happens:**
The HITL draft approval pattern requires explicit draft versioning to be safe. Without a `draft_version` integer on the draft record, there is no way to detect that the user is approving something the agent has since superseded. This was flagged in v1.1 research as a critical pitfall and applies here with even higher stakes because v1.2 drafts trigger real external actions (PM contact emails), not just mission state changes.

**How to avoid:**
- Every draft row must have a `draft_version` integer (auto-incrementing per `mission_id`) and an `is_current` boolean. When the agent produces a new draft, it sets the previous draft's `is_current = false` and inserts the new draft with `is_current = true`.
- The approval API endpoint validates: `WHERE draft_id = $1 AND draft_version = $2 AND is_current = true`. If this check fails, return `409 Conflict` with `{ error: "newer_draft_available", latest_version: N }`.
- The UI must display the draft's `generated_at` timestamp: "Draft generated 3 minutes ago." If the user returns to an approval card and the `is_current` flag is false, the card must show "This draft has been superseded" and display the current draft.
- Disable the Approve button immediately on first click. Use `useTransition` (React 19) to track in-flight state and prevent double-submission.

**Warning signs:**
- `missions_drafts` table has no `draft_version` or `is_current` column
- Approval API does not query `is_current = true`
- No `409` response handling in the approval UI component
- Approve button remains enabled after click

**Phase to address:**
Phase 1 (Mission DB Schema) — versioning columns must be in the initial schema migration, not added later.

---

### Pitfall 8: PM Contact Tool Hits ToS and Anti-Scraping Barriers

**What goes wrong:**
The PM contact tool scrapes landlord phone numbers or email addresses from Apartments.com or Zillow listing pages to send contact drafts. The scraper is blocked after 50–200 requests via CAPTCHA, IP rate limiting, or User-Agent detection. Zillow's ToS explicitly prohibits scraping. The feature breaks in production and the team is forced to either buy a data API ($229+/month for Yelp, or $0.10+/call for ATTOM) or replace the feature entirely.

**Why it happens:**
The real estate platforms (Apartments.com, Zillow, Craigslist) that CampusNest already scrapes for listing data do not expose landlord contact info through structured APIs. The contact info is embedded in the listing HTML. Developers assume that since they already scrape listing data, scraping contact info is the same operation — but contact info is more aggressively protected and its scraping is explicitly prohibited in most ToS agreements.

**How to avoid:**
- Use only contact info that users or landlords have explicitly submitted through CampusNest's own manual listing submission form. This is the safest and most legally defensible source.
- For listings without CampusNest-submitted contact info, the PM contact tool should generate a template for the user to send manually (copy-to-clipboard + deep link to the listing's native contact form), rather than sending on their behalf.
- Do not attempt to scrape contact info from third-party listing sites in v1.2. Flag this as a "Phase N with business model validation" feature that requires either a partner data API or landlord opt-in.
- If a paid API is acceptable, evaluate Estated ($0.10/call for property data including owner info) — it has explicit data licensing and is ToS-compliant.

**Warning signs:**
- `get_pm_contact` tool implementation that calls `fetch()` against Apartments.com or Zillow URLs
- Crawlee/Playwright code in the PM contact tool (scraping) rather than a structured data API call
- No fallback UI when contact info is unavailable for a listing

**Phase to address:**
Phase 5 (Real Tool Integrations) — define the PM contact strategy before writing any tool code. This decision determines whether the feature ships as full automation or assisted automation.

---

### Pitfall 9: Reviews and Neighborhood Data APIs Have Hidden Costs and Caching Restrictions

**What goes wrong:**
The `get_reviews` tool calls Yelp API or Google Places for each listing the agent evaluates. A mission that shortlists 10 listings makes 10 review API calls. At Yelp's $9.99/1000 calls rate, this is ~$0.10 per mission. Over 500 missions per month (modest scale), this is $50/month on reviews alone. Additionally, Yelp's ToS restricts caching to 24 hours maximum — the team builds a longer-duration cache thinking it saves costs, which violates the ToS and risks API key revocation.

**Why it happens:**
Developers evaluate API costs per-call without projecting to per-mission and per-month costs at realistic usage. Caching policies (Yelp: 24h max, Google Places: "no caching except for specific exceptions") are in the ToS fine print, not in the API pricing page. The team discovers the caching restriction only when they receive a ToS violation notice.

**How to avoid:**
- For the `get_reviews` tool in v1.2: use Tavily web search (already integrated, session cache implemented) to retrieve recent review content rather than a dedicated reviews API. Tavily's search-based approach avoids per-review API fees and does not have review caching ToS restrictions.
- For Google Places reviews: use field masks to request only `reviews` and `rating` (the Basic tier SKU, billed at $0.017/call). Cache results in the `listings` table for 24 hours with a `reviews_cached_at` timestamp. Never exceed 24 hours per Google's ToS.
- For Walk Score / neighborhood data: Walk Score API offers 5,000 free calls/day. Cache results in the `listings` table with `walk_score_cached_at` — neighborhood walkability does not change frequently so a 7-day cache is reasonable (Walk Score ToS allows caching for up to 1 year for non-display purposes).
- Build a `listings_enrichment` table to store all third-party data (reviews, scores, neighborhood data) with per-source `cached_at` timestamps and TTLs enforced by the query layer.

**Warning signs:**
- Review API calls made on-the-fly for every mission without a caching layer
- `reviews_cached_at` column not present in the listings or enrichment table
- Google Places API calls using the `BASIC` or `PREFERRED` SKU (expensive) instead of targeted field masks
- No cost tracking for third-party API calls per mission

**Phase to address:**
Phase 5 (Real Tool Integrations) — caching strategy and cost model must be designed before any external API integration is implemented.

---

### Pitfall 10: pg_cron Job Bloat Causes Silent Failures on Free Tier

**What goes wrong:**
Two pg_cron jobs are planned for v1.2: (1) expire HITL drafts past `expires_at`, and (2) recover `pending` missions stuck without an executor. Both run frequently (every 5 minutes). After accumulating several thousand runs, the `cron.job_run_details` table grows to hundreds of megabytes. On the free tier (500MB DB storage total), this table consumes a significant share of the storage budget. Eventually, pg_cron jobs fail silently with no disk space errors, or the DB reaches its storage limit and the entire project is paused.

**Why it happens:**
pg_cron stores every job run in `cron.job_run_details` by default. High-frequency jobs that run every 5 minutes generate 288 rows per job per day. Two jobs running for 30 days = 17,280 rows. This is not a large number, but the associated text columns (status, return_message) can store verbose error messages that inflate the table. The free tier's 500MB constraint is tight when combined with the listings corpus and migrations. Community reports confirm complete cron job failure from table bloat on the free tier.

**How to avoid:**
- Add a third pg_cron job that runs daily to truncate `cron.job_run_details` older than 7 days: `DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'`.
- Run cron cleanup jobs every 15 minutes minimum (not every 1–2 minutes) to reduce log accumulation. Mission expiry checks every 15 minutes is acceptable — expired drafts are non-urgent.
- Monitor DB storage usage in Supabase dashboard weekly. Set up an alert (Supabase monitoring or a simple Edge Function health check) that warns when storage exceeds 80% of the free tier limit.
- Consider moving to Supabase Pro ($25/month) before launching the mission executor to get 8GB storage and remove the 500MB constraint.

**Warning signs:**
- pg_cron jobs scheduled at 1–5 minute intervals
- No `cron.job_run_details` cleanup job in the migration
- DB storage usage above 300MB on the free tier (leaves little headroom)
- cron jobs that were running stop running with no obvious error in the function logs

**Phase to address:**
Phase 1 (Mission DB Schema) — include the cron cleanup migration as part of the initial schema setup.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using `EdgeRuntime.waitUntil` for multi-step missions instead of a queue | No new infrastructure | Missions lost on cold start, no retry, no durability | Only for single-step lightweight operations (<30s) |
| Skipping `draft_version` on HITL drafts | Saves one integer column | Stale approvals trigger wrong real-world actions (PM emails) silently | Never — one column prevents a class of irreversible bugs |
| Making review/neighborhood API calls per-request without caching | Simplest code | Unexpected monthly API costs at scale; ToS violation risk if cache TTL is ignored | Never — cache layer must be in place before real API keys are used |
| Polling mission status at 2-second intervals instead of Realtime | No WebSocket complexity | Exhausts Supabase connection pool under concurrent users | Only as a short-term fallback when Realtime is unavailable |
| Scraping PM contact info from listing sites | Feature works for demo | ToS violation, IP ban, broken feature in production | Never — use only user-submitted contact info or a licensed data API |
| Logging raw user steering commands without truncation | Easy to debug | PII exposure risk (users may type personal info in the steering bar) | Never — truncate/redact steering bar input in logs to 200 chars |

---

## Integration Gotchas

Common mistakes when connecting to external services in v1.2.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Gemini 2.5 Flash + function calling | Using `responseSchema` and `tools` in the same request | Separate calls: function calling for intent/classification turns, responseSchema for structured output turns — never combine |
| Gemini agentic loop | No hard cap on total loop iterations | Enforce a `max_turns = 8` counter stored in the mission row; check at loop entry |
| Supabase Realtime Postgres Changes | Assuming table-level RLS automatically scopes Realtime events | Add `filter: \`user_id=eq.${userId}\`` to the subscription AND configure Realtime authorization with private channels |
| Yelp API / Google Places reviews | Caching results for >24 hours to save costs | Cache for exactly 24 hours (Yelp ToS max); use Tavily as a review data alternative that has no caching ToS |
| Walk Score API | Making per-request calls during mission execution | Eagerly cache scores in `listings_enrichment` table; refresh at 7-day TTL since walkability rarely changes |
| PM contact from listing scrapers | Scraping contact fields from Apartments.com / Zillow | Use only CampusNest-submitted contact info; generate a template + deep link for listings without it |
| pgmq / pg_cron | Not cleaning `cron.job_run_details` table | Add a daily cleanup cron job in the initial schema migration |
| Supabase Edge Function background tasks | Local dev tests passing but production missions not running | Set `[edge_runtime] policy = "per_worker"` in `supabase/config.toml` for local testing of background tasks |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| One Realtime channel per mission card component | Supabase hits 200 concurrent connection limit with ~20 active users (10 tabs × 2 missions) | One channel per user, filtered by `user_id` | As few as 20 concurrent users with multiple open tabs |
| Fetching all mission history on Concierge page mount | Page load slow; DB query scans all historical missions | Paginate: fetch last 10 missions on mount, lazy-load older via "Load more" | >30 missions per user |
| Inline Gemini calls from Next.js API routes (not Edge Functions) | Route timeout at Vercel's 10-second default (25s on Pro) before Gemini responds for complex missions | Move mission execution to Supabase Edge Functions (150–400s limit) or use background tasks | Any mission step taking >10s on Vercel Hobby/Pro API routes |
| Blocking UI while steering bar awaits Gemini intent classification | Steering bar feels unresponsive; user submits command again | Show optimistic acknowledgement immediately ("Got it, processing..."); run Gemini call async | Every user — latency is always noticeable without optimistic UI |
| Fetching PM reviews fresh on every mission step evaluation | Gemini tool calls stack up; single mission makes 10 external API calls | Pre-fetch and cache enrichment data for all shortlisted listings before entering the agentic evaluation loop | Any mission shortlisting >3 listings |

---

## Security Mistakes

Domain-specific to the mission executor and real tool integrations.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Mission executor uses `service_role` key without scoping DB writes to the session user | Any mission can write to any user's data; privilege escalation if Edge Function is compromised | Use the session user's JWT for all mission DB operations; only use service role for background tasks that have a verified `mission_id → user_id` lookup |
| Steering bar sends raw freetext to Gemini without sanitisation | Prompt injection — user crafts input that changes agent behavior, leaks system prompt, or triggers unintended tool calls | Parse intent on the server with a strict JSON schema response; never pass raw user strings into the agent system prompt |
| HITL approval endpoint accessible without auth | Any unauthenticated request can approve any mission draft | Middleware must validate JWT before the approval handler runs; RLS on `mission_drafts` table enforces `user_id = auth.uid()` |
| PM contact email drafts logged in full to mission_logs | Logs contain PII (PM email addresses, property details); logs may be visible to support staff | Log only `{ draft_id, draft_version, generated_at }` in mission_logs; store draft content only in the `mission_drafts` table with RLS |
| Realtime channel opened before user auth is confirmed | Anonymous users can subscribe to mission updates channels; with a misconfigured filter, they could receive other users' updates | Only open the Realtime channel after `supabase.auth.getUser()` resolves with a valid session; assert `userId` is defined before channel creation |

---

## UX Pitfalls

Specific to adding HITL flows, Realtime status, and steering bar to the existing Concierge UI.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Binary Approve/Reject on HITL draft with no edit | Users who want to change one word must reject and re-run the entire mission | Show the draft in an editable textarea; allow light editing before approval; log edits as "user-modified" for quality tracking |
| No expiry countdown on HITL cards | Mission expires silently; user confused why their mission shows "Expired" | Show a countdown timer on every HITL approval card: "Auto-expires in 22h 15m" — update it live |
| Steering bar accepts any input silently (no `unknown_intent` feedback) | User types ambiguous command; nothing happens; user thinks the feature is broken | `unknown_intent` returns a visible clarification prompt inline: "Did you mean A or B?" with tap-to-select options |
| Mission status shows only top-level state ("Running") | User cannot tell if the agent is stuck or progressing | Show the last agent action as sub-status: "Running — Drafting email to Oak St landlord" — updated on every mission_log insert |
| Agent sends PM contact email without showing user what it sent | User is unaware of what communication was sent in their name | Always gate irreversible external actions (email sends, form submissions) behind HITL approval; display the sent content in the mission log |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Mission executor:** Step counter enforced (max_turns stored in DB); `beforeunload` handler sets failed status on timeout; wall clock budget tested with realistic external API latency
- [ ] **Fire-and-forget durability:** pgmq queue used (not pure waitUntil); recovery pg_cron job restarts stuck `pending` missions after 5 minutes; `running` missions without `updated_at` change for >5 minutes auto-expire
- [ ] **Gemini 2.5 Flash calls:** Function calling and responseSchema never combined in the same request; each turn is classified as a "tool turn" or "output turn" explicitly in code
- [ ] **HITL schema:** `draft_version` column present; `is_current` boolean present; `expires_at` column present; approval API validates all three; 409 response on stale approval handled in UI
- [ ] **Realtime subscriptions:** One channel per user (not per mission); `filter: user_id=eq.X` applied; cross-user isolation tested in integration tests; polling fallback implemented
- [ ] **Realtime RLS:** Private channel config enabled; JWT passed in channel creation; cross-user event leakage tested before shipping
- [ ] **PM contact tool:** No scraping from Apartments.com / Zillow; only CampusNest-submitted contact info used; graceful fallback UI when contact info unavailable
- [ ] **Review/neighborhood caching:** `listings_enrichment` table with per-source `cached_at` timestamps; Yelp TTL ≤24h enforced in query layer; Walk Score TTL ≤7 days
- [ ] **pg_cron cleanup:** `cron.job_run_details` cleanup job included in initial migration; cron intervals ≥15 minutes; DB storage monitored

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Missions stuck in `running` due to Edge Function timeout | MEDIUM | Write a migration that transitions all `running` missions with `updated_at` > 10 minutes to `failed`; add the wall-clock timeout handler; redeploy |
| Fire-and-forget missions silently dropped | MEDIUM | Implement pgmq queue; write a one-time script to re-enqueue all `pending` missions older than 10 minutes; re-run them |
| Gemini 2.5 Flash 400 errors from combined function+schema calls | LOW | Separate the Gemini call into two sequential calls; no DB migration needed; immediate fix |
| Realtime events leaking across users | HIGH | Immediately add filter parameter to all Realtime subscriptions; add RLS verification test; audit logs for any cross-user data exposure during the window of vulnerability |
| PM contact tool scraping blocked by Zillow | LOW | Replace with template + manual send flow; no data migration needed; feature scope reduction |
| Yelp API key revoked for caching ToS violation | MEDIUM | Replace Yelp with Tavily-based review search (already integrated); clear the reviews enrichment cache; update TTL logic |
| pg_cron jobs silently failing from job_run_details bloat | MEDIUM | Truncate `cron.job_run_details`; add cleanup job; reduce cron frequency; monitor storage |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Edge Function wall clock timeout kills missions (#1) | Phase 1: Mission DB Schema + Executor Architecture | Step decomposition in schema; single step < 60s in integration test |
| Fire-and-forget drops missions on cold start (#2) | Phase 1: Mission DB Schema + Executor Architecture | pgmq queue used; recovery cron job present; stuck pending missions test |
| Gemini 2.5 Flash function+schema conflict (#3) | Phase 2: Steering Bar + Phase 3: Executor Loop (first use) | No request uses both tools and responseSchema; verified with a targeted Gemini API test |
| Gemini agentic loop infinite cycle (#4) | Phase 3: Mission Executor Agentic Loop | max_turns counter enforced; zero-result tool response terminates loop; verified with stubbed no-result tool |
| Realtime 200-connection free tier limit (#5) | Phase 4: Realtime Status Updates | Single channel per user; Realtime architecture review before implementation |
| Realtime Postgres Changes RLS bypass (#6) | Phase 4: Realtime Status Updates | Cross-user isolation integration test required before phase completion |
| HITL stale draft approval (#7) | Phase 1: Mission DB Schema | `draft_version` and `is_current` in schema; approval API returns 409 on stale; UI handles 409 |
| PM contact tool ToS/scraping barrier (#8) | Phase 5: Real Tool Integrations | No scraping code in PM contact tool; fallback UI present for missing contact info |
| Review/neighborhood API cost + caching ToS (#9) | Phase 5: Real Tool Integrations | `listings_enrichment` table with TTL columns; cost projection reviewed before API keys activated |
| pg_cron job bloat on free tier (#10) | Phase 1: Mission DB Schema | Cleanup cron job in initial migration; cron interval ≥15 minutes; DB storage alert configured |

---

## Sources

- [Supabase Edge Functions Limits — official docs](https://supabase.com/docs/guides/functions/limits)
- [Supabase Edge Functions Background Tasks — official docs](https://supabase.com/docs/guides/functions/background-tasks)
- [Supabase Edge Functions Background Tasks + WebSockets announcement](https://supabase.com/blog/edge-functions-background-tasks-websockets)
- [Supabase Edge Function wall clock time limit troubleshooting](https://supabase.com/docs/guides/troubleshooting/edge-function-wall-clock-time-limit-reached-Nk38bW)
- [Supabase Realtime Limits — official docs](https://supabase.com/docs/guides/realtime/limits)
- [Supabase Realtime Authorization — official docs](https://supabase.com/docs/guides/realtime/authorization)
- [Supabase RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [Supabase pg_cron availability free tier — community discussion](https://github.com/orgs/supabase/discussions/37405)
- [Processing large jobs with Edge Functions, Cron, and Queues — Supabase blog](https://supabase.com/blog/processing-large-jobs-with-edge-functions)
- [Gemini 2.5 Flash stuck in tool call loop — official Google AI forum](https://discuss.ai.google.dev/t/gemini-2-5-flash-stuck-in-a-tool-call-loop-when-using-both-tools-and-structured-output/110777)
- [Gemini 2.5 inconsistent structured outputs vs 2.0 — googleapis/python-genai #706](https://github.com/googleapis/python-genai/issues/706)
- [Gemini 2.5 JSON structured output stopped working — Google AI forum](https://discuss.ai.google.dev/t/2-5-flash-stopped-delivering-true-json-structures/100175)
- [Gemini-cli infinite loop issues — google-gemini/gemini-cli #3928, #3958, #4829](https://github.com/google-gemini/gemini-cli/issues/3928)
- [Yelp API rate limits and plans — official docs](https://docs.developer.yelp.com/docs/places-rate-limiting)
- [Yelp API pricing plans](https://docs.developer.yelp.com/docs/plans)
- [Yelp API ToS transparency issues — TechCrunch](https://techcrunch.com/2024/08/02/yelps-lack-of-transparency-around-api-charges-angers-developers/)
- [Google Places API usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- [Walk Score API — official docs](https://www.walkscore.com/professional/api.php)
- [Is scraping Zillow legal — SoftwarePair](https://softwarepair.com/is-scraping-zillow-legal/)
- [Human-in-the-loop for AI agents best practices — permit.io](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo)
- [Designing for agentic AI: practical UX patterns — Smashing Magazine 2026](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/)
- [Building trust in agentic tools — GitLab blog](https://about.gitlab.com/blog/building-trust-in-agentic-tools-what-we-learned-from-our-users/)
- [HITL implementation with function tools — Medium](https://medium.com/@sainitesh/using-function-tools-with-human-in-the-loop-approvals-90b57b12f8d6)

---

*Pitfalls research for: CampusNest v1.2 — native agent backend (mission executor, HITL, Realtime, steering bar, real tool integrations)*
*Researched: 2026-03-10*
