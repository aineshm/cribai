---
phase: 16-missions-db-schema
verified: 2026-03-10T21:40:00Z
status: human_needed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "Apply migration 013 to Supabase dev instance and confirm 4 tables appear in Table Editor"
    expected: "missions, mission_logs, mission_drafts, mission_steerings tables visible with correct columns"
    why_human: "Requires a live Supabase connection — cannot verify SQL execution programmatically"
  - test: "Run SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' on live DB"
    expected: "missions, mission_logs, mission_drafts appear in results (mission_steerings absent per design)"
    why_human: "Requires live DB query against pg catalog"
  - test: "Run SELECT * FROM cron.job on live DB after migration"
    expected: "expire-stale-missions (every 6h) and purge-cron-job-details (daily 4 AM) appear"
    why_human: "Requires pg_cron extension live and a running Supabase instance"
  - test: "Create a mission as User A, then attempt SELECT as User B"
    expected: "User B receives empty result set — RLS scopes to auth.uid() = user_id"
    why_human: "Requires two authenticated sessions against a live Supabase project"
---

# Phase 16: Missions DB Schema Verification Report

**Phase Goal:** The database foundation for all mission-related features is live -- four tables with RLS, Realtime publications, HITL draft versioning columns, pg_cron cleanup jobs, and TypeScript types aligned to DB column names -- unblocking executor, Realtime, and UI wiring.

**Verified:** 2026-03-10T21:40:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | missions, mission_logs, mission_drafts, and mission_steerings tables exist with RLS enabled | VERIFIED | `013_missions_schema.sql` lines 14-181: CREATE TABLE + ALTER TABLE ... ENABLE ROW LEVEL SECURITY for all 4 tables |
| 2 | mission_drafts has draft_version and is_current columns for HITL versioning | VERIFIED | SQL lines 86-87: `draft_version INTEGER NOT NULL DEFAULT 1`, `is_current BOOLEAN NOT NULL DEFAULT true`; BEFORE INSERT trigger at lines 128-141 |
| 3 | Realtime publications are enabled on missions, mission_logs, and mission_drafts | VERIFIED | SQL lines 187-189: `ALTER PUBLICATION supabase_realtime ADD TABLE missions/mission_logs/mission_drafts` (mission_steerings intentionally excluded) |
| 4 | pg_cron jobs are scheduled for stale mission expiration and job_run_details cleanup | VERIFIED | SQL lines 213-232: `cron.schedule('expire-stale-missions', '0 */6 * * *', ...)` and `cron.schedule('purge-cron-job-details', '0 4 * * *', ...)` |
| 5 | TypeScript types in concierge-types.ts use snake_case matching DB columns exactly | VERIFIED | `packages/types/src/mission.ts` Zod schemas define user_id, mission_id, draft_version, is_current, idempotency_key, expires_at, tool_name, tool_input, tool_output, raw_input, parsed_intent, applied_at, draft_type, user_decision, decided_at -- all matching SQL column names verbatim; re-exported via `apps/web/lib/concierge-types.ts` |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/013_missions_schema.sql` | 4 mission tables with RLS, Realtime, pg_cron, triggers, indexes (min 120 lines) | VERIFIED | 233 lines; contains all 4 CREATE TABLEs, 4x ENABLE ROW LEVEL SECURITY, 3x ALTER PUBLICATION, 2x cron.schedule, set_draft_not_current trigger, update_missions_updated_at trigger, 4 indexes |
| `apps/web/lib/concierge-types.ts` | DB-aligned TypeScript interfaces (snake_case); exports Mission, MissionLog, MissionDraft, MissionSteering, MissionStatus, MissionType | VERIFIED | Re-exports all 9 named types from `@campusnest/types`; also exports LegacyMission, ExecutionLog, ActionCard, ActionCardType as deprecated backward-compat aliases |
| `packages/types/src/mission.ts` | Zod schemas for all 4 mission entities | VERIFIED | Exports missionSchema, missionLogSchema, missionDraftSchema, missionSteeringSchema with `.strict()` mode; all snake_case fields; z.infer<> types for Mission, MissionLog, MissionDraft, MissionSteering |
| `packages/types/src/__tests__/mission-types.test.ts` | Type assertion tests (min 40 lines) | VERIFIED | 313 lines; 27 tests across 7 describe blocks covering all 4 schemas and all 4 enum types (missionStatus 7 members, missionType 5 members, draftType 3 members, userDecision 3 members) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/web/lib/concierge-types.ts` | `supabase/migrations/013_missions_schema.sql` | Column names match exactly (snake_case) | VERIFIED | Types re-exported from Zod schemas define user_id, mission_id, draft_version, is_current, tool_name, tool_input, tool_output, raw_input, parsed_intent, applied_at — all present in SQL with identical names |
| `packages/types/src/mission.ts` | `apps/web/lib/concierge-types.ts` | Zod schemas infer to same interfaces | VERIFIED | `z.infer<typeof missionSchema>` etc. produce Mission/MissionLog/MissionDraft/MissionSteering; concierge-types.ts re-exports all 4 directly from `@campusnest/types` |
| `packages/types/src/index.ts` | `packages/types/src/mission.ts` | Barrel re-export | VERIFIED | Lines 37-55 of index.ts: full named re-export of all schemas and types from `./mission` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| EXEC-03 | 16-01-PLAN.md | Missions DB schema stores status, raw execution logs, draft payloads, idempotency keys, and expiration | SATISFIED | `missions` table has `status` (CHECK 7 values) + `idempotency_key` + `expires_at`; `mission_logs` has `tool_name`/`tool_input`/`tool_output` (raw execution logs); `mission_drafts` has `payload` (JSONB draft payloads); all tables exist in migration 013 |

No orphaned requirements found. REQUIREMENTS.md maps EXEC-03 to Phase 16 and marks it Complete.

---

### Anti-Patterns Found

None detected in Phase 16 files (013_missions_schema.sql, mission.ts, concierge-types.ts, mission-types.test.ts, index.ts).

---

### Pre-existing Typecheck Failures (Not Phase 16 Regressions)

The web typecheck (`pnpm --filter @campusnest/web exec tsc --noEmit`) reports 11 errors in files Phase 16 did not touch:

- `components/chat/__tests__/map-block.test.tsx` (9 errors — TS2532, TS2345, TS2322)
- `lib/__tests__/dev-auth.test.ts` (1 error — TS6133)
- `lib/__tests__/heart-button.test.tsx` (1 error — TS6133)

These errors are confirmed pre-existing: identical errors appear when running typecheck against the commit immediately before b5ba514 (Phase 16). No concierge or mission files appear in the typecheck error output.

---

### Human Verification Required

#### 1. Migration applies cleanly to Supabase

**Test:** Apply `supabase/migrations/013_missions_schema.sql` via `supabase db push` or paste into Supabase SQL editor
**Expected:** Migration completes without errors; 4 tables (missions, mission_logs, mission_drafts, mission_steerings) appear in Table Editor with correct columns
**Why human:** Requires a live Supabase connection -- cannot verify SQL execution programmatically

#### 2. Realtime publication active

**Test:** After applying migration, run `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';` in Supabase SQL editor
**Expected:** missions, mission_logs, mission_drafts appear; mission_steerings does NOT appear (intentionally excluded)
**Why human:** Requires live DB query against pg catalog

#### 3. pg_cron jobs scheduled

**Test:** Run `SELECT jobname, schedule FROM cron.job;` in Supabase SQL editor
**Expected:** Two rows: `expire-stale-missions` (schedule `0 */6 * * *`) and `purge-cron-job-details` (schedule `0 4 * * *`)
**Why human:** Requires pg_cron extension live in a running Supabase project

#### 4. RLS scopes correctly

**Test:** Create a mission as User A, then query `SELECT * FROM missions` as User B (two authenticated sessions)
**Expected:** User B receives empty result set; User A sees their own missions only
**Why human:** Requires two authenticated sessions against a live Supabase project

---

### Automated Test Results

```
pnpm --filter @campusnest/types test -- --run

 RUN  v2.1.9 packages/types
 ✓ src/__tests__/mission-types.test.ts  (27 tests)  6ms
 ✓ src/__tests__/schemas.test.ts        (54 tests)  9ms

 Test Files  2 passed (2)
      Tests  81 passed (81)
```

All 27 mission type tests pass. All enum member counts verified. All Zod schema parse/reject behaviors confirmed.

---

### Summary

Phase 16 delivered everything its goal required. All five observable truths are verified in the actual codebase:

- The migration SQL is complete and substantive (233 lines, all structural elements present: 4 tables, 4x RLS, 3x Realtime, 2x pg_cron, 2 triggers, 4 indexes)
- HITL versioning columns (draft_version, is_current) and the set_draft_not_current BEFORE INSERT trigger are implemented
- TypeScript types use strict-mode Zod schemas with exact snake_case column name alignment
- The barrel re-export chain (mission.ts -> index.ts -> concierge-types.ts) is fully wired
- 27 type tests pass; pre-existing web typecheck failures are unrelated to Phase 16

The four human verification items are gating on a live Supabase instance: migration application, Realtime publication query, pg_cron job query, and RLS isolation test. These cannot be verified programmatically and require manual confirmation against a running dev instance.

EXEC-03 is satisfied by evidence in the codebase.

---

_Verified: 2026-03-10T21:40:00Z_
_Verifier: Claude (gsd-verifier)_
