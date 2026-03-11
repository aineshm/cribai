---
phase: 16
slug: missions-db-schema
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (workspace-wide) |
| **Config file** | `apps/web/vitest.config.ts`, `packages/types/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @campusnest/types test -- --run` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @campusnest/types test -- --run`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | EXEC-03a | unit | `pnpm --filter @campusnest/types test -- --run` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | EXEC-03b | unit | `pnpm --filter @campusnest/types test -- --run` | ❌ W0 | ⬜ pending |
| 16-01-03 | 01 | 1 | EXEC-03c | unit | `pnpm --filter @campusnest/types test -- --run` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 1 | EXEC-03d | manual-only | Apply migration to Supabase | N/A | ⬜ pending |
| 16-02-02 | 02 | 1 | EXEC-03e | manual-only | Test via Supabase dashboard | N/A | ⬜ pending |
| 16-02-03 | 02 | 1 | EXEC-03f | manual-only | `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'` | N/A | ⬜ pending |
| 16-02-04 | 02 | 1 | EXEC-03g | manual-only | `SELECT * FROM cron.job` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/types/src/__tests__/mission-types.test.ts` — type assertion tests for Mission, MissionLog, MissionDraft, MissionSteering interfaces
- [ ] Enum completeness tests for MissionStatus, MissionType, DraftType, UserDecision

*No new framework installation needed — Vitest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SQL migration applies cleanly | EXEC-03d | Requires live Supabase instance | Apply `013_missions_schema.sql` via `supabase db push` or dashboard SQL editor |
| RLS scopes to authenticated user | EXEC-03e | Requires two auth sessions | Create missions as User A, verify User B cannot SELECT them |
| Realtime publications enabled | EXEC-03f | Requires live DB query | Run `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'` — expect missions, mission_logs, mission_drafts |
| pg_cron jobs scheduled | EXEC-03g | Requires pg_cron extension live | Run `SELECT * FROM cron.job` — expect expire-stale-missions and purge-cron-job-details |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
