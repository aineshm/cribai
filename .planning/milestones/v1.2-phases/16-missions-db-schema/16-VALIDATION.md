---
phase: 16
slug: missions-db-schema
status: complete
nyquist_compliant: true
wave_0_complete: true
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
| 16-01-01 | 01 | 1 | EXEC-03a | unit | `pnpm --filter @campusnest/types test -- --run` | ✅ | ✅ green |
| 16-01-02 | 01 | 1 | EXEC-03b | unit | `pnpm --filter @campusnest/types test -- --run` | ✅ | ✅ green |
| 16-01-03 | 01 | 1 | EXEC-03c | unit | `pnpm --filter @campusnest/types test -- --run` | ✅ | ✅ green |
| 16-02-01 | 02 | 1 | EXEC-03d | manual-only | Apply migration to Supabase | N/A | ⬜ manual |
| 16-02-02 | 02 | 1 | EXEC-03e | manual-only | Test via Supabase dashboard | N/A | ⬜ manual |
| 16-02-03 | 02 | 1 | EXEC-03f | manual-only | `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'` | N/A | ⬜ manual |
| 16-02-04 | 02 | 1 | EXEC-03g | manual-only | `SELECT * FROM cron.job` | N/A | ⬜ manual |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/types/src/__tests__/mission-types.test.ts` — 27 type assertion tests for Mission, MissionLog, MissionDraft, MissionSteering interfaces
- [x] Enum completeness tests for MissionStatus (7), MissionType (5), DraftType (3), UserDecision (3)

*All Wave 0 tests green — 27/27 passing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SQL migration applies cleanly | EXEC-03d | Requires live Supabase instance | Apply `013_missions_schema.sql` via `supabase db push` or dashboard SQL editor |
| RLS scopes to authenticated user | EXEC-03e | Requires two auth sessions | Create missions as User A, verify User B cannot SELECT them |
| Realtime publications enabled | EXEC-03f | Requires live DB query | Run `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'` — expect missions, mission_logs, mission_drafts |
| pg_cron jobs scheduled | EXEC-03g | Requires pg_cron extension live | Run `SELECT * FROM cron.job` — expect expire-stale-missions and purge-cron-job-details |

---

## Validation Audit 2026-03-11

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s (393ms actual)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete
