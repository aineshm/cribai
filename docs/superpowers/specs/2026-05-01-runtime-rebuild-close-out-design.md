# Runtime Rebuild — Sprint Close-Out Design

- **Date:** 2026-05-01
- **Sprint window:** 2026-04-15 → 2026-05-10 (9 days remaining at design time)
- **Authoring branch:** `runtime-rebuild` (product) / `main` (ops)
- **Status:** approved by user 2026-05-01

## 1. Context

The runtime-rebuild sprint replaces CribAI's LLM-centric runtime with a state-centric one (durable `conversation_state`, typed `ToolResult`, queued mission execution, viewport-driven explore). Implementation has landed locally on branch `runtime-rebuild` at commit `daa268e`. A subsequent security pass (uncommitted, in working tree as of design time) hardens the new RPCs and public write surfaces, adds migration `034`, and clears a `pnpm audit` advisory.

The gap between the local state and reality:

- 26 files modified across product repo, none committed past `daa268e`.
- 2 untracked artifacts: `docs/CODEMAPS/runtime-architecture-improvement-plan.md` and `supabase/migrations/034_harden_security_definer_functions.sql`.
- Ops repo carries a parallel uncommitted set: `STATUS.md`, `AGENTS.md`, `engineering/architecture.md`, plus an untracked canonical handoff `engineering/handoffs/2026-04-15-runtime-rebuild-spec.md`.
- Migrations 032/033/034 are not applied to any Supabase environment.
- No production mission worker is running. Oracle free tier is blocked by `VM.Standard.A1.Flex` capacity in `us-chicago-1`.
- `.planning/STATE.md` and `~/.claude/.../memory/MEMORY.md` still describe v2.0 reality from 2026-03-24.
- The runtime-rebuild branch has not been pushed.

This spec is the contract for closing the sprint inside the remaining window.

## 2. Goal

By 2026-05-10, the runtime rebuild is:

- merged to `main` and deployed to Vercel
- backed by migrations 032/033/034 applied to production Supabase
- running on a chosen worker host (GitHub Actions stopgap acceptable)
- documented coherently across both repos (product + ops + memory + Notion)
- verified by the four golden flows from the runtime-rebuild handoff spec

## 3. Non-Goals

Explicitly out of scope for this 5-day plan:

- Building Phase 0 timing instrumentation from the spec (defer to next sprint).
- Replacing transitive `pnpm.overrides` with direct dependency upgrades (reviewer item 6, defer).
- Adding focused route tests for the three hardened APIs (reviewer item 5, defer unless trivially included).
- Standing up Oracle Cloud worker VM (blocked by capacity; GH Actions covers this sprint).
- Forward-looking architecture work in `runtime-architecture-improvement-plan.md` — the doc is committed as a forward artifact, not implemented here.
- Tackling exploratory branches `agent-fix-diy-v2`, `agent-vercel-ai-sdk-v2`, `feature/python-agent-service` (orphan branches, separate decision).

## 4. Plan

### Day 1 — Discovery + doc commits + de-risk (2026-05-01)

Purpose: get a clean working tree of doc + memory state + de-risk decisions before any code commit.

Actions, all in working tree before any push:

1. **Verify feature flag status (gap 5).** Read `apps/web/app/api/ai/cribai/route.ts` and `packages/ai/src/cribai.ts`. Decide one of: (a) gate the deterministic runtime behind `FEATURE_RUNTIME_REBUILD` env flag, default off in prod for soak; (b) ship always-on and document the blast radius. Record the decision inline in the relevant file as a one-line comment plus a note in RUNBOOK.md.
2. **Resolve the 5 stale concierge tests (gap 6).** Read each failure. Pick exactly one stance per test: (a) update assertion to match new Mission UI behavior; (b) `.skip` with a TODO that names the follow-up; (c) delete if the test describes behavior that no longer exists. No "investigate later."
3. **Write rollback plan (gap 4).** Add a section to `docs/RUNBOOK.md`:
   - apply order: 032 → 033 → 034
   - rollback order: 034 → 033 → 032 (drop functions/tables)
   - per-migration: what it creates, what depends on it, post-rollback verification query
4. **Update memory state (gap 2).**
   - `.planning/STATE.md`: set `milestone: v2.5 Runtime Rebuild`, `status: in_progress`. Add a section summarizing the sprint, the security pass, and what remains.
   - `~/.claude/projects/-Users-aineshmohan-Developer-ai-real-estate-agent/memory/MEMORY.md`: replace stale Summer Sublease references; add a Runtime Rebuild section pointing at the active sprint goals doc; note that v2.0 is the deployed prod state and runtime-rebuild is the in-flight upgrade.
5. **Configure Codex review reasoning (gap 7).** Update Codex CLI config so `codex review --base` and the `.husky/pre-push` `codex review --uncommitted` hook run with model `gpt-5.5` and `reasoning-effort: high`. Persist this in the appropriate config file (`~/.codex/config.toml` or repo-level codex config). Document the change in `docs/CONTRIBUTING.md` so other contributors get the same reviewer behavior.
6. **Commit product-repo docs.** Single commit:
   ```
   docs: sync codemap, runbook, planning state for runtime rebuild close-out
   ```
   Bundles: 9 modified docs (`docs/CODEMAPS/*`, `docs/RUNBOOK.md`, `docs/ENV.md`, `docs/CONTRIBUTING.md`, `docs/agent-outputs/STATUS.md`), the new `docs/CODEMAPS/runtime-architecture-improvement-plan.md`, updated `.planning/STATE.md`, and the rollback section in RUNBOOK.
7. **Commit ops-repo docs.** Single commit on `main`:
   ```
   docs: runtime rebuild progress + sprint close-out plan
   ```
   Bundles: modified `STATUS.md`, `AGENTS.md` (frontmatter `last_updated: 2026-05-01`), `engineering/architecture.md`, the new untracked `engineering/handoffs/2026-04-15-runtime-rebuild-spec.md`, plus an additions block in `sprints/2026-04-runtime-rebuild/goals.md` describing the security hardening pass and this close-out plan.
8. **Push both doc commits.** `git push origin runtime-rebuild` (product) and `git push origin main` (ops).
9. **Update Notion (gap 3).** Two entries in the Execution Log: (a) runtime-rebuild implementation summary linking to the handoff spec; (b) security hardening pass + this 5-day close-out plan. Update the Roadmap to mark Runtime Rebuild "in flight" through 2026-05-10.

End-of-day state: clean doc/memory tree across both repos, both pushed; product code changes still uncommitted, ready for sprint-close PR; Codex review pinned to `gpt-5.5` high.

### Day 2 — Code commits + push + staging migration

Purpose: get the code changes onto the remote in reviewable slices and prove migrations land cleanly.

Actions:

1. **Commit code changes** in three logical commits on `runtime-rebuild`:
   - `fix(security): harden SECURITY DEFINER RPCs + cap public write surfaces` — migration 034, the three route-handler hardening edits, worker bounds in `worker.ts` + `worker-loop.ts`, executor test updates.
   - `chore(deps): pin next + add pnpm.overrides for protobufjs advisory` — `package.json` (root + apps/web) and `pnpm-lock.yaml` churn isolated.
   - `chore: replace internal anchor links with next/link` — the 5 lint-fix component edits.
2. **Push and open draft PR** `runtime-rebuild → main`. PR body: link the ops handoff spec + sprint goals, list the 6 gaps closed, list non-goals.
3. **Apply migrations 032/033/034 to STAGING Supabase.** If a staging project does not exist, create a Supabase branch project (Supabase Branching) for staging today; do not migrate prod yet.
4. **Run pre-push verification:** the reviewer's full pnpm command list (lint, typecheck, build across all packages, package tests, audit) plus the now-fixed/skipped concierge suite. All green required before Day 3.

### Day 3 — Golden flows + worker host + prod migration

Purpose: prove correctness against staging, choose worker host, then migrate prod.

1. **Run the 4 golden flows from the runtime-rebuild handoff spec against staging:**
   1. search → compare → detail → tour
   2. listing CTA → follow-up → deep-dive mission
   3. chat search → map sync → refine → compare top 2
   4. mission approval → resume → completion
2. **Log results** in `~/Developer/campusnest-ops/engineering/handoffs/2026-05-01-golden-flow-verification.md`. Per-flow: pass/fail, screenshots or terminal logs, anomalies. Commit + push to ops.
3. **Pick worker host.** Recommend GitHub Actions stopgap (`.github/workflows/missions-worker.yml` already exists). Document the Oracle A1 retry plan in `~/Developer/campusnest-ops/operations/infrastructure.md`: subscribe a second region, retry capacity, fallback to paid managed worker. Commit + push to ops.
4. **Apply migrations 032/033/034 to PROD Supabase.** Verify with the post-migration queries from the rollback section. If anything fails, execute the rollback section immediately and stop.
5. **Mark PR ready for review.**

### Day 4 — Review + merge + deploy

Purpose: ship.

1. **Run reviews in parallel:** `code-reviewer` agent + `security-reviewer` agent + Codex (`codex review --base main`, now with gpt-5.5 high). Three independent reads of the diff.
2. **Address findings.** Surface conflicts between reviewers explicitly (memory rule: "never silently switch").
3. **Merge to main.** Vercel auto-deploys.
4. **Soak watch (4-6 hours):** chat first-token latency, mission queue depth, error rates, Vercel runtime errors, Supabase logs. Define rollback trigger upfront: if mission queue stalls for >30min OR chat error rate >5%, revert deploy and execute the migration rollback.

### Day 5 — Soak + retrospective

Purpose: stabilize and capture learning.

1. **Buffer for fix-forward.** Allocate the day to anything from soak watch.
2. **Sprint retrospective** at `~/Developer/campusnest-ops/sprints/2026-04-runtime-rebuild/retrospective.md`. Cover: what shipped, what slipped, the security pass, the 6 gaps, decisions made (worker host, feature flag), decisions deferred (route tests, dep upgrades, Phase 0 instrumentation, Oracle VM).
3. **Decide reviewer items 5-6 (focused route tests + dep direct-upgrades):** keep in this sprint or punt to next sprint. Recommend punt — they are hygiene, not exit criteria.

### Days 6-9 — Buffer

Real engineering slips. The buffer is part of the design, not optional. Common slip causes to plan for:

- staging migration fails (run rollback, debug, re-attempt)
- a golden flow exposes a real bug (fix-forward inside the buffer)
- review finds a security regression (re-architect inside the buffer)
- feature flag exposes incorrect default behavior under real traffic (toggle, fix, redeploy)

## 5. Cross-Repo Doc Sync Map

Left column = product repo (`~/Developer/ai-real-estate-agent`). Right column = ops repo (`~/Developer/campusnest-ops`). Both must be in sync after Day 1.

| Topic | Product repo | Ops repo |
|---|---|---|
| Active milestone | `.planning/STATE.md` | `STATUS.md` |
| Architecture snapshot | `docs/CODEMAPS/architecture.md` | `engineering/architecture.md` |
| Runtime spec | `docs/CODEMAPS/runtime-architecture-improvement-plan.md` (forward) | `engineering/handoffs/2026-04-15-runtime-rebuild-spec.md` (canonical) |
| Sprint plan | n/a | `sprints/2026-04-runtime-rebuild/goals.md` |
| Operational runbook | `docs/RUNBOOK.md` | `engineering/deploy-checklist.md`, `operations/infrastructure.md` |
| Env vars | `docs/ENV.md` | `operations/infrastructure.md` (cross-reference only) |
| Reviewer config | `docs/CONTRIBUTING.md` | `engineering/dev-workflow.md` |
| Memory | `~/.claude/projects/.../memory/MEMORY.md` | n/a |
| Roadmap state | n/a | `product/roadmap.md` + Notion Roadmap |

## 6. Definition of Done

This sprint close-out is done when **all** of the following are true:

1. `runtime-rebuild` is merged into `main` on the product repo.
2. Vercel production is serving the merged commit.
3. Migrations 032, 033, 034 are applied to production Supabase.
4. A worker host is running queued missions (GH Actions stopgap acceptable).
5. The 4 golden flows pass on prod.
6. Both repos are pushed clean (no uncommitted runtime-rebuild docs).
7. `.planning/STATE.md`, `MEMORY.md`, ops `STATUS.md`, and the Notion Execution Log + Roadmap reflect the merged state.
8. Codex review hooks run with `gpt-5.5` + `reasoning-effort: high`.
9. A retrospective exists at `ops/sprints/2026-04-runtime-rebuild/retrospective.md`.

## 7. Rollback

Documented in detail in `docs/RUNBOOK.md` (added Day 1). High-level:

- **Migration rollback:** drop in reverse order — 034 functions → 033 tables/columns → 032 columns. Verification queries listed in RUNBOOK.
- **Deploy rollback:** Vercel rollback to the pre-merge deploy. Verify `runtime-rebuild` SHA is no longer the live deployment before re-applying migrations.
- **Worker stop:** disable `.github/workflows/missions-worker.yml` (or remove cron) to halt mission processing during incident response.
- **Trigger thresholds:** mission queue stall >30min OR chat error rate >5% during Day 4 soak watch.

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration 033 or 034 fails on prod | Medium | High | Apply to staging first (Day 2), have rollback queries ready |
| Reviewer finds security regression | Medium | High | Three parallel reviewers (Day 4); use Day 5 buffer for re-architecture |
| Feature-flag default wrong | Medium | Medium | Day 1 decision logged; can toggle at runtime if gated |
| GH Actions worker latency too high | Low | Medium | Acceptable for sprint exit; revisit in next sprint |
| Stale concierge tests hide a real regression | Low | Medium | Day 1 stance forces a read of each test, not a blanket skip |
| Sprint slips past 2026-05-10 | Medium | Low | 4-day buffer is part of the design |

## 9. Open Items Deferred to Next Sprint

- Phase 0 timing instrumentation (chat first-token, tool latency, mission step duration).
- Focused route tests for hardened APIs (`messages`, `events`, `missions/run-next`).
- Replace transitive `pnpm.overrides` with direct package upgrades.
- Oracle VM worker once A1 capacity exists.
- Triage exploratory branches (`agent-fix-diy-v2`, `agent-vercel-ai-sdk-v2`, `feature/python-agent-service`): adopt, archive, or close.
- Implement Phase 1+ from `docs/CODEMAPS/runtime-architecture-improvement-plan.md` (Redis cache, circuit breakers, event model).

## 10. Acceptance

User approved Approach A1 (compressed, gaps folded in) on 2026-05-01 with explicit additions:

- update docs across **both** repos and commit + push both
- configure Codex review settings to `gpt-5.5` + `high` reasoning effort

This spec captures both.
