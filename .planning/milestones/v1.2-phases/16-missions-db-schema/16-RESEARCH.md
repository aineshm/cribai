# Phase 16: Missions DB Schema - Research

**Researched:** 2026-03-10
**Domain:** Supabase PostgreSQL schema design (migrations, RLS, Realtime, pg_cron)
**Confidence:** HIGH

## Summary

Phase 16 creates the database foundation for the entire v1.2 agent backend. Four tables (`missions`, `mission_logs`, `mission_drafts`, `mission_steerings`) must be created via a single Supabase migration (013), with RLS policies scoping all access to the authenticated user, Realtime publications on three tables, pg_cron jobs for stale mission expiration and `job_run_details` cleanup, and TypeScript types that mirror DB column names exactly.

The project already has 12 migrations establishing strong conventions: UUID PKs with `gen_random_uuid()`, `TIMESTAMPTZ` timestamps, `CHECK` constraints for enums, `auth.uid()` RLS patterns, and `ALTER PUBLICATION supabase_realtime ADD TABLE` for Realtime. This phase follows those patterns exactly. The only new capabilities are pg_cron (first use in this project) and the HITL draft versioning pattern (`draft_version` + `is_current` columns).

**Primary recommendation:** Write one migration file `013_missions_schema.sql` with all four tables, RLS, Realtime publications, and pg_cron jobs, then update `concierge-types.ts` to match DB columns exactly (snake_case, no mock-only fields).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXEC-03 | Missions DB schema stores status, raw execution logs, draft payloads, idempotency keys, and expiration | All four tables designed below with exact column specs; RLS, Realtime, pg_cron patterns documented; TypeScript type alignment strategy defined |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase (PostgreSQL) | Project uses Supabase hosted PG | Database tables, RLS, Realtime | Already the project DB |
| pg_cron | 1.6.4 (Supabase-managed) | Scheduled cleanup jobs | Built into Supabase, no external scheduler needed |
| @supabase/supabase-js | ^2.47.0 | Client SDK for Realtime subscriptions | Already installed in `@campusnest/supabase` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript | ^5.7.0 | Type definitions matching DB | Updating `concierge-types.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pg_cron | GitHub Actions / external cron | pg_cron runs inside DB with zero infra overhead; external cron adds deployment complexity |
| JSONB draft payload | Separate columns per draft field | JSONB is flexible for varying action types (tour, email, negotiation) while keeping schema stable |

**Installation:**
No new packages needed. pg_cron is enabled via SQL: `CREATE EXTENSION IF NOT EXISTS pg_cron;`

## Architecture Patterns

### Migration File
```
supabase/migrations/
├── ...existing 001-012...
└── 013_missions_schema.sql   # All 4 tables + RLS + Realtime + pg_cron
```

### TypeScript Types
```
apps/web/lib/
├── concierge-types.ts        # Updated: DB-aligned types (snake_case)
└── mock-missions.ts          # Keep for now (Phase 20 deletes it)
```

### Pattern 1: Table Schema Design

**missions** -- The parent table for all agent missions.

```sql
CREATE TABLE missions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN (
    'tour_booking', 'lease_review', 'landlord_outreach',
    'price_negotiation', 'listing_comparison'
  )),
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'paused', 'waiting_approval', 'scheduled',
    'completed', 'failed', 'expired'
  )),
  goal            TEXT NOT NULL,
  listing_id      UUID REFERENCES listings(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Key design decisions:
- `status` includes `paused` (for HITL gate) and `expired` (for pg_cron cleanup)
- `idempotency_key` is `UNIQUE` to prevent duplicate mission creation from retries
- `expires_at` enables pg_cron to mark stale missions as expired
- `listing_id` is nullable (some missions like `listing_comparison` span multiple listings)
- `goal` stores the user's original natural language request

**mission_logs** -- Append-only execution log entries, pushed via Realtime.

```sql
CREATE TABLE mission_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL CHECK (status IN ('success', 'pending', 'error')),
  tool_name   TEXT,
  tool_input  JSONB,
  tool_output JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Key design decisions:
- `tool_name`, `tool_input`, `tool_output` capture raw tool call data for debugging
- Append-only: no UPDATE policy, only INSERT and SELECT
- No `user_id` column -- ownership inferred via `mission_id` FK join (matches `messages` table pattern from migration 010)

**mission_drafts** -- HITL draft payloads awaiting user approval.

```sql
CREATE TABLE mission_drafts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id     UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  draft_type     TEXT NOT NULL CHECK (draft_type IN (
    'tour_schedule', 'email_draft', 'negotiation_offer'
  )),
  payload        JSONB NOT NULL,
  draft_version  INTEGER NOT NULL DEFAULT 1,
  is_current     BOOLEAN NOT NULL DEFAULT true,
  user_decision  TEXT CHECK (user_decision IN ('approved', 'edited', 'rejected')),
  decided_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Key design decisions:
- `draft_version` + `is_current` prevents stale approval: when a new draft is created, set `is_current = false` on all previous drafts for that mission
- `user_decision` is nullable -- null means pending approval
- `payload` is JSONB to support different action types without schema changes
- Trigger or application logic must enforce "only one `is_current = true` per mission"

**mission_steerings** -- User mid-mission corrections.

```sql
CREATE TABLE mission_steerings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id    UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  raw_input     TEXT NOT NULL,
  parsed_intent JSONB,
  applied_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Key design decisions:
- `raw_input` stores original user text, `parsed_intent` stores Gemini's structured parse
- `applied_at` is nullable -- null means not yet consumed by the executor
- Not published to Realtime (steerings are written by the user, not observed)

### Pattern 2: RLS Policies (User-Scoped)

Follow the project's established pattern from migrations 007 and 010:

```sql
-- Direct user_id column tables: missions, mission_steerings
CREATE POLICY "Users manage own missions" ON missions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Join-through tables: mission_logs, mission_drafts (no user_id column)
CREATE POLICY "Users see own mission logs" ON mission_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM missions m WHERE m.id = mission_logs.mission_id AND m.user_id = auth.uid())
  );

-- mission_logs: INSERT only from service role (executor), no client INSERT
CREATE POLICY "Service inserts mission logs" ON mission_logs
  FOR INSERT WITH CHECK (false);  -- Only service_role bypasses RLS
```

Important: The executor runs with the service role client (`createSecretClient()`), so it bypasses RLS for INSERTs to `mission_logs` and `mission_drafts`. Client-side code only needs SELECT on these tables.

### Pattern 3: HITL Draft Versioning

The `is_current` column prevents stale approval bugs:

```sql
-- Before inserting a new draft, mark all existing drafts as not current
CREATE OR REPLACE FUNCTION set_draft_not_current()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE mission_drafts
  SET is_current = false
  WHERE mission_id = NEW.mission_id AND is_current = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER before_draft_insert
  BEFORE INSERT ON mission_drafts
  FOR EACH ROW
  EXECUTE FUNCTION set_draft_not_current();
```

Application-level check on approval:
```typescript
// When user approves, verify the draft is still current
const { data } = await supabase
  .from('mission_drafts')
  .select('is_current')
  .eq('id', draftId)
  .single();

if (!data?.is_current) {
  throw new Error('This draft has been superseded by a newer version');
}
```

### Pattern 4: Realtime Publications

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE missions;
ALTER PUBLICATION supabase_realtime ADD TABLE mission_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE mission_drafts;
-- mission_steerings NOT published (user-initiated, no need to observe)
```

Matches the existing pattern from migration 007 (`notifications` table).

### Pattern 5: pg_cron Jobs

```sql
-- Enable pg_cron (first use in this project)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job 1: Expire stale missions (older than 24h and still active/paused)
SELECT cron.schedule(
  'expire-stale-missions',
  '0 */6 * * *',  -- every 6 hours
  $$
  UPDATE missions
  SET status = 'expired', updated_at = now()
  WHERE status IN ('active', 'paused')
  AND (expires_at IS NOT NULL AND expires_at < now())
  $$
);

-- Job 2: Purge old job_run_details to prevent table bloat
SELECT cron.schedule(
  'purge-cron-job-details',
  '0 4 * * *',  -- daily at 4 AM
  $$
  DELETE FROM cron.job_run_details
  WHERE end_time < now() - interval '7 days'
  $$
);
```

### Pattern 6: updated_at Trigger

Reuse the pattern from migration 010 (`conversations`):

```sql
CREATE OR REPLACE FUNCTION update_missions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER missions_updated_at
  BEFORE UPDATE ON missions
  FOR EACH ROW
  EXECUTE FUNCTION update_missions_updated_at();
```

### Anti-Patterns to Avoid
- **Embedding logs in missions JSONB column:** Logs must be a separate table for Realtime subscriptions (can't subscribe to JSONB field changes) and for append-only semantics
- **Using client-side INSERT for executor writes:** The executor runs server-side with service role; client RLS should block direct inserts to logs/drafts
- **Skipping `is_current` trigger:** Manual application-level management of draft currency is error-prone; use the DB trigger
- **Publishing `mission_steerings` to Realtime:** Waste of resources; steerings flow user-to-server, not server-to-UI

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scheduled cleanup | External cron service | pg_cron extension | Zero infrastructure, runs inside Postgres |
| Draft versioning race conditions | Application-level locks | DB trigger + `is_current` column | Atomic, no race window |
| Realtime subscriptions | WebSocket server | Supabase Realtime (ALTER PUBLICATION) | Already integrated, client SDK supports it |
| UUID generation | Application-side UUID | `gen_random_uuid()` | DB-generated, no client dependency |
| Idempotency | Application dedup logic | `UNIQUE` constraint on `idempotency_key` | DB enforced, no race conditions |

## Common Pitfalls

### Pitfall 1: Forgetting RLS on New Tables
**What goes wrong:** Tables are created without `ENABLE ROW LEVEL SECURITY`, exposing all data to any authenticated user.
**Why it happens:** Easy to forget the `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` line.
**How to avoid:** Every `CREATE TABLE` must be followed by `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and at least one policy. Use a checklist.
**Warning signs:** Any user can see all missions in the Supabase dashboard.

### Pitfall 2: Realtime Without RLS Causes Auth Leaks
**What goes wrong:** Realtime publishes changes to all subscribers. Without RLS, User A sees User B's mission updates.
**Why it happens:** Realtime checks RLS policies per subscriber per change event.
**How to avoid:** RLS must be enabled and policies must scope by `auth.uid()`. Verify with two test accounts.
**Warning signs:** Mission updates appearing for wrong users.

### Pitfall 3: pg_cron Extension Not Enabled
**What goes wrong:** `cron.schedule()` calls fail with "schema cron does not exist."
**Why it happens:** pg_cron must be explicitly enabled. It is available on all Supabase plans but not enabled by default.
**How to avoid:** Put `CREATE EXTENSION IF NOT EXISTS pg_cron;` at the top of the migration.
**Warning signs:** Migration fails when applied.

### Pitfall 4: cron.job_run_details Bloat
**What goes wrong:** The `cron.job_run_details` table grows unbounded, consuming disk space.
**Why it happens:** pg_cron does NOT auto-clean this table. Every job execution adds a row.
**How to avoid:** Schedule a separate cleanup job that deletes rows older than 7 days.
**Warning signs:** Database storage growing unexpectedly.

### Pitfall 5: Stale Draft Approval
**What goes wrong:** User approves an outdated draft because a newer version was created while they were reviewing.
**Why it happens:** Without `is_current` tracking, the approval endpoint cannot distinguish current from superseded drafts.
**How to avoid:** Use the `BEFORE INSERT` trigger to atomically set `is_current = false` on prior drafts. Check `is_current` before processing approval.
**Warning signs:** Executor acts on wrong draft payload.

### Pitfall 6: TypeScript Types Diverge from DB Columns
**What goes wrong:** Frontend uses `createdAt` (camelCase) but DB uses `created_at` (snake_case). Supabase JS client returns snake_case by default.
**Why it happens:** Mock types used camelCase; DB uses snake_case.
**How to avoid:** Update `concierge-types.ts` to use snake_case matching DB columns exactly. Or use Supabase's generated types.
**Warning signs:** TypeScript compiles but runtime data mapping fails silently.

## Code Examples

### Migration 013 Structure (verified from project conventions)
```sql
-- Migration 013: Missions schema for AI Concierge
-- Phase 16: Missions DB Schema

-- Enable pg_cron for scheduled cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- missions: parent table for all agent missions
-- ============================================================
CREATE TABLE missions ( ... );
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ... ON missions;
CREATE INDEX idx_missions_user_status ON missions(user_id, status);
CREATE INDEX idx_missions_expires ON missions(expires_at) WHERE status IN ('active', 'paused');

-- ============================================================
-- mission_logs: append-only execution log entries
-- ============================================================
CREATE TABLE mission_logs ( ... );
ALTER TABLE mission_logs ENABLE ROW LEVEL SECURITY;
-- SELECT via join, INSERT via service role only
CREATE INDEX idx_mission_logs_mission ON mission_logs(mission_id, created_at ASC);

-- ============================================================
-- mission_drafts: HITL approval drafts with versioning
-- ============================================================
CREATE TABLE mission_drafts ( ... );
ALTER TABLE mission_drafts ENABLE ROW LEVEL SECURITY;
-- Trigger for is_current management
CREATE INDEX idx_mission_drafts_mission_current ON mission_drafts(mission_id) WHERE is_current = true;

-- ============================================================
-- mission_steerings: user mid-mission corrections
-- ============================================================
CREATE TABLE mission_steerings ( ... );
ALTER TABLE mission_steerings ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_mission_steerings_mission ON mission_steerings(mission_id, created_at ASC);

-- ============================================================
-- Realtime publications
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE missions;
ALTER PUBLICATION supabase_realtime ADD TABLE mission_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE mission_drafts;

-- ============================================================
-- pg_cron cleanup jobs
-- ============================================================
SELECT cron.schedule('expire-stale-missions', '0 */6 * * *', $$ ... $$);
SELECT cron.schedule('purge-cron-job-details', '0 4 * * *', $$ ... $$);
```

### Updated concierge-types.ts (DB-aligned)
```typescript
// Types aligned to DB column names (snake_case)
export type MissionStatus =
  | 'active'
  | 'paused'
  | 'waiting_approval'
  | 'scheduled'
  | 'completed'
  | 'failed'
  | 'expired';

export type MissionType =
  | 'tour_booking'
  | 'lease_review'
  | 'landlord_outreach'
  | 'price_negotiation'
  | 'listing_comparison';

export type ExecutionLogStatus = 'success' | 'pending' | 'error';

export type DraftType = 'tour_schedule' | 'email_draft' | 'negotiation_offer';

export type UserDecision = 'approved' | 'edited' | 'rejected';

export interface Mission {
  readonly id: string;
  readonly user_id: string;
  readonly type: MissionType;
  readonly title: string;
  readonly status: MissionStatus;
  readonly goal: string;
  readonly listing_id: string | null;
  readonly idempotency_key: string | null;
  readonly expires_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface MissionLog {
  readonly id: string;
  readonly mission_id: string;
  readonly action: string;
  readonly detail: string;
  readonly status: ExecutionLogStatus;
  readonly tool_name: string | null;
  readonly tool_input: Record<string, unknown> | null;
  readonly tool_output: Record<string, unknown> | null;
  readonly created_at: string;
}

export interface MissionDraft {
  readonly id: string;
  readonly mission_id: string;
  readonly draft_type: DraftType;
  readonly payload: Record<string, unknown>;
  readonly draft_version: number;
  readonly is_current: boolean;
  readonly user_decision: UserDecision | null;
  readonly decided_at: string | null;
  readonly created_at: string;
}

export interface MissionSteering {
  readonly id: string;
  readonly mission_id: string;
  readonly raw_input: string;
  readonly parsed_intent: Record<string, unknown> | null;
  readonly applied_at: string | null;
  readonly created_at: string;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mock data in `mock-missions.ts` | DB-backed missions with Realtime | Phase 16 (now) | Enables real executor and live UI updates |
| camelCase TypeScript types | snake_case matching DB columns | Phase 16 (now) | Eliminates mapping bugs with Supabase JS client |
| No scheduled cleanup | pg_cron for expiration + bloat prevention | Phase 16 (now) | Prevents stale missions and disk bloat |

**Deprecated/outdated:**
- `concierge-types.ts` current `Mission` interface has mock-only fields (`listingTitle`, `summary`, `logs`, `actionCard`) that are embedded -- these become separate table joins
- `ExecutionLog` interface uses `timestamp` field -- DB uses `created_at`
- `ActionCard` type is replaced by `MissionDraft` with `draft_type` + `payload`

## Open Questions

1. **Exact `expires_at` default value**
   - What we know: Missions should expire if stale (active too long)
   - What's unclear: Default TTL -- 24 hours? 48 hours? Configurable per type?
   - Recommendation: Default to `now() + interval '24 hours'` in the migration, can adjust later. Make it a column default so the executor can override per-mission.

2. **Service role INSERT policy pattern**
   - What we know: The executor uses `createSecretClient()` which bypasses RLS
   - What's unclear: Whether to use `WITH CHECK (false)` to explicitly block client inserts, or just have no INSERT policy (which also blocks by default with RLS enabled)
   - Recommendation: Use no INSERT policy for `mission_logs` and `mission_drafts` -- RLS enabled with no INSERT policy means only service role can insert. Cleaner than `WITH CHECK (false)`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (workspace-wide) |
| Config file | `apps/web/vitest.config.ts`, `packages/types/vitest.config.ts` |
| Quick run command | `pnpm --filter @campusnest/types test` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXEC-03a | TypeScript types match DB column names | unit | `pnpm --filter @campusnest/types test -- --run` | No - Wave 0 |
| EXEC-03b | Mission type/status enums are complete | unit | `pnpm --filter @campusnest/types test -- --run` | No - Wave 0 |
| EXEC-03c | MissionDraft has draft_version and is_current | unit | `pnpm --filter @campusnest/types test -- --run` | No - Wave 0 |
| EXEC-03d | SQL migration is syntactically valid | manual-only | Apply migration to Supabase | N/A |
| EXEC-03e | RLS policies scope to authenticated user | manual-only | Test via Supabase dashboard with 2 users | N/A |
| EXEC-03f | Realtime publications are enabled | manual-only | `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'` | N/A |
| EXEC-03g | pg_cron jobs are scheduled | manual-only | `SELECT * FROM cron.job` | N/A |

### Sampling Rate
- **Per task commit:** `pnpm --filter @campusnest/types test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green + manual SQL verification queries

### Wave 0 Gaps
- [ ] Type assertion tests for new mission types in `packages/types/` (or inline in `apps/web/`)
- [ ] No automated migration testing possible without a local Supabase instance -- manual verification required

## Sources

### Primary (HIGH confidence)
- Project codebase: migrations 001-012, `concierge-types.ts`, `mock-missions.ts`, `ConciergeProvider.tsx`
- [Supabase Realtime Postgres Changes docs](https://supabase.com/docs/guides/realtime/postgres-changes) - Publication setup, RLS integration
- [Supabase pg_cron docs](https://supabase.com/docs/guides/database/extensions/pg_cron) - Extension enable, schedule syntax
- [Supabase Cron quickstart](https://supabase.com/docs/guides/cron/quickstart) - Job scheduling patterns

### Secondary (MEDIUM confidence)
- [Supabase Cron module overview](https://supabase.com/modules/cron) - job_run_details cleanup pattern
- [Supabase pg_cron debugging guide](https://supabase.com/docs/guides/troubleshooting/pgcron-debugging-guide-n1KTaz) - Version 1.6.4 info

### Tertiary (LOW confidence)
- None -- all findings verified against project code or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in the project or built into Supabase
- Architecture: HIGH - Follows established migration conventions from 12 prior migrations
- Pitfalls: HIGH - Based on official Supabase docs and known PostgreSQL patterns
- TypeScript alignment: HIGH - Direct comparison of mock types vs. DB column conventions

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable domain -- SQL schema patterns don't change fast)
