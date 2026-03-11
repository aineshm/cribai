# Project Research Summary

**Project:** CampusNest v1.1 — UI/UX Design System Migration + AI Concierge Missions
**Domain:** AI-native student housing platform — design system upgrade + agentic task features
**Researched:** 2026-03-10
**Confidence:** HIGH

## Executive Summary

CampusNest v1.1 is a significant product upgrade built on top of a fully working v1.0. The v1.0 codebase (Next.js 15, Supabase, Gemini, Mapbox, CribAI with 11 tools) is complete and must not be rebuilt — only reskinned and extended. The work divides cleanly into two parallel tracks: (1) a design system migration that touches every page (Space Grotesk + DM Sans fonts, shadcn/ui primitives, Lucide icons, framer-motion), and (2) a new AI Concierge missions page that introduces agentic async tasks with human-in-the-loop approval gates. Both tracks require the design system foundation to land first — it is a hard prerequisite for all UI work.

The recommended approach is incremental and bottom-up: establish the CSS/token foundation and shadcn/ui primitives before touching a single page, then build pages from simplest (auth, landing) to most complex (explore split-view, concierge board). The AI Concierge feature requires a new `missions` + `mission_steps` DB schema, a mission executor in `packages/ai/`, Supabase Realtime subscriptions for live status updates, and a HITL approval flow with versioned drafts. Mission execution must run asynchronously (fire-and-forget from the API route) due to Vercel serverless timeout constraints. The floating CribAI panel on the explore page must live in the root layout, not the page, to survive route navigation.

The critical risks cluster around two areas. First, the CSS migration: shadcn/ui uses the same CSS variable names (`--primary`, `--background`, `--foreground`) as the existing `globals.css`, and a collision will cause silent visual regressions across all pages. The resolution is a controlled, one-time token merge in `globals.css` before any shadcn component is installed. Second, the HITL draft approval flow has three known failure modes (stale draft approval, double-submit, expired unreviewed drafts) that require DB-level guardrails (`draft_version` integer, idempotency keys, `expires_at` with cron cleanup) designed into the schema before any UI is built.

## Key Findings

### Recommended Stack

The v1.1 stack adds four new packages to the existing foundation. `shadcn/ui` (latest CLI) provides accessible, copy-owned UI primitives that are Tailwind v4-native and already decided in PROJECT.md — components are owned source code, not a library dependency, so zero versioning churn. `motion` (formerly `framer-motion`, v12, imported from `framer-motion`) provides spring physics and presence animations. `lucide-react` (bundled with shadcn CLI) replaces inline Heroicon SVGs with a tree-shakeable icon system. `tw-animate-css` replaces the v3-only `tailwindcss-animate` that shadcn previously used. For mission state, the stack uses already-provisioned Supabase Realtime (`postgres_changes` subscription on `missions` table) — no new SSE or WebSocket infrastructure needed. Gemini 2.5 Flash via the existing `@google/genai` handles both steering bar intent parsing and mission execution.

Space Grotesk and DM Sans are not on Google Fonts. Both must be self-hosted via `next/font/google` with downloaded WOFF2 files in `apps/web/public/fonts/`. This is a hard requirement — `next/font/google` will fail at build time for these fonts. TanStack Query is recommended (not yet confirmed) for the AI Concierge mission polling use case to prevent state race conditions; this is the one open dependency decision.

**Core technologies:**
- `shadcn/ui` (latest CLI): accessible UI primitives, copy-owned — Tailwind v4 support confirmed, zero versioning churn
- `motion` ^12.x (`framer-motion` import): spring animations and presence transitions — React 19 compatible, API identical to framer-motion
- `lucide-react` ^0.468+: SVG icons — tree-shakeable, matches shadcn ecosystem, included by shadcn CLI
- `tw-animate-css` ^1.x: Tailwind v4 animation utilities — drop-in replacement for deprecated `tailwindcss-animate`
- `next/font/google`: Space Grotesk + DM Sans delivery — mandatory (fonts not on Google Fonts)
- Supabase Realtime (existing): mission status push — zero new dependencies, already provisioned

### Expected Features

The v1.1 feature set splits into table stakes (things a polished platform must have) and differentiators (things no competitor offers). All redesigned pages depend on the design system landing first. The floating CribAI panel and AI Concierge page are the two highest-complexity deliverables and both depend on earlier infrastructure phases.

**Must have (table stakes):**
- Design system consistency (shadcn/ui + Space Grotesk + DM Sans + Lucide) — prerequisite for every page
- Marketing landing page — without one, sharing the URL shows a blank auth wall
- Auth page with branded split-panel layout — OTP logic stays, only layout changes
- Explore page with split list+map view and floating CribAI panel — industry standard, highest-traffic page
- Listing detail with photo grid and sticky CTA — AI lease summary + commute section as embedded differentiators
- Profile/saved combined tabbed page — reduces navigation friction
- Page transition and entrance animations — baseline quality signal for modern apps

**Should have (competitive differentiators):**
- AI Concierge missions page (async task pipeline, 5-state status, HITL approval) — flagship v1.1 differentiator, no competitor offers this
- HITL draft approval flow — trust-building for irreversible agent actions (tour scheduling)
- Steering bar for mid-mission correction — emerging agentic UX pattern
- Agent summary + raw logs toggle — satisfies both beginners and power users
- Post sublease wizard (multi-step with progress sidebar) — supply-side growth, no real competitor
- Proactive mission templates for empty state — converts first-time concierge users

**Defer (v2+):**
- Generative UI (agent returns component JSON) — needs stable mission type inventory first
- Full LangGraph/Inngest state machine backend — over-engineered for v1.1 scale
- Dark mode — doubles CSS variable surface area; defer until token layer is stable
- Additional AI Concierge mission types — add based on usage data post-launch
- Landlord-facing mission types — requires separate PM platform work

### Architecture Approach

The recommended architecture is a strict server/client page split (server component handles auth + data fetch, `'use client'` inner component owns UI state), following the existing `cribai-page-client.tsx` pattern. All new pages follow this structure. The floating CribAI panel must render in the root layout (never per-page) to persist across route navigations, with Zustand or React Context at the layout level for `isOpen` + `conversationId` state. The mission executor lives in `packages/ai/src/missions/executor.ts` (not the web app), keeping the web app thin. API routes create mission rows and return 202 immediately; executor runs fire-and-forget. Supabase Realtime subscriptions drive all mission status updates.

**Major components:**
1. `apps/web/components/ui/` — shadcn/ui primitives (Button, Card, Sheet, Badge, Tabs, Dialog, etc.) installed by CLI, owned source code
2. `apps/web/components/concierge/` — MissionCard, HitlDraftApproval, SteeringBar, FloatingChatPanel — new, parallel to existing `components/chat/`
3. `packages/ai/src/missions/` — MissionExecutor + step type definitions — wraps existing 6 tools, adds async orchestration
4. `supabase/migrations/013_missions.sql` — `missions` + `mission_steps` tables with RLS, Realtime publication, versioned drafts schema
5. `apps/web/app/(campus)/[campusSlug]/explore/` — new unified route replacing `/listings` + `/cribai`, split 60/40 list/map view
6. `apps/web/app/(campus)/[campusSlug]/concierge/` — new missions board with Realtime subscriptions

### Critical Pitfalls

1. **CSS variable name collision when installing shadcn/ui** — shadcn uses identical names (`--primary`, `--background`, `--foreground`, `--border`) as the existing `globals.css`. Run `npx shadcn@latest init` on a branch, audit the diff, and manually merge tokens. Final result: single `:root` block using shadcn's structure populated with CampusNest brand values in OKLCH. Must happen before any shadcn component is added.

2. **Big-bang design system migration breaks working features** — migrating all components simultaneously leaves the app in a broken inconsistent state mid-PR. Fix: Phase 1 is exclusively CSS/font/token foundation. Pages migrate one at a time in subsequent phases. Existing pages remain working throughout because the CSS change is additive.

3. **HITL draft approval has three silent failure modes** — stale draft approved after revision, double-submit creates duplicate tour requests, unreviewed drafts block missions forever. Requires DB-level design: `draft_version` integer (reject mismatched approvals), idempotency key on approval API, `expires_at` with pg_cron cleanup, submit button disabled on first click.

4. **framer-motion forces client component boundary proliferation** — adding `motion.*` to a page component without `'use client'` causes a hard error; adding `'use client'` to the page itself kills RSC data-fetching benefits. Fix: thin `'use client'` wrapper components (`MotionListItem`, `MotionSection`) in `components/ui/`; pages remain Server Components.

5. **Floating CribAI panel loses conversation context on route navigation** — React state local to the explore page is destroyed on navigation. Fix: render the panel in `app/layout.tsx` at the root layout level, with global state (`isOpen`, `conversationId`) that survives route changes. Verified by E2E: open panel, navigate, confirm state persists.

6. **Mission executor timeout on Vercel serverless** — multi-tool Gemini calls take 15–30s; Vercel Hobby timeout is 10s. Fix: API route creates mission row and returns 202 immediately; executor runs fire-and-forget or as a Supabase Edge Function. Client subscribes to Realtime for completion — never waits on the HTTP response.

7. **Lucide barrel imports inflate bundle 30–50x** — named imports look tree-shakeable but barrel exports defeat bundler tree-shaking in dev mode. Fix: add `experimental.optimizePackageImports: ["lucide-react"]` to `next.config.ts` on day one, before any icons are used.

## Implications for Roadmap

Based on combined research, the phase structure follows strict bottom-up dependency order. Design system first, infrastructure second, pages third, AI features last.

### Phase 1: Design System Foundation
**Rationale:** Every page, component, and feature in v1.1 depends on the design system being stable. The CSS token collision risk is highest here and must be isolated. This phase has no UI dependencies — it cannot cause visual regressions in other phases because it comes first.
**Delivers:** Space Grotesk + DM Sans via `next/font/google`, shadcn/ui initialized with token bridge in `globals.css`, `tw-animate-css` replacing `tailwindcss-animate`, `optimizePackageImports` for Lucide, verified build and test pipeline.
**Addresses:** Design system consistency (table stakes), font loading (prerequisite)
**Avoids:** Pitfall 1 (CSS collision), Pitfall 2 (big-bang migration), Pitfall 3 (font self-hosting mandatory), Pitfall 7 (Tailwind v4 build breakage), Pitfall 5 (Lucide bundle bloat)
**Research flag:** Standard — shadcn/ui Tailwind v4 docs are authoritative and complete. No additional research needed.

### Phase 2: Marketing Landing Page + Auth Redesign
**Rationale:** Highest-visibility, lowest-complexity pages. No shared state, no AI, no new DB requirements. Serve as the first real test of shadcn/ui primitives in production. Also establishes the framer-motion wrapper pattern that all subsequent animated pages inherit.
**Delivers:** Marketing landing page with scroll-triggered entrance animations, branded auth split-panel layout with existing OTP logic preserved.
**Addresses:** Marketing landing page (must-have), auth page redesign (must-have)
**Avoids:** Pitfall 4 (framer-motion client boundary — establish `MotionWrapper` pattern here for all future phases)
**Research flag:** Standard — SaaS landing page and auth split-panel patterns are well-established.

### Phase 3: Explore Page (Split View + Floating CribAI Panel)
**Rationale:** Highest-traffic page and architecturally the most complex UI. Requires CSS foundation (Phase 1) and shadcn Sheet primitive. Introduces the floating panel persistence architecture that the concierge page also reuses. Building explore first validates the `useCribAIChat` hook extraction and the layout-level panel pattern before the more complex concierge page depends on them.
**Delivers:** Split 60/40 list/map view, filter chips row with URL-param shared state, floating CribAI panel in root layout with global open/conversation state, `useCribAIChat` hook extracted from `cribai-chat.tsx`, redirects from `/listings` and `/cribai` to `/explore`.
**Addresses:** Explore page (table stakes), floating CribAI panel (differentiator)
**Avoids:** Pitfall 9 (floating panel losing context on navigation — layout-level panel with global state)
**Research flag:** Standard for split-view pattern. URL-param shared state between filter chips and AI panel is a design decision to confirm early in the phase.

### Phase 4: Listing Detail + Profile/Saved Page Redesigns
**Rationale:** Independent page rewrites with no new AI infrastructure or DB dependencies beyond a nullable `ai_lease_summary` column on listings. Can be parallelized internally. Listing detail adds AI lease summary (Gemini call, cached in DB column) and commute section (Mapbox Directions, already integrated).
**Delivers:** Listing detail with masonry photo grid, sticky CTA sidebar, AI lease summary cached in `listings.ai_lease_summary`, commute chips row. Combined profile/saved tabbed page with existing saved listings and profile form.
**Addresses:** Listing detail redesign (table stakes), commute section (differentiator), AI lease summary (differentiator), profile/saved page (table stakes)
**Avoids:** No new pitfalls — reuses established patterns from Phases 1–3.
**Research flag:** Standard. AI lease summary needs a small DB migration (nullable text column) — low risk.

### Phase 5: Post Sublease Wizard
**Rationale:** Multi-step form with Supabase Storage photo uploads. Fully independent of the AI Concierge track. Can run in parallel with Phases 6–7. Requires activating the existing `sublets` schema and creating a photo upload bucket in Supabase Storage (new infrastructure, low complexity).
**Delivers:** Multi-step sublease submission wizard (lease details → pricing → photos → location → review → submit) with React Hook Form + Zod validation per step, Supabase Storage photo upload.
**Addresses:** Post sublease wizard (differentiator — supply-side growth)
**Avoids:** Standard form validation patterns — no novel pitfalls.
**Research flag:** Standard — React Hook Form multi-step pattern is well-documented. Supabase Storage bucket creation is routine.

### Phase 6: Missions DB Schema + Types
**Rationale:** The `missions` and `mission_steps` tables must exist and be verified before any executor or UI work begins. Schema design here is where the HITL safety guardrails must be locked in — `draft_version`, `expires_at`, and idempotency structures must be in the migration, not retrofitted later. Writing Zod schemas in `packages/types/src/mission.ts` first enables type-safe executor development.
**Delivers:** `supabase/migrations/013_missions.sql` with missions + mission_steps tables, RLS policies, Realtime publication enabled. `packages/types/src/mission.ts` Zod schemas. Unit tests verifying schema constraints.
**Addresses:** AI Concierge backend prerequisites
**Avoids:** Pitfall 7 (HITL failure modes — `draft_version`, `expires_at`, and idempotency key must be in the schema from the start, never retrofitted)
**Research flag:** Needs review during planning — HITL schema design has three known failure modes with non-obvious prevention fields. Verify pg_cron availability on current Supabase plan before relying on it for `expires_at` enforcement.

### Phase 7: Mission Executor + API Routes
**Rationale:** Business logic before UI. The mission executor in `packages/ai/src/missions/executor.ts` wraps the existing 6 tools and adds async orchestration. API routes handle create, list, get, and HITL approve. The fire-and-forget execution pattern (202 Accepted, executor runs independently) must be implemented here to avoid Vercel timeout failures at scale.
**Delivers:** `packages/ai/src/missions/executor.ts` (Gemini orchestrator over existing tools), `/api/missions/route.ts`, `/api/missions/[id]/route.ts`, `/api/missions/[id]/approve/route.ts` with version check and idempotency enforcement.
**Addresses:** AI Concierge executor infrastructure
**Avoids:** Pitfall 6 (Vercel timeout — API returns 202 immediately, executor is fire-and-forget)
**Research flag:** Needs review — the fire-and-forget execution pattern on Vercel serverless needs timeout ceiling validation. If complex multi-tool missions exceed 60s (Vercel Pro limit), the executor must move to a Supabase Edge Function. This architectural decision should be made before writing the executor, not after.

### Phase 8: AI Concierge Page (Mission Board UI)
**Rationale:** Final phase — depends on all preceding phases. Requires CSS foundation (1), shadcn primitives (1), explore page layout patterns (3), missions DB (6), and executor (7). The flagship differentiator for v1.1, built last with all dependencies verified.
**Delivers:** `concierge-client.tsx` mission board with Supabase Realtime subscriptions, `MissionCard` with 5-state status pipeline, `HitlDraftApproval` with version check and double-submit prevention, `SteeringBar` with intent taxonomy and `unknown_intent` fallback, agent step timeline accordion, mission template cards for empty state.
**Addresses:** AI Concierge missions page (flagship differentiator), HITL approval (differentiator), steering bar (differentiator), raw logs toggle (differentiator), proactive empty state templates
**Avoids:** Pitfall 6 (TanStack Query for mission state polling — no raw `setInterval`), Pitfall 7 (HITL draft safety guardrails enforced), Pitfall 8 (steering bar `unknown_intent` handler with visible clarification UI)
**Research flag:** Needs review — TanStack Query + Supabase Realtime coexistence pattern should be specified before implementation. Steering bar intent taxonomy (`refine_criteria`, `change_budget`, `restart_mission`, `cancel_mission`, `clarify_question`, `unknown_intent`) needs to be defined and agreed on before the executor and UI are built.

### Phase Ordering Rationale

- **Design system first (Phase 1):** Hard prerequisite for every UI phase. The CSS token collision is a critical risk that must be resolved before anything else is built on top of it.
- **Simple pages before complex (Phases 2–5):** Landing and auth validate the design system with minimal complexity. Explore and listing detail add complexity incrementally. The post sublease wizard runs in parallel with the AI track because it has no shared dependencies.
- **DB schema before executor before UI (Phases 6→7→8):** The HITL failure modes must be addressed in the schema before the executor logic is written, and the executor must be verified before the UI is built. Building UI first encourages deferring the schema safety fields.
- **Explore before Concierge (Phase 3 before 8):** The floating panel architecture, `useCribAIChat` hook extraction, and Supabase Realtime patterns established in Phase 3 are directly reused in Phase 8. Validating them in a simpler context first reduces Phase 8 risk.

### Research Flags

Phases needing deeper research during planning:
- **Phase 6 (Missions Schema):** HITL failure mode prevention requires careful schema design. `draft_version`, `expires_at`, idempotency key, and pg_cron availability need specification before the migration is written.
- **Phase 7 (Mission Executor):** The fire-and-forget execution approach on Vercel serverless needs timeout ceiling validation. If Vercel Pro 60s `maxDuration` is insufficient for complex multi-tool missions, the executor must move to a Supabase Edge Function. This architectural decision must precede implementation.
- **Phase 8 (Concierge UI):** TanStack Query + Supabase Realtime coexistence pattern and the steering bar intent taxonomy need specification during phase planning.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Design System):** shadcn/ui Tailwind v4 docs are authoritative. All pitfalls are documented with prevention strategies.
- **Phase 2 (Landing + Auth):** SaaS landing page and auth split-panel patterns are well-established.
- **Phase 3 (Explore):** Split-view layout and URL-param shared state are documented patterns. `useCribAIChat` hook extraction follows established React hook patterns.
- **Phase 4 (Listing Detail + Profile):** Standard page redesign reusing existing data APIs.
- **Phase 5 (Sublease Wizard):** React Hook Form multi-step pattern is well-documented.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core libraries verified against official docs. shadcn/ui Tailwind v4 support confirmed. motion v12 React 19 compatibility confirmed. Font delivery method is mandatory self-hosting — verified. |
| Features | HIGH (table stakes) / MEDIUM-HIGH (concierge UX) | Design system and page patterns are well-researched against competitor landscape. AI Concierge UX patterns draw from 2025–2026 agentic design articles — patterns are emerging but multiple sources converge. |
| Architecture | HIGH | Existing codebase inspected directly. Server/client split, Supabase Realtime, mission schema, HITL data flow, and file structure are grounded in official docs and observed codebase patterns. |
| Pitfalls | HIGH | CSS token collision, framer-motion boundary, font self-hosting, Lucide bundle, and all three HITL failure modes are verified from official docs, GitHub issues, and community post-mortems with HIGH confidence. |

**Overall confidence:** HIGH

### Gaps to Address

- **TanStack Query adoption:** PITFALLS.md strongly recommends TanStack Query for mission polling to prevent state race conditions. STACK.md suggests simpler polling first. Resolve in Phase 8 planning — default to TanStack Query given the documented race condition risk with raw `setInterval`. Adds one dependency but prevents a class of subtle bugs.
- **Mission executor timeout ceiling:** The 60s Vercel Pro `maxDuration` vs. Supabase Edge Function tradeoff needs validation in Phase 7 planning. If missions reliably complete in <30s (verified in testing), API route approach is fine. If not, Edge Function is the correct path.
- **Steering bar intent taxonomy:** A fixed set of classified intents must be specified and agreed on during Phase 8 planning, before the executor intent-routing logic and UI fallback states are built.
- **pg_cron availability on current Supabase plan:** `expires_at` enforcement for stuck HITL drafts requires a cron job. Verify pg_cron is available on the current plan before relying on it in the schema design (Phase 6).
- **Dark mode deferred:** Token layer stability required first. Schedule as v1.2 enhancement once Phase 1 OKLCH token values are confirmed against Figma.
- **Supabase Realtime connection limits:** Each user on the concierge page holds one Realtime channel. Supabase free plan has a concurrent connection ceiling. Plan upgrade should be assessed before launch if concurrent active user count is expected to exceed ~50.

## Sources

### Primary (HIGH confidence)
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — CSS variable migration, `@theme inline` pattern, `tw-animate-css` requirement
- [shadcn/ui Next.js installation docs](https://ui.shadcn.com/docs/installation/next) — CLI command, monorepo setup
- [shadcn/ui React 19 docs](https://ui.shadcn.com/docs/react-19) — React 19 peer dep status
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) — subscription pattern, publication setup
- [Next.js font optimization docs](https://nextjs.org/docs/app/getting-started/fonts) — `localFont` API, `adjustFontFallback`
- [Lucide React official docs](https://lucide.dev/guide/packages/lucide-react) — tree shaking pattern
- [How Next.js optimizes package imports](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) — `optimizePackageImports` for barrel exports
- [Tailwind CSS v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide) — migration codemod, directive changes
- Codebase inspection: `apps/web/`, `packages/ai/`, `supabase/migrations/` — verified 2026-03-10

### Secondary (MEDIUM confidence)
- [motion.dev upgrade guide](https://motion.dev/docs/react-upgrade-guide) — framer-motion to framer-motion migration
- [framer-motion with Next.js Server Components](https://www.hemantasundaray.com/blog/use-framer-motion-with-nextjs-server-components) — client wrapper pattern
- [Vercel AI SDK HITL pattern](https://ai-sdk.dev/cookbook/next/human-in-the-loop) — approval gate architecture reference (different SDK, pattern is transferable)
- [Designing for Agentic AI — Smashing Magazine, Feb 2026](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/) — concierge UX patterns
- [TanStack Query optimistic updates guide](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) — polling + mutation coordination
- [SSE vs WebSocket vs polling comparison — 2025](https://dev.to/haraf/server-sent-events-sse-vs-websockets-vs-long-polling-whats-best-in-2025-5ep8) — mission state transport rationale

### Tertiary (MEDIUM-LOW confidence)
- [tw-animate-css npm](https://www.npmjs.com/package/tw-animate-css) — Tailwind v4 animation replacement (WebSearch)
- [Migrating Tailwind v3 to v4 with shadcn/ui — ZippyStarter](https://zippystarter.com/blog/guides/migrating-tailwind3-to-tailwind4-with-shadcn) — CSS token collision details
- [Real estate UX trends 2025 — Medium](https://medium.com/@emilyanderson51691/top-12-ux-ui-design-trends-for-real-estate-apps-in-2025-37a5b70aef21) — explore page patterns

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*
