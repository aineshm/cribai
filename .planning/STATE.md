---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Agent Platform
status: completed
stopped_at: Post-v2.0 polish — AI behavior tuning, prompt condensing, UI/UX fixes
last_updated: "2026-03-24"
last_activity: 2026-03-24 -- Documentation sync across product + ops repos
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 14
  completed_plans: 14
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Students can find off-campus housing through conversational AI search that understands what they actually want
**Current focus:** v2.0 shipped. Post-launch polish + outreach execution (Summer Sublease Sprint)

## Current Position

Milestone: v2.0 Agent Platform — COMPLETE (shipped 2026-03-19)
Post-v2.0: 14 polish commits (2026-03-20 to 2026-03-24)
Status: Engineering complete. Sprint focus is outreach + user acquisition.
Last activity: 2026-03-24 — Documentation sync

Progress: [██████████] 100%  (v2.0: all phases complete)

## What Shipped in v2.0

- MissionExecutor: autonomous background tasks (housing search, tour outreach, listing deep dive, sublease post)
- 13 function-calling AI tools with Gemini 2.5 Flash
- HITL approval before external actions
- Chat-to-Mission bridge: intent classifier triggers mission proposals
- Server-side chat persistence (3-lite): assistant messages persisted via after()
- Conversation context JSONB for cross-message listing awareness
- Sublease marketplace: post via chat or PostWizard, edit/photos for creators
- CribAI rebrand (CampusNest → CribAI) across all surfaces
- Chat inbox at /chat, nav restructured (Explore + Chat)
- Inline embedding generation for all listing insertion paths
- 2,509 real listings (Zillow), UW-Madison campus
- Migrations 001-030 applied to production Supabase

## Post-v2.0 Polish (2026-03-20 to 2026-03-24)

14 commits focused on:

### AI Behavior Tuning
- Force action-first behavior — search immediately, never interview the user
- System prompt: action-first, sublease awareness, seasonal dates
- Search modelContext: prefer Zillow + sublease over Craigslist
- Condense Gemini prompts for speed/cost (42 lines removed)
- Restore currentInput in steering prompt

### UI/UX Fixes
- UI/UX audit: 10 fixes across explore, listing, auth, map, landing
- Better listing titles + cleaner "Ask AI" prompt
- Map popup z-index: listing card renders above markers (3 commits)
- Landing page mobile menu (LandingMobileMenu.tsx)

### Data Quality
- Increase explore listing limit from 500 to 3000 (subleases cut off at rank 544)
- Skip embedding for already-embedded web-search listings
- OTP email trim, skip geo fallback with mapBounds

### Security
- Verify conversation ownership before read/write (Codex P1)

## Performance Metrics

**Velocity (all milestones):**

| Milestone | Phases | Plans | Shipped |
|-----------|--------|-------|---------|
| v1.0 MVP | 9 | 29 | 2026-03-10 |
| v1.1 UI/UX | 13 | 17 | 2026-03-12 |
| v2.0 Agent | 5 | ~14 | 2026-03-19 |
| Post-v2.0 Polish | — | 14 commits | 2026-03-24 |

**Total:** 607 commits, 30 migrations, ~770 unit tests + 89 E2E tests

## Accumulated Context

### Key Decisions (Post-v2.0)

- Action-first AI: CribAI searches immediately on any housing query, never asks clarifying questions first
- Craigslist deprioritized in search results (data quality issues, prefer Zillow + sublease)
- Explore listing limit raised to 3000 (subleases were invisible beyond rank 544)
- Gemini prompts condensed: shorter system prompt + intent classifier + steering parser
- Map popup z-index layering: `.mapboxgl-popup` at z-50, listing cards render above markers

### Blockers/Concerns

- after() panel-close behavior on Vercel needs manual validation (best-effort completion)
- Scraper batch embedding needs raw_title column fix (migration 017 not on prod) — existing listings have embeddings
- GOOGLE_PLACES_API_KEY not provisioned (reviews tool degrades gracefully)
- WALKSCORE_API_KEY permanently unavailable (requires business account)

## Session Continuity

Last session: 2026-03-24
Stopped at: Documentation sync across product + ops repos
Resume file: None
Next: Outreach execution (Reddit, FB, GroupMe) — engineering is done
