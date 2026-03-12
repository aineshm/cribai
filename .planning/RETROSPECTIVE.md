# Retrospective

## Milestone: v1.0 — CampusNest MVP

**Shipped:** 2026-03-10
**Phases:** 9 | **Plans:** 29 | **Timeline:** 7 days | **Commits:** 263

### What Was Built
- Full auth system with OTP, .edu validation, profiles
- Multi-source scraper pipeline with nightly automation
- Semantic search with pgvector embeddings and Mapbox maps
- Saved listings with real-time price change notifications
- CribAI agentic chat with 11 tools including live web search
- DB-backed conversation persistence with sidebar

### What Worked
- GSD workflow kept execution disciplined across 29 plans
- Phase verification caught real bugs (setIsLoading in Phase 6, contact_email data loss)
- Milestone audit → gap closure phases (8, 9) systematically addressed integration issues
- Yolo mode with auto-chaining maximized throughput

### What Was Inefficient
- Phase 7 (scraper-fix) was planned but abandoned — orphaned directory remains
- First milestone audit triggered 2 additional phases (8, 9) — audit earlier next time
- Some SUMMARY files missing requirements-completed frontmatter (Phase 7-9)
- Nyquist validation never completed for any phase (all draft)

### Patterns Established
- Dev auth bypass pattern: isDevAuthEnabled + DEV_USER_COOKIE + createSecretClient
- Placeholder tool pattern: helpful "coming soon" with alternative resource links
- Price detection before upsert pattern for change notifications
- Dual persistence: DB for auth users, sessionStorage fallback for guests

### Key Lessons
- Run milestone audit before declaring "done" — Phases 8-9 wouldn't exist without it
- Integration gaps between phases are the most common source of bugs
- Tool description steering is effective for Gemini behavior control

### Cost Observations
- Model mix: Primarily sonnet for execution, opus for auditing/verification
- 29 plans executed in ~7 days of calendar time
- Average plan execution: ~5 minutes

---

## Milestone: v1.1 — UI/UX Upgrade

**Shipped:** 2026-03-12
**Phases:** 13 | **Plans:** 17 GSD plans | **Timeline:** 2 days | **Commits:** 164

### What Was Built
- Full design system migration: Space Grotesk + DM Sans, shadcn/ui, Lucide icons, framer-motion
- Marketing landing page with auth-aware state for returning users
- Auth redesign: branded split-panel + animated multi-step OTP flow with Supabase profile persistence
- Explore page: split-view (listings + map), filter chips, campus-scoped CribAI chat panel
- Listing detail: photo gallery with lightbox, sticky CTA sidebar, AI lease summary prose, commute section
- Post sublease wizard + combined profile/saved/settings tabbed page
- AI Concierge UI: mission sidebar, action cards, HITL draft approval, steering bar (mock data)
- Walk Score + Google Places tool integrations
- Full cross-phase wiring: auth-gated routes, ConciergeShell in (main) layout, campus-aware ChatProvider
- Retroactive verification sweep: VERIFICATION.md + 34/34 requirements documented

### What Worked
- Phases 10-15 shipped rapidly outside GSD (no formal plans) — momentum without overhead for design work
- GSD gap-closure phases (18-24) systematically wired up the cross-phase integration issues
- Retroactive VERIFICATION.md creation (Phase 24) closed the documentation debt efficiently in a single sweep
- Wave-based parallel execution reduced plan execution time (24-01 + 24-02 ran in parallel)
- Yolo + auto-chain kept the pipeline flowing without manual approval gates

### What Was Inefficient
- Phases 10-15 had no GSD SUMMARY.md files — required retroactive VERIFICATION.md without unit-test evidence
- Phases 12 and 16 were built but their directories don't appear in .planning/phases/ (committed directly to git)
- Multiple rounds of gap-closure phases (18-24 are gap phases, not new features) — earlier wiring would have compressed this
- E2E tests fail when dev server not running (Playwright config gap) — caused confusing test output during Phase 24
- STATE.md accuracy drifted during rapid execution — required manual reconciliation

### Patterns Established
- innermost-wins ChatProvider: root layout (empty slug) + campus layout (real slug) override
- campusSlug fallback chain: user_metadata → first campus_configs row → 'uw-madison' literal
- Retroactive VERIFICATION.md via codebase grep (no re-running tests) — effective for pre-GSD phases
- framer-motion global Proxy mock in vitest.setup.ts: converts motion.X to plain HTML elements
- (main) route group Server Component layout with Client Component children for ConciergeShell

### Key Lessons
- Wire cross-phase integration immediately after each phase — gap-closure phases are expensive
- Nyquist validation from the start (not retroactively) prevents the verification sweep phase
- E2E test runner needs dev server guard — test output confused real failures vs infra failures
- Design-phase work benefits from rapid "build first, formalize later" approach (phases 10-15 shipped fast)

### Cost Observations
- Model mix: Primarily sonnet for execution, opus for gap-closure and audit phases
- 164 commits in 2 days — very fast milestone (design work pre-done in Figma)
- Audit: tech_debt status — cleaner than v1.0 (fewer total gaps)

---

## Cross-Milestone Trends

| Metric | v1.0 | v1.1 |
|--------|------|------|
| Phases | 9 | 13 |
| Plans | 29 | 17 GSD |
| Days | 7 | 2 |
| Commits | 263 | 164 |
| LOC added | ~23,800 | +15,124 |
| Requirements | 27/27 | 34/34 |
| Audit status | tech_debt | tech_debt |
| Gap closure phases | 2 (8,9) | 7 (18-24) |
