# Runtime Rebuild Sprint Close-Out — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the runtime-rebuild sprint by 2026-05-10 — commit/push all uncommitted runtime-rebuild work across product + ops repos, ship the security-hardened branch to production behind verified migrations and a chosen worker host.

**Architecture:** State-centric runtime (durable `conversation_state`, typed `ToolResult`, queued mission execution, viewport-driven explore) is implemented locally on `runtime-rebuild` at commit `daa268e`. A subsequent security pass adds migration `034`, hardens public write surfaces, caps worker batch sizes, and clears a `pnpm audit` advisory. This plan ships that combined state.

**Tech Stack:** Next.js 16 + Supabase (Postgres + PostGIS + pgvector + Auth + Realtime) + Gemini 2.5 Flash + GitHub Actions worker stopgap. Monorepo pnpm 9 + Turborepo. Codex CLI for second-opinion review.

**Spec:** `docs/superpowers/specs/2026-05-01-runtime-rebuild-close-out-design.md`

---

## Parallel Track Map

```
Day 1 (parallel)
  Track A — Product Repo Doc Sync       │ read-only: spec
  Track B — Ops Repo Doc Sync           │ different repo → truly parallel
  Track C — Codex + Memory + Notion     │ cross-cutting; runs alongside A/B
  Track D — Code Hygiene Decisions      │ feature flag + stale tests; gates Track E

Day 2 (after A,B,C,D)
  Track E — Code Commits + PR Push      │ product repo only; needs D's decisions
  Track F.1 — Staging Migration         │ needs PR pushed (or branch pushed)

Day 3 (after F.1)
  Track F.2 — Golden Flow Verification  │ needs staging migrations live
  Track F.3 — Worker Host Decision      │ parallel with F.2
  Track F.4 — Prod Migration            │ after F.2 passes

Day 4 (after F.4)
  Track G — Review + Merge + Deploy     │ multi-reviewer; merge; soak

Day 5
  Track H — Retrospective + Cleanup    │ after G
```

**Concurrency rules:**
- Tracks A and B touch separate repos: zero conflict, run in two sessions simultaneously.
- Track C touches CONTRIBUTING.md (product) + dev-workflow.md (ops) + MEMORY.md (auto-memory) + Notion (external). Runs alongside A and B; merge points called out per task.
- Track D is read-mostly investigation that produces decisions; small file edits only at the end.
- Track E waits for D's stale-test resolution before committing.
- Tracks F.x are sequential by nature.
- Track G runs three reviewers in parallel within one session.

**Session handoff convention:** every track exits with a clear "DONE" message that names the commit SHA(s) produced and the next track's prerequisite. The next session reads the spec + this plan + the predecessor track's exit message.

---

## Pre-flight (every session, ~2 min)

- [ ] **P.1** Verify you are in `/Users/aineshmohan/Developer/ai-real-estate-agent` for product-repo work or `/Users/aineshmohan/Developer/campusnest-ops` for ops-repo work. Run `pwd` to confirm.
- [ ] **P.2** Verify branch:
  - product repo: `git branch --show-current` should print `runtime-rebuild`
  - ops repo: `git branch --show-current` should print `main`
- [ ] **P.3** Read the spec at `docs/superpowers/specs/2026-05-01-runtime-rebuild-close-out-design.md` (product repo). It is the source of truth for goals, non-goals, definition of done, and rollback.
- [ ] **P.4** Read this plan's track for your session. Identify your track's exit criteria before starting.

---

## Track A — Product Repo Doc Sync

**Repo:** `~/Developer/ai-real-estate-agent` on `runtime-rebuild`
**Blocks:** Track E (PR description references these doc commits)
**Blocked by:** none
**Exit criteria:** one commit on `runtime-rebuild` containing all doc + planning-state edits; pushed to `origin/runtime-rebuild`.

### Task A1: Verify uncommitted doc set

**Files (read-only verification):**
- `docs/CODEMAPS/architecture.md`
- `docs/CODEMAPS/backend.md`
- `docs/CODEMAPS/data.md`
- `docs/CODEMAPS/dependencies.md`
- `docs/CODEMAPS/frontend.md`
- `docs/CONTRIBUTING.md`
- `docs/ENV.md`
- `docs/RUNBOOK.md`
- `docs/agent-outputs/STATUS.md`
- `docs/CODEMAPS/runtime-architecture-improvement-plan.md` (untracked)

- [ ] **A1.1** Run `git status --short docs/`
- [ ] **A1.2** Confirm 9 modified entries (`M docs/...`) and 1 untracked entry (`?? docs/CODEMAPS/runtime-architecture-improvement-plan.md`). If any are missing, stop and surface to user.
- [ ] **A1.3** Run `git diff --stat docs/` to see line-count of each file. Sanity check: total lines changed should be ~500.

### Task A2: Update `.planning/STATE.md`

**Files:**
- Modify: `.planning/STATE.md`

- [ ] **A2.1** Read `.planning/STATE.md` start to end. Note the current frontmatter (`milestone: v2.0`, `status: completed`, `last_updated: 2026-03-24`).
- [ ] **A2.2** Replace the frontmatter with:

```yaml
---
gsd_state_version: 1.0
milestone: v2.5
milestone_name: Runtime Rebuild
status: in_progress
stopped_at: Sprint close-out plan adopted; runtime-rebuild branch ready for push, migrations 032/033/034 pending
last_updated: "2026-05-01"
last_activity: 2026-05-01 -- Adopted sprint close-out plan; security pass landed locally
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 1
  completed_plans: 0
  percent: 75
---
```

- [ ] **A2.3** Replace the body with the following content (keeps the existing v2.0 record below as historical context):

```markdown
# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Students can find off-campus housing through conversational AI search that understands what they actually want
**Current focus:** v2.5 Runtime Rebuild — state-centric chat runtime, typed tool contracts, durable mission execution, viewport-driven explore

## Current Position

Milestone: v2.5 Runtime Rebuild — IN PROGRESS (sprint window 2026-04-15 → 2026-05-10)
Local commit: `runtime-rebuild` at `ac20a90` (spec) on top of `daa268e`
Production state: still serving v2.0; runtime-rebuild not yet merged or deployed

## Sprint Close-Out Plan

Approved 2026-05-01. Five-day plan to ship runtime-rebuild + security pass:

- spec: `docs/superpowers/specs/2026-05-01-runtime-rebuild-close-out-design.md`
- plan: `docs/superpowers/plans/2026-05-01-runtime-rebuild-close-out.md`
- ops sprint goals: `~/Developer/campusnest-ops/sprints/2026-04-runtime-rebuild/goals.md`
- ops handoff spec: `~/Developer/campusnest-ops/engineering/handoffs/2026-04-15-runtime-rebuild-spec.md`

Definition of done: see spec section 6.

## What Shipped Locally (Runtime Rebuild)

- Durable `conversation_state` (migration 032) + typed `ToolResult.machineData/statePatch`
- Deterministic chat runtime for search/detail/compare/tour flows
- Mission queue with leases, heartbeats, retries, step attempts (migration 033)
- Mission worker entrypoints (`pnpm worker:missions`, `--once`, `/api/missions/run-next`)
- GitHub Actions one-shot worker workflow (`.github/workflows/missions-worker.yml`)
- Explore viewport API (`/api/explore/viewport`), search API, public listing detail API
- Manual mission Queue/Past UI

## Security Pass (uncommitted at design time)

- Migration `034_harden_security_definer_functions.sql`: revokes broad RPC EXECUTE, pins search_path
- Bounds on `/api/missions/run-next` and worker batch sizes
- Conversation message creation accepts only client-created user messages, caps block count + size
- Analytics events validate names + cap metadata size
- Next.js pinned + `pnpm.overrides` for protobufjs advisory → `pnpm audit` clean

## Blockers / Open

- Branch not pushed; PR not opened
- Migrations 032/033/034 not applied to staging or prod Supabase
- No production mission worker is running
- Oracle free-tier worker blocked by `VM.Standard.A1.Flex` capacity in `us-chicago-1`
- Golden flows from handoff spec not yet rerun against staging or prod
- 5 stale concierge UI tests fail; stance pending Day 1 Track D

## Performance Metrics (cumulative)

| Milestone | Phases | Plans | Shipped |
|-----------|--------|-------|---------|
| v1.0 MVP | 9 | 29 | 2026-03-10 |
| v1.1 UI/UX | 13 | 17 | 2026-03-12 |
| v2.0 Agent | 5 | ~14 | 2026-03-19 |
| Post-v2.0 Polish | — | 14 commits | 2026-03-24 |
| v2.5 Runtime Rebuild | 4 workstreams | 1 close-out | in flight |

## Session Continuity

Last session: 2026-05-01
Stopped at: Sprint close-out plan adopted; spec + plan committed to runtime-rebuild
Resume file: `docs/superpowers/plans/2026-05-01-runtime-rebuild-close-out.md`
Next: Execute the plan track-by-track. Tracks A/B/C/D can run in parallel sessions.
```

- [ ] **A2.4** Run `git diff .planning/STATE.md` and verify the file looks coherent (no leftover v2.0-as-current language).

### Task A3: Add rollback section to RUNBOOK.md

**Files:**
- Modify: `docs/RUNBOOK.md`

- [ ] **A3.1** Read `docs/RUNBOOK.md` to understand current structure.
- [ ] **A3.2** Append a new top-level section before any existing "Appendix" or "Troubleshooting" section:

```markdown
## Runtime Rebuild Migration Rollback

Applies to: migrations `032_conversation_state.sql`, `033_mission_runtime_queue.sql`, `034_harden_security_definer_functions.sql`.

### Apply order

1. `032_conversation_state.sql` — adds `conversations.conversation_state JSONB` column with default empty object
2. `033_mission_runtime_queue.sql` — adds queue/lease/retry columns to `missions`, creates `claim_next_mission()` helper, indexes for queue scans
3. `034_harden_security_definer_functions.sql` — revokes broad EXECUTE on the helper RPCs added in 033, pins `search_path`

Apply via:

```bash
supabase db push                                     # against linked project
# or, against a specific project:
supabase db push --linked --project-ref <ref>
```

### Verification queries (post-apply)

Run in Supabase SQL editor:

```sql
-- 032
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'conversations' AND column_name = 'conversation_state';
-- expect: conversation_state | jsonb | '{}'::jsonb

-- 033
SELECT column_name FROM information_schema.columns
WHERE table_name = 'missions'
  AND column_name IN ('lease_until', 'heartbeat_at', 'attempt_count', 'last_error', 'step_attempts');
-- expect: 5 rows

SELECT proname, prosecdef FROM pg_proc
WHERE proname IN ('claim_next_mission');
-- expect: claim_next_mission | true

-- 034
SELECT proname, proacl FROM pg_proc
WHERE proname = 'claim_next_mission';
-- expect proacl to NOT include public/anon/authenticated EXECUTE
```

### Rollback order (REVERSE)

If any of the above verifications fail OR if production soak watch trips a rollback trigger:

```sql
-- Undo 034 — restore previous EXECUTE grants and search_path
-- (file's own DOWN block; if missing, manually re-grant by running the GRANT statements removed by 034)
GRANT EXECUTE ON FUNCTION public.claim_next_mission TO service_role;
-- (do NOT restore EXECUTE for anon/authenticated; that was the bug)

-- Undo 033 — drop helpers and queue columns
DROP FUNCTION IF EXISTS public.claim_next_mission(text, integer);
ALTER TABLE missions
  DROP COLUMN IF EXISTS lease_until,
  DROP COLUMN IF EXISTS heartbeat_at,
  DROP COLUMN IF EXISTS attempt_count,
  DROP COLUMN IF EXISTS last_error,
  DROP COLUMN IF EXISTS step_attempts;
DROP INDEX IF EXISTS missions_queue_scan_idx;  -- name from migration 033

-- Undo 032 — drop conversation_state column
ALTER TABLE conversations DROP COLUMN IF EXISTS conversation_state;
```

### Rollback triggers (Day 4 soak watch)

Revert deploy + execute migration rollback if **either** is true within the soak window:

- mission queue stalls for >30 min (no `running` → `completed` transitions, queue depth growing)
- chat error rate >5% (5xx responses from `/api/ai/cribai`)

### Worker stop (incident response)

- disable workflow: GitHub UI → Actions → `missions-worker` → ⋮ → Disable workflow
- or remove cron from `.github/workflows/missions-worker.yml` and push
```

- [ ] **A3.3** Run `git diff docs/RUNBOOK.md` and verify the section appended cleanly.

### Task A4: Stage + commit product-repo docs

- [ ] **A4.1** Stage exactly the doc files (no code, no migrations):

```bash
git add \
  docs/CODEMAPS/architecture.md \
  docs/CODEMAPS/backend.md \
  docs/CODEMAPS/data.md \
  docs/CODEMAPS/dependencies.md \
  docs/CODEMAPS/frontend.md \
  docs/CODEMAPS/runtime-architecture-improvement-plan.md \
  docs/CONTRIBUTING.md \
  docs/ENV.md \
  docs/RUNBOOK.md \
  docs/agent-outputs/STATUS.md \
  .planning/STATE.md
```

- [ ] **A4.2** Run `git status --short` and verify ONLY those 11 files are staged. If anything else slipped in, `git restore --staged <file>` it.
- [ ] **A4.3** Commit:

```bash
git commit -m "$(cat <<'EOF'
docs: sync codemap, runbook, planning state for runtime rebuild close-out

Commits the 9 modified docs that already describe runtime-rebuild + the
new runtime-architecture-improvement-plan + RUNBOOK rollback section
+ STATE.md milestone shift to v2.5.

Spec: docs/superpowers/specs/2026-05-01-runtime-rebuild-close-out-design.md
Plan: docs/superpowers/plans/2026-05-01-runtime-rebuild-close-out.md
EOF
)"
```

- [ ] **A4.4** Verify commit landed: `git log --oneline -1` should show the new commit.
- [ ] **A4.5** Push: `git push origin runtime-rebuild`. Expected: branch advanced by 1 commit.
- [ ] **A4.6** **Track A DONE.** Print to user: `Track A complete — product doc sync committed as <SHA>, pushed to origin/runtime-rebuild. Next: Track E unblocked when Track D done.`

---

## Track B — Ops Repo Doc Sync

**Repo:** `~/Developer/campusnest-ops` on `main`
**Blocks:** Track G (review references ops handoff)
**Blocked by:** none
**Exit criteria:** one commit on `main` containing all ops doc edits + new handoff spec; pushed.

### Task B1: Verify uncommitted ops state

- [ ] **B1.1** `cd ~/Developer/campusnest-ops`
- [ ] **B1.2** Run `git status --short`. Expected:

```
 M AGENTS.md
 M STATUS.md
 M engineering/architecture.md
?? engineering/handoffs/2026-04-15-runtime-rebuild-spec.md
```

Plus possibly `?? .claude/`, `?? .superpowers/`, `?? docs/`, `?? .graphify_*`, `?? .playwright-mcp/` — those are intentionally NOT committed.

- [ ] **B1.3** If the runtime-rebuild handoff file is missing, stop. Otherwise proceed.

### Task B2: Update AGENTS.md frontmatter

**Files:**
- Modify: `AGENTS.md` (frontmatter only)

- [ ] **B2.1** Read AGENTS.md frontmatter. The current `last_updated: 2026-03-13` is stale.
- [ ] **B2.2** Update the frontmatter date:

```yaml
last_updated: 2026-05-01
```

(Leave the rest of the frontmatter intact.)

### Task B3: Append close-out plan summary to sprint goals

**Files:**
- Modify: `sprints/2026-04-runtime-rebuild/goals.md`

- [ ] **B3.1** Append a new section at the end of `sprints/2026-04-runtime-rebuild/goals.md`:

```markdown
## Sprint Close-Out (added 2026-05-01)

A security hardening pass landed locally on top of the runtime rebuild implementation:

- migration `034_harden_security_definer_functions.sql` revokes broad RPC EXECUTE on queue helpers and pins `search_path`
- `/api/missions/run-next` and worker loops now cap public-driven batch / lease values
- conversation message creation accepts only client-side user messages, caps block count + size
- analytics events validate event names + cap metadata size
- `next` pinned and `pnpm.overrides` added for the protobufjs advisory → `pnpm audit --audit-level moderate` is clean

Close-out plan (5 calendar days, 4-day buffer in the 9-day window):

- Day 1 — commit + push docs across both repos; resolve feature flag + stale tests; configure Codex review (gpt-5.5 high); add migration rollback to product RUNBOOK; update Notion Execution Log + Roadmap
- Day 2 — commit code in three logical commits (security, deps, lint); push branch; open draft PR; apply migrations 032/033/034 to STAGING
- Day 3 — run 4 golden flows on staging; pick worker host (recommend GH Actions stopgap); apply migrations to PROD; mark PR ready
- Day 4 — three-way parallel review (code-reviewer + security-reviewer + Codex); merge to main; Vercel auto-deploy; 4-6h soak watch with explicit rollback triggers
- Day 5 — fix-forward buffer; sprint retrospective at `sprints/2026-04-runtime-rebuild/retrospective.md`

Definition of done: product spec section 6 (`docs/superpowers/specs/2026-05-01-runtime-rebuild-close-out-design.md` in product repo).

Deferred to next sprint: Phase 0 timing instrumentation, focused route tests for hardened APIs, replacing transitive overrides with direct upgrades, Oracle VM worker, exploratory branch triage.
```

### Task B4: Stage + commit ops docs

- [ ] **B4.1** Stage:

```bash
git add \
  AGENTS.md \
  STATUS.md \
  engineering/architecture.md \
  engineering/handoffs/2026-04-15-runtime-rebuild-spec.md \
  sprints/2026-04-runtime-rebuild/goals.md
```

- [ ] **B4.2** Run `git status --short` and verify only those 5 files are staged.
- [ ] **B4.3** Commit:

```bash
git commit -m "$(cat <<'EOF'
docs: runtime rebuild progress + sprint close-out plan

Commits the runtime-rebuild status update across STATUS, architecture
overview, and the runtime-rebuild handoff spec; appends a close-out
plan summary to the active sprint goals.

Product repo spec: docs/superpowers/specs/2026-05-01-runtime-rebuild-close-out-design.md
Product repo plan: docs/superpowers/plans/2026-05-01-runtime-rebuild-close-out.md
EOF
)"
```

- [ ] **B4.4** Push: `git push origin main`.
- [ ] **B4.5** **Track B DONE.** Print to user: `Track B complete — ops doc sync committed as <SHA>, pushed to origin/main.`

---

## Track C — Codex Review Config + Memory + Notion

**Repos:** product + ops + auto-memory + Notion (external)
**Blocks:** Track G (review uses Codex with new model)
**Blocked by:** none
**Exit criteria:** Codex CLI + pre-push hook run on `gpt-5.5` `high`; MEMORY.md updated; Notion Execution Log + Roadmap reflect runtime-rebuild in flight.

### Task C1: Locate + inspect current Codex config

- [ ] **C1.1** Run `which codex && codex --version`. Expected: `/Users/aineshmohan/.nvm/versions/node/v24.14.0/bin/codex` and a version >= 0.114.0.
- [ ] **C1.2** Run `ls -la ~/.codex/ 2>/dev/null || echo "no ~/.codex"`. If `config.toml` exists, read it.
- [ ] **C1.3** Run `cat .husky/pre-push 2>/dev/null` (in product repo) to see the current Codex review hook.
- [ ] **C1.4** Run `codex --help 2>&1 | head -40` to confirm the flags for `--model` and `--reasoning-effort` (or equivalent). The exact identifier for "gpt-5.5 high reasoning" may be `gpt-5-codex` + `--reasoning-effort high`, or a model alias the CLI accepts. Capture the canonical form.
- [ ] **C1.5** **If `gpt-5.5` is not a recognized model alias:** use the highest-reasoning `gpt-5.x` available (typical aliases: `gpt-5-codex`, `gpt-5-pro`). Document the actual identifier chosen so the user can confirm.

### Task C2: Persist Codex config

**Files:**
- Create or modify: `~/.codex/config.toml` (user-level) AND/OR a repo-local `codex.toml` if the project already uses one

- [ ] **C2.1** If `~/.codex/config.toml` does not exist, create it with:

```toml
# Codex CLI default config
# Pinned 2026-05-01 to match CribAI sprint review profile.
model = "gpt-5.5"
reasoning_effort = "high"
```

If `gpt-5.5` was not a valid identifier in C1.4, substitute the chosen one.

- [ ] **C2.2** If the file already exists, edit only the `model` and `reasoning_effort` keys; leave everything else.
- [ ] **C2.3** Verify by running a no-op review: `codex review --uncommitted --dry-run 2>&1 | head -20` (or equivalent dry-run flag). Confirm the model + effort are reported in the startup banner.

### Task C3: Update pre-push hook to use the configured profile

**Files:**
- Modify: `.husky/pre-push` (product repo)

- [ ] **C3.1** Read `.husky/pre-push`.
- [ ] **C3.2** If the hook hardcodes a different `--model` or `--reasoning-effort` flag, remove those flags so the hook picks up the user-level config from C2. Keep all other behavior intact.
- [ ] **C3.3** If the hook does not yet exist or does not invoke Codex, leave it alone and instead document that `~/.codex/config.toml` is the canonical config (Task C5).

### Task C4: Update auto-memory MEMORY.md

**Files:**
- Modify: `~/.claude/projects/-Users-aineshmohan-Developer-ai-real-estate-agent/memory/MEMORY.md`

- [ ] **C4.1** Read the current MEMORY.md. Note the section `## v2.0 Status (as of 2026-03-13)` and the line `**Current sprint**: Summer Sublease Launch (Mar 14-27, 2026)`.
- [ ] **C4.2** Replace the `## v2.0 Status` heading line and its body with two replacement sections (paste in this order, after `## Architecture Decisions (current)` and before `## Known Blockers`):

```markdown
## v2.0 Status (deployed prod baseline)
- All 5 v2.0 phases shipped 2026-03-19 (MissionExecutor, 13 tools, HITL, chat-to-mission bridge, server-side persistence, sublease marketplace)
- Post-v2.0 polish through 2026-03-24 (14 commits)
- This is what's currently live on Vercel + prod Supabase

## v2.5 Runtime Rebuild (in flight — sprint 2026-04-15 → 2026-05-10)
- Local commit: `runtime-rebuild` at `ac20a90` (spec) on top of `daa268e`
- State-centric runtime: durable `conversation_state`, typed `ToolResult`, queued mission execution, viewport-driven explore
- Migrations `032_conversation_state.sql`, `033_mission_runtime_queue.sql`, `034_harden_security_definer_functions.sql` — NOT yet applied to staging or prod
- Security hardening pass landed locally (uncommitted at design time): bounded worker batches, capped public write surfaces, pinned next + pnpm.overrides
- Active spec: `docs/superpowers/specs/2026-05-01-runtime-rebuild-close-out-design.md`
- Active plan: `docs/superpowers/plans/2026-05-01-runtime-rebuild-close-out.md`
- Ops sprint: `~/Developer/campusnest-ops/sprints/2026-04-runtime-rebuild/goals.md`
- Worker host: GitHub Actions stopgap (Oracle A1 capacity blocked in `us-chicago-1`)
- Codex review pinned to `gpt-5.5` + `reasoning-effort: high`
```

- [ ] **C4.3** Replace `**Current sprint**: Summer Sublease Launch (Mar 14-27, 2026)` (under "Ops Repo (Cross-Reference)") with `**Current sprint**: Runtime Rebuild (Apr 15 - May 10, 2026)`.
- [ ] **C4.4** Verify by running `head -100 ~/.claude/projects/-Users-aineshmohan-Developer-ai-real-estate-agent/memory/MEMORY.md` (or equivalent) and confirming both replacements look right. (Auto-memory files are not git-tracked; no commit needed.)

### Task C5: Document Codex config in CONTRIBUTING.md

**Files:**
- Modify: `docs/CONTRIBUTING.md` (product repo)

- [ ] **C5.1** Read CONTRIBUTING.md. Find the "Code Review" or equivalent section.
- [ ] **C5.2** Add or update a subsection:

```markdown
### Codex Second-Opinion Review

The `.husky/pre-push` hook runs `codex review --uncommitted` automatically. Codex CLI reads `~/.codex/config.toml` for defaults. Project standard:

```toml
model = "gpt-5.5"
reasoning_effort = "high"
```

(If `gpt-5.5` is not a valid alias on your CLI version, substitute the highest-reasoning `gpt-5.x` available and note the substitution in PRs.)

Manual on-demand review: `codex review --base main`.
```

- [ ] **C5.3** **Note:** this CONTRIBUTING.md change is bundled into the Track A commit (Task A4). If Track A has already shipped, make a small follow-up commit `docs: document Codex review config`.

### Task C6: Notion Execution Log + Roadmap update

**External system; no file edits.** Done by user or by a Claude session with Notion MCP access.

- [ ] **C6.1** Open the Notion Execution Log: https://www.notion.so/32131649222681518070e8d10afb8b80
- [ ] **C6.2** Add entry: "Runtime Rebuild implementation summary (2026-04-22)" — link the ops handoff `engineering/handoffs/2026-04-15-runtime-rebuild-spec.md` and product spec `docs/superpowers/specs/2026-05-01-runtime-rebuild-close-out-design.md`. Body: list the four workstreams + what landed.
- [ ] **C6.3** Add entry: "Runtime Rebuild security hardening + 5-day close-out plan (2026-05-01)" — list migration 034, the four route hardenings, dep audit clearance, plus the day-by-day plan summary.
- [ ] **C6.4** Open Notion Roadmap: https://www.notion.so/3213164922268172aacfc42d35f3a96b. Mark Runtime Rebuild status as "In flight" with target date 2026-05-10.
- [ ] **C6.5** **Track C DONE.** Print to user: `Track C complete — Codex on <model> <effort>, MEMORY updated, CONTRIBUTING updated (bundled with A4 if A not yet committed), Notion entries posted.`

---

## Track D — Code Hygiene Decisions

**Repo:** product on `runtime-rebuild`
**Blocks:** Track E
**Blocked by:** none
**Exit criteria:** feature flag stance recorded; 5 stale concierge tests have an explicit fix/skip/delete decision; resolution committed (or explicitly marked for inclusion in Track E commits).

### Task D1: Feature flag investigation (gap 5)

- [ ] **D1.1** Grep for runtime gating:

```bash
grep -rn "FEATURE_RUNTIME\|featureFlag\|FEATURE_FLAG\|runtimeRebuild\|process\.env\.RUNTIME" \
  apps/web/app/api/ai/cribai \
  packages/ai/src/cribai.ts \
  packages/ai/src/runtime 2>/dev/null
```

- [ ] **D1.2** Read `apps/web/app/api/ai/cribai/route.ts` and `packages/ai/src/cribai.ts` to confirm whether the deterministic runtime is unconditionally invoked or behind a flag.
- [ ] **D1.3** Decision tree:
  - **If always-on:** decide whether to add a flag now or accept full blast radius. Recommend: ship always-on but be ready to roll back via deploy revert (no quick toggle). Document in RUNBOOK.
  - **If already gated:** confirm the env var name + default value. Document in RUNBOOK + spec acceptance.
- [ ] **D1.4** Append the decision to `docs/RUNBOOK.md` under the "Runtime Rebuild Migration Rollback" section added in A3. Add subsection:

```markdown
### Feature flag stance

Decided 2026-05-01: <ALWAYS-ON | GATED via env var `FEATURE_RUNTIME_REBUILD` default `true`>

Rationale: <one-line>
Rollback path if behavior is wrong in prod: <deploy revert | toggle env var on Vercel + Supabase>
```

- [ ] **D1.5** This RUNBOOK edit is bundled into Track A's commit (Task A4). If A already shipped, commit as `docs(runbook): record runtime-rebuild feature flag stance`.

### Task D2: Stale concierge tests resolution (gap 6)

- [ ] **D2.1** Run the failing suite:

```bash
pnpm -C apps/web test -- --passWithNoTests 2>&1 | tee /tmp/concierge-test-output.txt
```

- [ ] **D2.2** From the output, list the 5 failing test names (file path + describe + it). Reviewer noted they look like assertions for older Mission UI tab behavior.
- [ ] **D2.3** For EACH failing test, decide and apply ONE of:
  - **(a) Update assertion** to match new Mission UI behavior — if the test describes a real, still-valid user-facing behavior, just with a stale selector or string.
  - **(b) `.skip` with TODO** — if the test describes behavior that needs a follow-up redesign. Format:
    ```ts
    it.skip('describe me', () => { /* TODO(2026-05-runtime-rebuild): rewrite for queued Mission UI */ });
    ```
  - **(c) Delete** — if the test asserts behavior that no longer exists.
- [ ] **D2.4** No "investigate later" — every test must end this task with a stance applied.
- [ ] **D2.5** Re-run: `pnpm -C apps/web test -- --passWithNoTests`. Expected: 0 failures.
- [ ] **D2.6** Stage + bundle into Track E's first commit (Task E1) — these test edits ride with the security commit since they unblock CI for the same PR.

### Task D3: Track D exit

- [ ] **D3.1** **Track D DONE.** Print to user:
  ```
  Track D complete — feature flag stance: <decision>, 5 concierge tests resolved (<n_fixed> fixed, <n_skipped> skipped, <n_deleted> deleted). Track E unblocked.
  ```

---

## Track E — Code Commits + PR Push

**Repo:** product on `runtime-rebuild`
**Blocks:** Track F
**Blocked by:** Tracks A, C5 (CONTRIBUTING), D
**Exit criteria:** three logical commits pushed; draft PR opened against `main`.

### Task E1: Security commit

**Files:**
- Modify: `apps/web/app/api/conversations/[id]/messages/route.ts`
- Modify: `apps/web/app/api/events/route.ts`
- Modify: `apps/web/app/api/missions/run-next/route.ts`
- Modify: `packages/ai/src/missions/worker.ts`
- Modify: `packages/ai/src/missions/worker-loop.ts`
- Modify: `packages/ai/src/missions/__tests__/executor.test.ts`
- Modify: `supabase/migrations/033_mission_runtime_queue.sql`
- Create: `supabase/migrations/034_harden_security_definer_functions.sql`
- Modify: 5 component files from D2 (the resolved concierge tests)

- [ ] **E1.1** Stage:

```bash
git add \
  apps/web/app/api/conversations/[id]/messages/route.ts \
  apps/web/app/api/events/route.ts \
  apps/web/app/api/missions/run-next/route.ts \
  packages/ai/src/missions/worker.ts \
  packages/ai/src/missions/worker-loop.ts \
  packages/ai/src/missions/__tests__/executor.test.ts \
  supabase/migrations/033_mission_runtime_queue.sql \
  supabase/migrations/034_harden_security_definer_functions.sql
```

Then stage the D2 test edits (file list depends on D2 outcome).

- [ ] **E1.2** Verify staged: `git status --short`. The Link-replacement component files (cribai-chat.tsx, MessagesPageClient.tsx, MissionLauncher.tsx, MyListings.tsx, ProfilePageClient.tsx) should NOT be staged — they go in E3.
- [ ] **E1.3** Commit:

```bash
git commit -m "$(cat <<'EOF'
fix(security): harden SECURITY DEFINER RPCs + cap public write surfaces

- migration 034: revoke broad EXECUTE on claim_next_mission and other
  queue helpers, pin search_path to prevent injection
- /api/missions/run-next: cap batch size and lease duration so admin
  inputs cannot create oversized claims
- mission worker.ts + worker-loop.ts: bound batch processing and lease
  refresh intervals
- /api/conversations/:id/messages: accept only client-created user
  messages, cap block count + size
- /api/events: validate event names against allowlist, cap metadata
  size to prevent log flooding
- migration 033: minor edit alongside 034 hardening

Also resolves 5 stale concierge UI tests (see PR body for stance per test).

Refs: docs/superpowers/specs/2026-05-01-runtime-rebuild-close-out-design.md
EOF
)"
```

### Task E2: Dependency hygiene commit

**Files:**
- Modify: `package.json` (root)
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **E2.1** Stage:

```bash
git add package.json apps/web/package.json pnpm-lock.yaml
```

- [ ] **E2.2** Verify staged: `git status --short` shows only those three.
- [ ] **E2.3** Commit:

```bash
git commit -m "$(cat <<'EOF'
chore(deps): pin next + add pnpm.overrides for protobufjs advisory

Clears pnpm audit (was 48 issues including a critical protobufjs CVE).
Isolates dep churn from product code so reviewers can read each
commit independently.

Refs: docs/superpowers/specs/2026-05-01-runtime-rebuild-close-out-design.md
EOF
)"
```

### Task E3: Lint fix commit

**Files:**
- Modify: `apps/web/components/cribai-chat.tsx`
- Modify: `apps/web/components/messages/MessagesPageClient.tsx`
- Modify: `apps/web/components/messages/MissionLauncher.tsx`
- Modify: `apps/web/components/profile/MyListings.tsx`
- Modify: `apps/web/components/profile/ProfilePageClient.tsx`

- [ ] **E3.1** Stage exactly those 5:

```bash
git add \
  apps/web/components/cribai-chat.tsx \
  apps/web/components/messages/MessagesPageClient.tsx \
  apps/web/components/messages/MissionLauncher.tsx \
  apps/web/components/profile/MyListings.tsx \
  apps/web/components/profile/ProfilePageClient.tsx
```

- [ ] **E3.2** Verify staged: `git status --short` shows only those 5.
- [ ] **E3.3** Commit:

```bash
git commit -m "chore: replace internal anchor links with next/link"
```

### Task E4: Pre-push verification

- [ ] **E4.1** Run the reviewer's full verification, in this order:

```bash
pnpm -C apps/web lint
pnpm -C apps/web typecheck
pnpm -C apps/web build
pnpm -C apps/web test -- --passWithNoTests
pnpm -C packages/ai typecheck
pnpm -C packages/ai build
pnpm -C packages/ai test
pnpm -C services/scraper typecheck
pnpm -C services/scraper test
pnpm -C packages/types test
pnpm -C packages/types build
pnpm -C packages/utils test
pnpm -C packages/utils typecheck
pnpm audit --audit-level moderate
```

- [ ] **E4.2** All must pass. If any fails, stop and surface to user. The 5 stale tests should now be green per Track D.

### Task E5: Push + open draft PR

- [ ] **E5.1** Verify working tree clean: `git status` should show "nothing to commit".
- [ ] **E5.2** Push: `git push origin runtime-rebuild`. Pre-push hook will run Codex review (now on gpt-5.5 high). Read findings; if any are blocking, address before continuing.
- [ ] **E5.3** Open draft PR:

```bash
gh pr create --draft --base main --head runtime-rebuild --title "Runtime rebuild + security pass: state-centric runtime, queued missions, viewport explore" --body "$(cat <<'EOF'
## Summary

Ships the runtime-rebuild sprint (2026-04-15 → 2026-05-10) plus a security hardening pass.

**Workstreams**
- Conversation engine — durable `conversation_state` (migration 032), deterministic chat runtime, typed `ToolResult.machineData/statePatch`
- Tool contracts — typed machine outputs for chat-critical tools
- Mission runtime — queued execution with leases/heartbeats/retries (migration 033), worker entrypoints, GH Actions stopgap
- Explore/search — viewport API, search API, public listing detail API, featured-only initial boot

**Security pass**
- Migration 034 hardens `SECURITY DEFINER` RPCs (revoke broad EXECUTE, pin search_path)
- `/api/missions/run-next` + worker batches bounded
- `/api/conversations/:id/messages` and `/api/events` validate + cap public input
- `pnpm audit` clean (was 48 issues including critical protobufjs)

**Docs**
- product: spec + plan + RUNBOOK rollback section + STATE.md milestone shift to v2.5
- ops: STATUS, architecture, handoff spec, sprint goals close-out

## Test plan

- [ ] all package builds pass (`pnpm -C apps/web build`, etc.)
- [ ] type checks pass (apps/web, packages/ai, services/scraper)
- [ ] unit tests pass (packages/ai, packages/types, packages/utils)
- [ ] `pnpm audit --audit-level moderate` clean
- [ ] migrations 032/033/034 apply cleanly to STAGING Supabase
- [ ] golden flow: search → compare → detail → tour
- [ ] golden flow: listing CTA → follow-up → deep dive mission
- [ ] golden flow: chat search → map sync → refine → compare top 2
- [ ] golden flow: mission approval → resume → completion
- [ ] migrations applied to PROD Supabase
- [ ] 4-6h soak watch with rollback triggers (queue stall >30min OR chat err rate >5%)

Spec: `docs/superpowers/specs/2026-05-01-runtime-rebuild-close-out-design.md`
Plan: `docs/superpowers/plans/2026-05-01-runtime-rebuild-close-out.md`
Ops handoff: `~/Developer/campusnest-ops/engineering/handoffs/2026-04-15-runtime-rebuild-spec.md`
EOF
)"
```

- [ ] **E5.4** Capture PR URL from gh output. Print to user.
- [ ] **E5.5** **Track E DONE.** Print to user: `Track E complete — 3 commits pushed (security <SHA>, deps <SHA>, lint <SHA>), draft PR opened at <URL>. Track F unblocked.`

---

## Track F — Migrations + Golden Flows + Worker Host

**External:** Supabase staging + prod, GitHub Actions worker workflow
**Blocks:** Track G
**Blocked by:** Track E
**Exit criteria:** migrations applied to prod; 4 golden flows pass on staging (and re-run on prod post-merge); worker host live or documented stopgap.

### Task F1: Stage migration application

- [ ] **F1.1** Confirm staging Supabase project exists. If not, create a Supabase Branch or a separate dev project. Capture the project ref (`sbp_xxx`).
- [ ] **F1.2** Link CLI: `supabase link --project-ref <staging-ref>`.
- [ ] **F1.3** Apply: `supabase db push`. Expected output: 3 new migrations applied (032, 033, 034).
- [ ] **F1.4** Run RUNBOOK verification queries (Task A3.2 "Verification queries (post-apply)") in the staging SQL editor. All must pass.
- [ ] **F1.5** If any fail, execute the rollback (RUNBOOK "Rollback order (REVERSE)") and stop.

### Task F2: Golden flow verification (staging)

- [ ] **F2.1** Point local dev or a staging frontend at the staging Supabase project (env vars).
- [ ] **F2.2** Create a new ops repo handoff: `~/Developer/campusnest-ops/engineering/handoffs/2026-05-01-golden-flow-verification.md` with frontmatter:

```yaml
---
title: "Runtime Rebuild Golden Flow Verification"
type: engineering
status: active
last_updated: 2026-05-01
dependencies:
  - engineering/handoffs/2026-04-15-runtime-rebuild-spec.md
  - sprints/2026-04-runtime-rebuild/goals.md
---

# Golden Flow Verification — Runtime Rebuild

## Environment
- Frontend: <local | staging deploy URL>
- Supabase: staging project <ref>
- Migrations applied: 032, 033, 034
```

- [ ] **F2.3** Run flow 1: **search → compare → detail → tour**.
  - search query: "1br under $1500 near union"
  - compare top 2 results
  - open detail for one
  - request tour
  - record: pass/fail, tool calls used, deterministic vs fallback, anomalies
- [ ] **F2.4** Run flow 2: **listing CTA → follow-up → deep-dive mission**.
  - open a listing detail
  - click "Ask AI about this listing"
  - ask a follow-up that should trigger a deep-dive mission
  - record
- [ ] **F2.5** Run flow 3: **chat search → map sync → refine → compare top 2**.
  - chat search
  - verify map syncs to results
  - refine budget mid-conversation
  - compare top 2
  - record
- [ ] **F2.6** Run flow 4: **mission approval → resume → completion**.
  - propose a mission via chat
  - approve (HITL)
  - verify worker claims and completes
  - record
- [ ] **F2.7** Append all results to the handoff file. Commit + push the ops repo:

```bash
cd ~/Developer/campusnest-ops
git add engineering/handoffs/2026-05-01-golden-flow-verification.md
git commit -m "docs(handoff): runtime rebuild golden flow verification on staging"
git push origin main
```

- [ ] **F2.8** **If any flow fails**, stop. File the failure as a bug, fix in product repo, push to PR, re-run from F2.1.

### Task F3: Worker host decision

- [ ] **F3.1** Recommend GH Actions stopgap. Verify `.github/workflows/missions-worker.yml` is on `runtime-rebuild`:

```bash
cd ~/Developer/ai-real-estate-agent
cat .github/workflows/missions-worker.yml | head -40
```

- [ ] **F3.2** Confirm the workflow has a cron schedule (or document that it's `workflow_dispatch` only and the user will trigger manually).
- [ ] **F3.3** Append to `~/Developer/campusnest-ops/operations/infrastructure.md`:

```markdown
## Mission Worker Host (decided 2026-05-01)

Active: GitHub Actions workflow `.github/workflows/missions-worker.yml` (runtime-rebuild branch → main after merge). Stopgap until Oracle A1 capacity opens.

Oracle path:
- Tenancy currently subscribed only to `us-chicago-1`
- `VM.Standard.A1.Flex` `1 OCPU / 6 GB` returned `OUT_OF_HOST_CAPACITY` in all three Chicago ADs as of 2026-04-22
- Retry plan: subscribe a second region (Ashburn) or wait for Chicago capacity. Manual capacity probe weekly.
- Network already provisioned: `worker-vcn`, `worker-public-subnet`, IGW, default route, SSH ingress, `~/.ssh/oracle-worker` key pair
- Once VM exists: install Node/pnpm/git, clone repo, env vars, `pnpm worker:missions -- --once`, then add cron

Fallback: paid managed worker (Render, Fly, Railway) if free tier remains blocked beyond next sprint.
```

- [ ] **F3.4** Commit + push:

```bash
cd ~/Developer/campusnest-ops
git add operations/infrastructure.md
git commit -m "docs(ops): record worker host decision — GH Actions stopgap, Oracle deferred"
git push origin main
```

### Task F4: Production migration

- [ ] **F4.1** Confirm prod Supabase project ref. Link CLI: `supabase link --project-ref <prod-ref>`.
- [ ] **F4.2** Take a snapshot/backup if not automatic. Confirm with user before proceeding.
- [ ] **F4.3** Apply: `supabase db push`. Expected: 3 migrations applied.
- [ ] **F4.4** Run RUNBOOK verification queries in prod SQL editor. All must pass.
- [ ] **F4.5** If any fail, execute rollback and stop.
- [ ] **F4.6** Mark PR ready for review:

```bash
cd ~/Developer/ai-real-estate-agent
gh pr ready <PR#>
```

- [ ] **F4.7** **Track F DONE.** Print to user: `Track F complete — staging verified (4/4 golden flows), worker host: GH Actions, prod migrations applied, PR ready for review. Track G unblocked.`

---

## Track G — Review + Merge + Deploy

**Repo:** product
**Blocks:** Track H
**Blocked by:** Track F
**Exit criteria:** PR merged, Vercel deploy live, soak watch completed without rollback trigger.

### Task G1: Three-way parallel review

- [ ] **G1.1** Dispatch three reviewers in parallel (single message, multiple Agent tool calls):
  - `code-reviewer` agent on the diff `runtime-rebuild..main`
  - `security-reviewer` agent on the diff
  - `codex review --base main` (already on gpt-5.5 high per Track C)
- [ ] **G1.2** Collect findings from all three.
- [ ] **G1.3** **Surface conflicts explicitly.** Per memory rule, never silently switch when reviewers disagree — document each conflict and the chosen resolution in PR comments.
- [ ] **G1.4** Address findings. CRITICAL/HIGH must be fixed before merge. Push fix commits to `runtime-rebuild`.

### Task G2: Merge + deploy

- [ ] **G2.1** Confirm CI green on PR.
- [ ] **G2.2** Merge:

```bash
gh pr merge <PR#> --squash --delete-branch=false
```

(Use `--squash` to keep main history clean; do NOT delete the runtime-rebuild branch yet — retain it for hotfix lineage.)

- [ ] **G2.3** Verify Vercel auto-deploys: check deploy log + production URL.

### Task G3: Soak watch (4-6 hours)

- [ ] **G3.1** Open monitoring tabs:
  - Vercel runtime logs (errors, latency)
  - Supabase logs (DB errors, slow queries)
  - mission queue depth: `SELECT status, count(*) FROM missions GROUP BY status;`
  - chat error rate: filter Vercel `/api/ai/cribai` 5xx responses
- [ ] **G3.2** Set rollback triggers (RUNBOOK):
  - mission queue stall >30 min (no `running` → `completed` transitions, depth growing)
  - chat error rate >5% over a 30-min window
- [ ] **G3.3** If a trigger fires:
  1. Vercel rollback to pre-merge deploy
  2. Run migration rollback queries from RUNBOOK (034 → 033 → 032)
  3. Surface to user, file incident notes in `~/Developer/campusnest-ops/engineering/handoffs/2026-05-XX-incident-runtime-rebuild.md`
- [ ] **G3.4** After 4-6 hours clean, declare deploy stable.
- [ ] **G3.5** **Track G DONE.** Print to user: `Track G complete — merged as <SHA>, Vercel deploy live, soak window <duration> clean. Track H next.`

---

## Track H — Retrospective + Cleanup

**Repo:** ops
**Blocks:** sprint close
**Blocked by:** Track G
**Exit criteria:** retrospective written; deferred items recorded; sprint marked closed in ops.

### Task H1: Sprint retrospective

**Files:**
- Create: `~/Developer/campusnest-ops/sprints/2026-04-runtime-rebuild/retrospective.md`

- [ ] **H1.1** Create the file with frontmatter:

```yaml
---
title: "Sprint Retrospective: Runtime Rebuild"
type: sprint
status: closed
start_date: 2026-04-15
end_date: <actual end date>
last_updated: <today>
---
```

- [ ] **H1.2** Body sections:
  - **What shipped** (workstreams 1-4 + security pass; reference merge SHA)
  - **What slipped** (Phase 0 instrumentation, Oracle VM, others)
  - **The 6 gaps and how they were closed**
  - **Decisions made** (worker host, feature flag, gpt-5.5 high, stale-test stance per test)
  - **Decisions deferred to next sprint** (route tests, dep direct-upgrades, instrumentation, Oracle, branch triage)
  - **Numbers** (commits, files, lines, migration count, golden flow pass rate, soak window)

- [ ] **H1.3** Commit + push:

```bash
cd ~/Developer/campusnest-ops
git add sprints/2026-04-runtime-rebuild/retrospective.md
git commit -m "docs(retro): runtime rebuild sprint close"
git push origin main
```

### Task H2: Update STATUS.md to closed

- [ ] **H2.1** Modify `~/Developer/campusnest-ops/STATUS.md` frontmatter `next_session_priority` to point at the next sprint focus (TBD with user). Update the body to reflect runtime-rebuild as completed.
- [ ] **H2.2** Commit + push: `git commit -am "docs(status): runtime rebuild sprint closed" && git push origin main`.

### Task H3: Update product STATE.md

- [ ] **H3.1** In product repo on `main` (post-merge), update `.planning/STATE.md`:
  - `status: completed`
  - update `progress.completed_plans: 1`, `percent: 100`
  - body: "v2.5 Runtime Rebuild — SHIPPED <date>"
- [ ] **H3.2** Commit:

```bash
git checkout main && git pull
# edit STATE.md
git add .planning/STATE.md
git commit -m "chore(state): runtime rebuild milestone complete"
git push origin main
```

### Task H4: Final Notion update

- [ ] **H4.1** Add Notion Execution Log entry: "Runtime Rebuild merged + deployed (<date>)".
- [ ] **H4.2** Mark Notion Roadmap Runtime Rebuild as "Shipped".
- [ ] **H4.3** **Track H DONE.** **SPRINT CLOSED.** Print to user.

---

## Cross-Track Checkpoints

At the end of each day, verify:

**End of Day 1:**
- [ ] both repos have a doc-sync commit pushed (Track A SHA, Track B SHA)
- [ ] MEMORY.md reflects v2.5 in flight
- [ ] Codex CLI on gpt-5.5 high (or substitute, with note)
- [ ] feature flag stance recorded in RUNBOOK
- [ ] 5 stale tests resolved
- [ ] Notion entries posted

**End of Day 2:**
- [ ] 3 code commits pushed; draft PR exists
- [ ] all package builds + tests + audit green
- [ ] migrations applied to STAGING

**End of Day 3:**
- [ ] 4 golden flows passed on staging (logged in ops handoff)
- [ ] worker host decision recorded
- [ ] migrations applied to PROD
- [ ] PR ready for review

**End of Day 4:**
- [ ] three reviewers ran in parallel; findings addressed
- [ ] PR merged; Vercel deploy live
- [ ] 4-6h soak window clean

**End of Day 5:**
- [ ] retrospective written; STATUS.md + STATE.md updated to closed; Notion final

---

## Rollback Quick Reference

Documented in detail in product `docs/RUNBOOK.md` after Task A3. High-level:

- **Migration rollback:** REVERSE order — 034 → 033 → 032 (drop functions, columns, table additions). Verification queries in RUNBOOK.
- **Deploy rollback:** Vercel UI → previous deploy → "Promote to Production". Confirm runtime-rebuild SHA is no longer live.
- **Worker stop:** disable `.github/workflows/missions-worker.yml` via GH Actions UI.
- **Triggers:** mission queue stall >30 min OR chat error rate >5%.

---

## Self-Review Notes

Applied 2026-05-01 against the spec:

1. **Spec coverage check:**
   - Spec §2 Goal → Track G2/G3/H DoD
   - Spec §3 Non-goals → H1 deferred items
   - Spec §4.Day1 (gaps 2,3,4,5,6,7) → Tracks A,B,C,D
   - Spec §4.Day2 → Track E
   - Spec §4.Day3 → Track F.1-F.4
   - Spec §4.Day4 → Track G
   - Spec §4.Day5 → Track H
   - Spec §5 Cross-repo sync → Tracks A + B + C + F2.7 + F3.4
   - Spec §6 DoD → cross-track checkpoints
   - Spec §7 Rollback → RUNBOOK section in A3 + quick reference here
   - Spec §8 Risks → mitigations woven throughout (e.g., F2.8 fail-stop, G3.3 trigger response)
   - Spec §9 Deferred → H1.2

2. **Placeholder scan:** clean. Decision-pending items (e.g., feature flag stance, stale-test specifics, worker host details, sprint end date) are explicitly Day 1 actions, not unfilled blanks.

3. **Type/identifier consistency:** migration filenames (032/033/034) consistent across all tasks. PR base branch `main` consistent. Codex model identifier `gpt-5.5` is the user-specified target with documented substitution path (Task C1.5).
