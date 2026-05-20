---
title: Runtime Rebuild Sprint Close-Out — Codex Handoff
date: 2026-05-13
from_session: claude (opus 4.7)
branch: runtime-rebuild
head_sha: cd1a29f
related:
  - docs/superpowers/specs/2026-05-01-runtime-rebuild-close-out-design.md
  - docs/superpowers/plans/2026-05-01-runtime-rebuild-close-out.md
---

# Handoff: Finish Runtime Rebuild Close-Out

Claude session ran Tracks A–E (and C subset) of the close-out plan. Branch is fully pushed, PR #49 exists as draft, audit is clean. Picking up at **Track F**.

## Repo + branch state

- Product repo: `/Users/aineshmohan/Developer/ai-real-estate-agent` on `runtime-rebuild`
- Local HEAD: `cd1a29f chore(deps): bump overrides + next for fresh CVEs`
- `origin/runtime-rebuild` in sync with HEAD (push completed; Codex pre-push review passed)
- PR: **#49** draft against `main`, title "Runtime rebuild + security pass: state-centric runtime, queued missions, viewport explore"
- Working tree clean except for ignored dirs (`.worktrees/`, `graphify-out/`)
- Remote URL note: `git remote -v` still says `campusnest.git`; remote returns redirect to `cribai.git`. Push still works. Update with `git remote set-url origin https://github.com/aineshm/cribai.git` when convenient.
- Other worktrees on this machine: `agent-fix-diy-v2` (orphan, 1 commit ahead of main, irrelevant) and `feature/python-agent-service` (3 unpushed commits, alternative architecture, NOT part of this sprint). Lisbon worktree was deleted this session.

## What is done (do NOT redo)

| Track | Status | Evidence |
|---|---|---|
| **A** Product doc sync | ✅ committed + pushed | `af8d60a` |
| **B** Ops doc sync | ✅ committed + pushed | `9a1429e` on ops `main` (`~/Developer/campusnest-ops`) |
| **C2** Codex config (`gpt-5.5` `high`) | ✅ done | `~/.codex/config.toml` set |
| **C4** MEMORY.md updated | ✅ done | shows v2.5 in flight |
| **C5** CONTRIBUTING.md Codex section | ✅ done | bundled in A4 commit |
| **C6** Notion entries | ❌ explicitly skipped by user this session | do not attempt |
| **D1** Feature flag stance | ✅ committed | `cbea23d`, recorded in RUNBOOK |
| **D2** Stale concierge tests | ✅ committed | `401a104` |
| **E1** Security commit | ✅ pushed | `d4f211c` |
| **E2** Deps commit (initial) | ✅ pushed | `617d62d` |
| **E3** Lint commit | ✅ pushed | `46994da` |
| **E4** Pre-push verification | ✅ green this session | typecheck/build/test all pass; audit clean after `cd1a29f` |
| **E5** Push + draft PR | ✅ done | PR #49 draft |
| **Follow-up** Audit drift fix | ✅ pushed | `cd1a29f` — bumped protobufjs, ip-address (new), next 16.2.6, axios, basic-ftp, hono, fast-uri |

## What is NOT done (pick up here)

In dependency order:

### Track F1 — Apply migrations 032/033/034 to STAGING Supabase
Needs: a staging project ref. Plan says "if staging Supabase project does not exist, create a Supabase Branch or a separate dev project."

Migrations on disk:
- `supabase/migrations/032_conversation_state.sql`
- `supabase/migrations/033_mission_runtime_queue.sql`
- `supabase/migrations/034_harden_security_definer_functions.sql`

Apply via:
```bash
supabase link --project-ref <staging-ref>
supabase db push
```

Verification queries are in `docs/RUNBOOK.md` under the "Runtime Rebuild Migration Rollback" section (added this sprint). Run them in the Supabase SQL editor after `db push`.

### Track F2 — 4 golden flows on staging
See plan tasks F2.3–F2.7. Create handoff `~/Developer/campusnest-ops/engineering/handoffs/2026-05-01-golden-flow-verification.md` (frontmatter template in plan F2.2). Flows:
1. search → compare → detail → tour
2. listing CTA → follow-up → deep-dive mission
3. chat search → map sync → refine → compare top 2
4. mission approval → resume → completion

### Track F3 — Worker host doc in ops repo
Decision: **GH Actions stopgap** (already in `.github/workflows/missions-worker.yml`). Append the section in plan task F3.3 to `~/Developer/campusnest-ops/operations/infrastructure.md` and commit/push on ops `main`.

### Track F4 — Apply migrations to PROD Supabase
After F2 passes. Same `supabase link` + `db push` against prod ref. Then `gh pr ready 49`.

### Track G — Review + merge + deploy + soak
G1 dispatches three reviewers in parallel: `code-reviewer` agent, `security-reviewer` agent, and `codex review --base main`. Codex already ran a partial pre-push review on `cd1a29f` and passed; full base-comparison review still wanted before merge. Merge via `gh pr merge 49 --squash --delete-branch=false`. Soak watch 4-6h with rollback triggers documented in RUNBOOK (queue stall >30 min OR chat error rate >5%).

### Track H — Retro + cleanup
Write `~/Developer/campusnest-ops/sprints/2026-04-runtime-rebuild/retrospective.md` (template in plan H1). Update STATUS.md (ops) + STATE.md (product) to closed.

## Critical constraints / gotchas

- **Sprint window already past.** Plan target was 2026-05-10; today is 2026-05-13. Whole rest of plan is overdue but not abandoned.
- **Codex CLI config:** `~/.codex/config.toml` has `model = "gpt-5.5"` + `model_reasoning_effort = "high"`. Pre-push hook `.husky/pre-push` reads this — do not pass overriding flags.
- **Pre-commit hook runs `pnpm run build`.** Slow but mandatory; do not bypass with `--no-verify`.
- **Audit drift is real.** New CVEs land weekly. If `pnpm audit` fails again, prefer override bumps over direct dep upgrades (the plan's deferred-to-next-sprint stance).
- **User skipped Notion this sprint.** Hooks may emit Notion sync reminders after every commit/push — IGNORE them per explicit user direction.
- **woz Search tool** is now the canonical file-read path (not `Read`/`Bash cat`). Edit via `mcp__plugin_woz_code__Edit`.
- **No backwards-compat shims, no "for now" fixes** (memory rule). Pick the long-term root-cause option even if it's more work.

## How to start the next session

1. `cd /Users/aineshmohan/Developer/ai-real-estate-agent && git status` — confirm clean tree on `runtime-rebuild` at `cd1a29f`
2. Read this file + the plan (`docs/superpowers/plans/2026-05-01-runtime-rebuild-close-out.md`) Track F section
3. Ask the user for the staging Supabase project ref (or whether to use a Supabase Branch off prod)
4. Run F1 → F2 → F3 → F4 → G → H, exiting each track with the DONE message format from the plan
