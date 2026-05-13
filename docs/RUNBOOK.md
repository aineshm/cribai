# CampusNest Runbook

Operations guide for deployment, monitoring, troubleshooting, and incident response.

## Quick Links

- [Deployment](#deployment)
- [Health Checks](#health-checks)
- [Common Issues](#common-issues)
- [Incident Response](#incident-response)
- [Maintenance](#maintenance)

## Deployment

<!-- AUTO-GENERATED: Deployment Guide -->

### Prerequisites

- Node.js 24.x installed
- pnpm 9.15.4 installed
- All environment variables set (see [ENV.md](./ENV.md))
- Supabase project configured with migrations applied

### Production Build

```bash
# Build all packages
pnpm build

# Output in:
# - apps/web/.next/
# - packages/*/dist/

# Verify build succeeded
ls -la apps/web/.next/
pnpm typecheck
```

### Next.js Deployment (Vercel Recommended)

#### First Time Setup

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Link to Vercel project
vercel link

# 3. Pull environment variables
vercel env pull

# 4. Set secrets in Vercel dashboard
# Go to Project → Settings → Environment Variables
# Add: SUPABASE_SECRET_KEY, GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT, etc.
```

#### Deploy to Vercel

```bash
# Via git (automatic on push to main)
git push origin main

# Or manually
vercel deploy --prod

# Verify deployment
# Check Vercel dashboard for build status
# Visit https://your-project.vercel.app
```

#### Verify Deployment

```bash
# Check health endpoint
curl https://your-project.vercel.app/api/health

# Check Supabase connection
curl https://your-project.vercel.app/api/supabase-test

# View recent logs
vercel logs --prod
```

### Scraper Deployment (GitHub Actions)

The scraper runs on schedule via GitHub Actions:

**Trigger**: Daily at 2:00 AM CT (8:00 AM UTC)
**Manual trigger**: Available via workflow_dispatch

```bash
# View workflow
cat .github/workflows/nightly-scrape.yml

# Manual trigger (via GitHub web UI)
# Go to Actions → Nightly Scrape → Run workflow

# View run history
gh run list --workflow nightly-scrape.yml --limit 10

# View latest run logs
gh run view --log
```

#### Scraper Prerequisites

Set GitHub Action secrets:
- `SUPABASE_URL` - Project URL
- `SUPABASE_SECRET_KEY` - Service role key

```bash
# Set secret via CLI
gh secret set SUPABASE_SECRET_KEY -b "your_key"
```

### Database Migrations

```bash
# Create migration in supabase/migrations/
# File format: NNN_descriptive_name.sql

# Apply locally with Supabase CLI
supabase migration up

# Push to Supabase
supabase db push

# Seed with initial data
psql $SUPABASE_CONNECTION_STRING < supabase/seed/001_campus_configs.sql
```

### Environment Variables for Production

Set in Vercel dashboard (Settings → Environment Variables):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SECRET_KEY=eyJhbGc... [SECRET]
GEMINI_API_KEY=... [SECRET, if not using Vertex AI]
GOOGLE_CLOUD_PROJECT=... [SECRET/CONFIG, if using Vertex AI]
GOOGLE_APPLICATION_CREDENTIALS_JSON=... [SECRET, if using Vertex AI JSON credentials]
STRIPE_SECRET_KEY=sk_live_... [SECRET, Phase 2+]
STRIPE_WEBHOOK_SECRET=whsec_live_... [SECRET, Phase 2+]
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

<!-- END AUTO-GENERATED -->

## Health Checks

### Application Health

```bash
# Frontend load
curl -I https://your-project.vercel.app
# Expected: 200 OK

# Supabase connectivity
curl https://your-project.vercel.app/api/health
# Expected: { "status": "ok", "timestamp": "..." }

# Database connection
curl https://your-project.vercel.app/api/db-health
# Expected: { "status": "ok", "tables": [...] }
```

### Supabase Health

```bash
# Check Supabase status
curl -I https://your-project.supabase.co

# Query database directly
psql $SUPABASE_CONNECTION_STRING -c "SELECT version();"

# Check replication lag
psql $SUPABASE_CONNECTION_STRING \
  -c "SELECT slot_name, restart_lsn FROM pg_replication_slots;"

# View active connections
psql $SUPABASE_CONNECTION_STRING \
  -c "SELECT count(*) FROM pg_stat_activity;"
```

### Monitoring Dashboards

- **Vercel**: https://vercel.com/dashboard
- **Supabase**: https://app.supabase.com/projects
- **Google AI / Vertex AI**: https://console.cloud.google.com/apis/dashboard
- **Stripe**: https://dashboard.stripe.com/

### Key Metrics to Monitor

| Metric | Target | Check |
|--------|--------|-------|
| Page Load Time | <3s | Vercel Analytics |
| API Response Time | <200ms | Vercel Logs |
| Database Connections | <20 | Supabase Dashboard |
| Scraper Success Rate | >95% | GitHub Actions logs |
| API Error Rate | <0.1% | Vercel Logs |
| Gemini API Quota | <80% | Google Cloud Console |

## Mission Worker

The mission queue is intentionally lightweight right now. Missions can be created as `queued`, and a small Node worker drains the queue by polling Supabase, claiming work, and running the executor.

### Start The Worker

```bash
# Long-running polling worker
pnpm worker:missions

# Single tick only (safe for local debugging)
pnpm worker:missions -- --once
```

### Environment Knobs

```bash
# Poll every 5s by default
MISSION_WORKER_INTERVAL_MS=5000

# Emit an "idle" log at most once per minute
MISSION_WORKER_IDLE_LOG_INTERVAL_MS=60000

# Claim up to 5 queued missions per poll
MISSION_WORKER_MAX_JOBS_PER_TICK=5

# Lease each claimed mission for 5 minutes
MISSION_WORKER_LEASE_SECONDS=300

# Equivalent to passing --once
MISSION_WORKER_RUN_ONCE=true
```

### Expected Logs

The worker logs newline-delimited JSON so it is easy to grep and ship later.

Common events:

- `worker_started`
- `tick_started`
- `tick_processed`
- `tick_idle`
- `tick_error`
- `shutdown_requested`
- `worker_stopped`
- `worker_fatal`

Example:

```json
{"ts":"2026-04-16T15:02:11.913Z","source":"mission-worker","event":"tick_processed","pid":92114,"host":"mbp","tickId":"1713279731913-k3j2pk","durationMs":1842,"processed":2,"claimedMissionIds":["...","..."],"claimedMissions":[{"id":"...","type":"housing_search","startFromStep":0}]}
```

### How To Iterate Safely

```bash
# 1. Create or queue a mission in the UI

# 2. Run one worker tick
pnpm worker:missions -- --once

# 3. Inspect mission rows
psql $SUPABASE_CONNECTION_STRING -c "select id, type, status, current_step_index, last_error, attempt_count from missions order by updated_at desc limit 10;"

# 4. Repeat until behavior looks right
```

### Debugging Notes

- If missions stay in `queued`, the worker is not running or cannot claim jobs.
- If missions move to `retrying`, inspect `last_error` and the worker `tick_error` logs.
- If missions stick in `running`, check `leased_until` and whether the worker exited mid-step.
- For UI-only/manual operation, queued missions can remain visible in the `Queue` tab until the user moves them to `Past`.

### GitHub Actions Stopgap

If you want a free or near-free stopgap before moving to a real worker host, the repo includes [.github/workflows/missions-worker.yml](/Users/aineshmohan/Developer/ai-real-estate-agent/.github/workflows/missions-worker.yml:1).

- Schedule: every 5 minutes
- Runtime shape: one `--once` worker tick per run
- Overlap protection: GitHub Actions `concurrency` keeps runs from stacking on top of each other
- Manual trigger: `Actions` -> `Missions Worker` -> `Run workflow`

Required GitHub secrets:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

Mission-type-specific secrets the workflow will also pass through if present:

- `GEMINI_API_KEY`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`
- `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- `GOOGLE_PLACES_API_KEY`
- `RESEND_API_KEY`

Notes:

- `housing_search` and `listing_deep_dive` typically need LLM credentials.
- `sublease_post` may need Google Places and Resend depending on the step path.
- If a secret is missing for a given mission type, the worker will log the failure and the mission will move to `retrying` or `failed` based on the executor rules.

### Oracle VM Status

The Oracle VM path is prepared but not active as of 2026-04-22.

Current verified state:

- OCI CLI is authenticated locally.
- Tenancy is subscribed only to `us-chicago-1`.
- Chicago network exists and is usable:
  - VCN: `worker-vcn`
  - public subnet: `worker-public-subnet`
  - internet gateway: `worker-igw`
  - default route: `0.0.0.0/0 -> worker-igw`
  - SSH `22` allowed by the security list
- SSH keypair exists locally:
  - private key: `~/.ssh/oracle-worker`
  - public key: `~/.ssh/oracle-worker.pub`
- `VM.Standard.A1.Flex` is currently `OUT_OF_HOST_CAPACITY` in all Chicago availability domains.
- No Oracle worker VM has been launched.

When capacity exists, launch:

- Region: `us-chicago-1` unless another subscribed region is available
- Shape: `VM.Standard.A1.Flex`
- Size: `1 OCPU / 6 GB RAM` or smaller if capacity requires it
- Image: Ubuntu ARM or Oracle Linux ARM
- Network: `worker-vcn` / `worker-public-subnet`
- Public IP: enabled
- SSH key: contents of `~/.ssh/oracle-worker.pub`

After SSH works:

```bash
ssh -i ~/.ssh/oracle-worker ubuntu@PUBLIC_IP
```

Then install the runtime, clone the repo, configure `.env.worker`, run `pnpm worker:missions -- --once`, and only then add cron.

## Common Issues

### Application Won't Start

**Symptoms**: "Command failed" in Vercel logs

```bash
# 1. Check all env vars are set
vercel env pull
grep -E "^[A-Z_]+=" .env.local | wc -l
# Should match required vars count

# 2. Check build locally
pnpm clean
pnpm install
pnpm build

# 3. Check TypeScript errors
pnpm typecheck

# 4. View detailed Vercel logs
vercel logs --prod --follow
```

### Supabase Connection Errors

**Symptoms**: "Cannot connect to Supabase" in logs

```bash
# 1. Verify env vars
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SECRET_KEY

# 2. Test connectivity
curl -I $NEXT_PUBLIC_SUPABASE_URL

# 3. Check Supabase status page
# https://status.supabase.io/

# 4. Verify keys haven't been rotated
# Check Supabase Dashboard → Settings → API

# 5. Check firewall/network restrictions
# Supabase Dashboard → Database → Connection pooler
```

### AI API Failing

**Symptoms**: "Invalid API key" or timeout errors

```bash
# 1. Verify Gemini configuration
echo $GEMINI_API_KEY | head -c 6
echo $GOOGLE_CLOUD_PROJECT

# 2. Check quota usage
# Google AI Studio or Google Cloud Vertex AI quota dashboard

# 3. Check rate limits
# View logs for HTTP 429 responses

# 4. Regenerate key or rotate service account credentials if compromised
```

### Database Too Many Connections

**Symptoms**: "remaining connection slots are reserved"

```bash
# 1. Check active connections
psql $SUPABASE_CONNECTION_STRING \
  -c "SELECT count(*) FROM pg_stat_activity;"

# 2. Kill long-running queries
psql $SUPABASE_CONNECTION_STRING \
  -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';"

# 3. Disable idle connections
# Supabase Dashboard → Database → Connection pooler
# Set "Idle in transaction" to lower value (e.g., 0)

# 4. Use connection pooler
# All connections should go through pooler, not direct
```

### Scraper Failing

**Symptoms**: GitHub Actions workflow shows red X

```bash
# 1. View workflow run logs
gh run view --log

# 2. Check Supabase connection in Actions
# Verify secrets are set: SUPABASE_URL, SUPABASE_SECRET_KEY

# 3. Check rate limits
# Apartments.com may be blocking requests
# Check logs for 429 (Too Many Requests)

# 4. Manual test
# Run locally: pnpm --filter @campusnest/scraper start
# Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY

# 5. Update Playwright browser (may be outdated)
# In scraper package: npm install --save-dev playwright@latest
```

### Memory Issues

**Symptoms**: "JavaScript heap out of memory" or OOM kill

```bash
# 1. Check Node.js version
node --version  # Should be 22.x

# 2. Increase memory for build
NODE_OPTIONS="--max-old-space-size=4096" pnpm build

# 3. Split build into stages
pnpm --filter @campusnest/types build
pnpm --filter @campusnest/utils build
pnpm --filter @campusnest/supabase build
# Then build web app

# 4. Check for memory leaks in development
# Use Chrome DevTools → Memory tab
```

### TypeScript Errors After Update

**Symptoms**: "Type 'X' is not assignable to type 'Y'"

```bash
# 1. Clear build cache
pnpm clean

# 2. Reinstall dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install

# 3. Type check specific package
pnpm --filter @campusnest/utils typecheck

# 4. Check for breaking changes in dependencies
# Look at node_modules/.pnpm and check version changes

# 5. Update type definitions if needed
pnpm add -D --filter @campusnest/web @types/node@latest
```

## Incident Response

### Incident Severity

| Level | Response Time | Examples |
|-------|---------------|----------|
| Critical (P1) | Immediate | Site down, data corruption, security breach |
| High (P2) | 15 minutes | Major feature broken, high error rate |
| Medium (P3) | 1 hour | Feature partially broken, performance degraded |
| Low (P4) | Next business day | Minor bugs, cosmetic issues |

### Critical: Site Down

```bash
# 1. Verify the issue
curl -I https://your-project.vercel.app
# Expected: 200 OK

# 2. Check Vercel status
# https://vercel.com/dashboard/incidents

# 3. Check Supabase status
# https://status.supabase.io/

# 4. Check GitHub Actions
# Is scraper or other jobs failing?

# 5. Rollback if needed
vercel rollback

# 6. Notify team
# Slack channel: #incidents

# 7. Post-incident review
# Create GitHub issue with timeline and learnings
```

### Critical: Database Issues

```bash
# 1. Check replication status
psql $SUPABASE_CONNECTION_STRING \
  -c "SELECT * FROM pg_stat_replication;"

# 2. Check disk space
psql $SUPABASE_CONNECTION_STRING \
  -c "SELECT pg_database.datname, pg_size_pretty(pg_database_size(pg_database.datname)) FROM pg_database ORDER BY pg_database_size(pg_database.datname) DESC;"

# 3. Check slow queries
psql $SUPABASE_CONNECTION_STRING \
  -c "SELECT query, calls, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# 4. Enable read-only mode if corruption
psql $SUPABASE_CONNECTION_STRING \
  -c "ALTER DATABASE your_db SET default_transaction_read_only = on;"

# 5. Restore from backup
# Supabase Dashboard → Database → Backups
# Request restore to Supabase team

# 6. Notify users
# Post status update
```

### Critical: Security Breach

```bash
# 1. IMMEDIATELY rotate exposed secrets
# - SUPABASE_SECRET_KEY
# - GEMINI_API_KEY / GOOGLE_APPLICATION_CREDENTIALS_JSON
# - STRIPE_SECRET_KEY

# 2. Update all references
vercel env add [VAR_NAME] [NEW_VALUE]
gh secret set [SECRET_NAME] -b "[NEW_VALUE]"

# 3. Check access logs
# Supabase: Authentication → Audit logs
# Vercel: Logs for suspicious activity
# Google AI / Vertex AI: API usage dashboard

# 4. Revoke old keys
# Remove from all platforms

# 5. Force redeployment with new secrets
vercel deploy --prod --force

# 6. Audit code for hardcoded secrets
git log -S "sk-" --oneline
git log -S "whsec_" --oneline

# 7. File security report
# Create private GitHub issue
```

## Maintenance

### Regular Tasks

#### Daily
- [ ] Monitor error rates (Vercel dashboard)
- [ ] Check Gemini API quota usage (Google Cloud Console)

#### Weekly
- [ ] Review scraper success logs
- [ ] Check database size and connections
- [ ] Monitor cost trends (Vercel, Supabase, Google AI / Vertex AI)

#### Monthly
- [ ] Review and rotate secrets if recommended
- [ ] Check for dependency updates
  ```bash
  pnpm outdated
  ```
- [ ] Test disaster recovery procedures
- [ ] Review and clean old deployments

#### Quarterly
- [ ] Security audit of dependencies
  ```bash
  pnpm audit
  ```
- [ ] Performance optimization review
- [ ] Update Node.js/pnpm if new versions available

### Backup & Recovery

#### Database Backups

Supabase automatically backs up daily. Manual backup:

```bash
# Create manual backup
pg_dump $SUPABASE_CONNECTION_STRING > backup_$(date +%Y%m%d).sql

# Verify backup
psql $SUPABASE_CONNECTION_STRING -f backup_20240304.sql --dry-run

# Store securely (encrypted cloud storage)
```

#### Code Recovery

```bash
# View git history
git log --oneline -20

# Revert problematic commit
git revert <commit-hash>
git push origin main

# Or reset if necessary
git reset --hard <commit-hash>  # DANGEROUS: only if not pushed
```

### Dependency Updates

```bash
# Check outdated packages
pnpm outdated

# Update minor/patch versions safely
pnpm update

# Update specific package
pnpm update --filter @campusnest/utils zod

# Test after updates
pnpm test
pnpm typecheck
pnpm build

# Create commit
git commit -am "chore: update dependencies"
```

### Performance Optimization

```bash
# Analyze bundle size
npm install -g webpack-bundle-analyzer

# Check build size
pnpm build
du -sh apps/web/.next

# Lighthouse audit (production)
# Visit https://your-project.vercel.app
# Chrome DevTools → Lighthouse
```

### Certificate & SSL Management

Vercel automatically handles SSL. If custom domain:

```bash
# View certificate
# Vercel Dashboard → Project → Settings → Domains

# Add custom domain
vercel domains add your-domain.com

# Verify DNS (wait 24-48 hours for propagation)
dig your-domain.com @8.8.8.8 +short
```

## Escalation

### Contact List

| Role | Contact | Availability |
|------|---------|--------------|
| Engineering Lead | Slack | During business hours |
| On-Call | Pagerduty | 24/7 |
| Supabase Support | support@supabase.io | Business hours |
| Google Cloud Support | Google Cloud Console → Support | Business hours |
| Vercel Support | Vercel Dashboard → Help | Business hours |

### Escalation Process

1. **Recognize severity** (P1-P4 above)
2. **Assess impact** (how many users affected)
3. **Attempt fix** (30 minutes for P1)
4. **Notify team** (Slack post)
5. **Escalate if needed** (contact On-Call)
6. **Document** (GitHub issue with timeline)
7. **Post-mortem** (within 1 week for P1/P2)

## Runtime Rebuild Migration Rollback

Applies to: migrations `032_conversation_state.sql`, `033_mission_runtime_queue.sql`, `034_harden_security_definer_functions.sql`.

### Apply order

1. `032_conversation_state.sql` — adds `conversations.conversation_state JSONB` column with a versioned state default
2. `033_mission_runtime_queue.sql` — adds queue/lease/retry columns to `missions`, creates `claim_next_mission_job()` helper, indexes for queue scans
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
SELECT column_name, data_type, is_nullable, column_default IS NOT NULL AS has_default
FROM information_schema.columns
WHERE table_name = 'conversations' AND column_name = 'conversation_state';
-- expect: conversation_state | jsonb | NO | true

-- 033
SELECT column_name FROM information_schema.columns
WHERE table_name = 'missions'
  AND column_name IN ('leased_until', 'last_heartbeat_at', 'attempt_count', 'last_error', 'step_attempts');
-- expect: 5 rows

SELECT proname, prosecdef FROM pg_proc
WHERE proname IN ('claim_next_mission_job');
-- expect: claim_next_mission_job | true

-- 034
SELECT proname, proacl FROM pg_proc
WHERE proname = 'claim_next_mission_job';
-- expect proacl to NOT include public/anon/authenticated EXECUTE
```

### Rollback order (REVERSE)

If any of the above verifications fail OR if production soak watch trips a rollback trigger:

```sql
-- Undo 034 — restore previous EXECUTE grants and search_path
-- (file's own DOWN block; if missing, manually re-grant by running the GRANT statements removed by 034)
GRANT EXECUTE ON FUNCTION public.claim_next_mission_job(INTEGER) TO service_role;
-- (do NOT restore EXECUTE for anon/authenticated; that was the bug)

-- Undo 033 — drop helpers and queue columns
DROP FUNCTION IF EXISTS public.claim_next_mission_job(INTEGER);
ALTER TABLE missions
  DROP COLUMN IF EXISTS leased_until,
  DROP COLUMN IF EXISTS last_heartbeat_at,
  DROP COLUMN IF EXISTS attempt_count,
  DROP COLUMN IF EXISTS last_error,
  DROP COLUMN IF EXISTS step_attempts;
DROP INDEX IF EXISTS idx_missions_queue_claim;  -- name from migration 033

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

### Feature flag stance

Decided 2026-05-01: **ALWAYS-ON, no env var flag.**

Rationale: the deterministic runtime is invoked unconditionally in `apps/web/app/api/ai/cribai/route.ts` via `maybeHandleDeterministicTurn` (defined in `apps/web/lib/cribai-runtime.ts`). When no deterministic intent matches (compare/detail/tour/etc), it returns `null` and the route falls through to the existing Gemini function-calling loop. There is no env var, build-time flag, or kill switch — gating lives in the intent matchers themselves. Adding a flag now would be cosmetic since the schema changes from migrations 032/033 are not feature-flaggable at runtime.

Rollback path if behavior is wrong in prod:

1. **Deploy revert** — Vercel UI → previous deploy → "Promote to Production" (reverts code to pre-merge SHA in <1 min)
2. **Migration rollback** — execute the SQL in "Rollback order (REVERSE)" above (034 → 033 → 032)
3. **Worker stop** — disable `missions-worker` workflow per "Worker stop (incident response)"

No quick-toggle env var exists — full rollback requires the deploy revert + migration rollback combo.

## References

- [Vercel Documentation](https://vercel.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Gemini API Docs](https://ai.google.dev/gemini-api/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

**Last Updated**: 2026-04-22
**Maintainers**: Engineering Team
