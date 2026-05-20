# Runtime Architecture Improvement Plan

Last updated: 2026-04-22

## 1. Aim

We want to compare the current CampusNest runtime architecture against a more mature microservices-style AI platform, using Synapse AI as a reference point, and identify the practical upgrades that would improve reliability, latency, observability, and long-running AI workflows.

The goal is not to copy Synapse AI's full architecture. Its README describes a 7-service system with an API gateway, Redis, Azure Service Bus, centralized logging, distributed request tracing, circuit breakers, Socket.IO, CDC, event sourcing, and a dedicated AI/RAG service. Those are strong patterns, but adopting all of them immediately would over-engineer CampusNest and slow down product iteration.

Our near-term target should be:

- keep the product as a modular monolith on Next.js + Supabase
- add Redis/Valkey only where it reduces latency or protects infrastructure
- make mission execution durable and observable
- add request tracing and structured logs before adding a separate log service
- move slow work out of user-facing requests
- defer true microservice splitting until traffic, team size, or deployment constraints justify it

## 2. How We Can Do This

### Phase 1 — Add Observability First

Before splitting services or adding more infrastructure, make the current runtime measurable.

- Add a `requestId`/`traceId` to every chat request, tool call, mission row, worker tick, external provider call, and log line.
- Return the `requestId` in API responses and SSE metadata.
- Persist key mission execution events:
  - mission queued
  - mission claimed
  - step started
  - step completed
  - retry scheduled
  - mission failed
  - mission completed
- Log latency buckets for:
  - chat first token
  - deterministic runtime decision
  - Supabase reads/writes
  - Gemini calls
  - listing search
  - viewport fetches
  - mission step duration

Pushback: do not build a separate Log Server yet. Structured logs plus trace IDs are enough until we have production traffic showing that log search/debugging is painful.

### Phase 2 — Add Redis/Valkey For High-ROI Paths

Use Redis as a narrow acceleration layer, not a new source of truth.

Good Redis candidates:

- `/api/explore/viewport` cache keyed by rounded bounds + filters, TTL 30-120 seconds
- public listing detail cache, TTL 5-15 minutes, invalidated on listing update
- repeated AI search result cache for normalized queries, TTL 5-30 minutes
- per-user/per-IP rate limit buckets
- idempotency locks for mission creation and approval
- short-lived active conversation cache during a streaming chat turn

Do not put durable user state only in Redis. `conversation_state`, missions, listings, and messages should remain in Supabase/Postgres as source of truth.

Pushback: Redis is worth adding only if we keep the integration small. A broad Redis abstraction across the whole app would add complexity without immediate payoff.

### Phase 3 — Make Workers The Real Background Runtime

The runtime rebuild already moves missions toward queued execution. Finish that path before considering a message broker.

- Apply migrations `032_conversation_state.sql` and `033_mission_runtime_queue.sql`.
- Run one worker host that drains queued missions.
- Keep lease, heartbeat, retry, and step-attempt behavior in Postgres.
- Add operational dashboards or SQL views for:
  - queued missions
  - running missions
  - retrying missions
  - failed missions
  - slow mission steps
- Keep GitHub Actions as a stopgap only.
- Use Oracle VM or another cheap persistent worker host once capacity exists.

Pushback: do not add Azure Service Bus, Kafka, RabbitMQ, or a full queue service yet. Supabase queue tables plus a worker are enough until mission volume or fan-out patterns prove otherwise.

### Phase 4 — Add Circuit Breakers And Timeout Budgets

Prevent slow providers from making the whole app feel broken.

- Add timeout budgets around:
  - Gemini
  - Google Places
  - Resend
  - scraper/network calls
  - any future external listing provider
- Add simple circuit breaker states per provider:
  - closed: normal
  - open: fail fast after repeated failures
  - half-open: test recovery with limited traffic
- Return degraded but useful UI states instead of hanging:
  - show cached listings if search is slow
  - show partial AI response if enrichment fails
  - mark mission step retrying if provider is temporarily unavailable

Pushback: implement this as small provider wrappers first. Do not introduce a heavyweight service mesh or proxy layer.

### Phase 5 — Event Model Before Message Bus

Define the product events now, but keep delivery simple.

Useful events:

- `conversation.state_updated`
- `mission.created`
- `mission.claimed`
- `mission.step_completed`
- `mission.completed`
- `listing.created`
- `listing.updated`
- `tour.requested`
- `search.performed`

Initially these can be database rows, structured logs, or lightweight internal emits. If we later need multiple independent subscribers, we can move the same event contracts to a broker.

Pushback: event contracts are valuable now; event infrastructure is not urgent yet.

### Phase 6 — Consider Service Extraction Only When It Hurts

The likely first service to extract is not auth or listings. It is the worker/AI runtime.

Possible future services:

- `ai-runtime-service`: deterministic chat runtime, model fallback, tool orchestration
- `mission-worker-service`: long-running mission execution
- `search-service`: listing search, embeddings, ranking, map payloads
- `ops-service`: trace lookup, logs, health dashboard

Extraction triggers:

- Vercel/serverless limits block a runtime path
- worker traffic needs independent scaling
- AI/tool code deploys need to be isolated from frontend deploys
- debugging requires service-level isolation
- multiple clients need the same backend API outside the Next.js app

Until then, keep the code modular inside the monorepo.

## Recommended Target Architecture

```text
Browser
  │
  ▼
Next.js Web App / Vercel
  │
  ├─ UI: Explore, Listings, Chat, Missions
  ├─ API Gateway-lite: auth, validation, rate limit, trace ID
  └─ SSE/Realtime updates
       │
       ├──────────────┬───────────────────┬─────────────────┐
       ▼              ▼                   ▼                 ▼
Supabase DB       Redis/Valkey        AI Runtime        Worker Runtime
Postgres          hot cache           deterministic     mission queue
PostGIS           rate limits         chat tools        leases/retries
pgvector          idempotency         Gemini fallback   background jobs
Auth              pub/sub optional    typed blocks      provider calls
Realtime
```

## Definition Of Done For This Upgrade Track

- Chat/search/listing/tour flows have trace IDs visible in logs.
- `conversation_state` remains the durable source of truth.
- Mission queue runs on a persistent worker host or intentional stopgap.
- Redis is used for narrow latency/rate-limit/idempotency paths only.
- Explore viewport and listing detail endpoints have measurable cache hit rates.
- External provider failures degrade gracefully instead of stalling UX.
- Architecture remains modular enough to extract services later without forcing a rewrite now.
