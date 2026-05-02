# CampusNest Product Status

Last updated: 2026-04-22

## Current Branch State

- Active branch: `runtime-rebuild`
- Current runtime rebuild commit: `daa268e`
- Remote state: local branch is ahead of `origin/main` by 1 commit
- Production state: not confirmed deployed
- Unrelated local noise: `.worktrees/` remains untracked and should not be shipped

## Runtime Rebuild Status

The runtime rebuild has been implemented in the product repo code path but is not yet a fully proven production rollout.

Completed in code:

- `conversation_state` schema and migration added
- chat route loads, merges, and persists durable conversation state
- deterministic chat runtime handles search, listing detail, compare, tour prep, and tour submit flows before legacy fallback
- `ToolResult` supports `machineData` and `statePatch`
- chat-critical tools emit typed machine payloads and state patches
- mission creation and approval enqueue work instead of relying on `after()`
- mission queue metadata, leasing, retries, and worker entrypoints added
- explore now uses featured boot payloads plus viewport API fetches instead of full-corpus page boot
- public listing detail API and search listings API added
- manual mission Queue/Past UI added
- GitHub Actions one-shot mission worker workflow added as a stopgap

Verified locally during implementation:

- `pnpm -C packages/types test -- src/__tests__/mission-types.test.ts`
- `pnpm -C packages/types build`
- `pnpm -C packages/ai build`
- `pnpm -C packages/ai typecheck`
- `pnpm -C apps/web typecheck`
- pre-commit/pre-push hook also ran `pnpm build` successfully before the interrupted push

Not yet done:

- runtime branch still needs to be pushed/merged/deployed
- Supabase migrations `032_conversation_state.sql` and `033_mission_runtime_queue.sql` must be applied to the target database before worker execution
- production scheduler/worker is not active
- golden E2E flows have not been re-run after the rebuild
- first-token and model-call metrics from the spec are not instrumented/proven yet

## Mission Worker / Oracle Status

The worker code exists, but production execution is paused.

Implemented:

- `pnpm worker:missions`
- `pnpm worker:missions -- --once`
- GitHub Actions workflow `.github/workflows/missions-worker.yml`
- runbook documentation for local, GitHub Actions, and Oracle-style execution

Oracle Cloud status as of 2026-04-22:

- OCI CLI auth works locally
- tenancy is subscribed only to `us-chicago-1`
- Chicago VCN was rebuilt successfully:
  - `worker-vcn`
  - `worker-public-subnet`
  - internet gateway
  - default route to `0.0.0.0/0`
  - SSH port `22` open
- dedicated SSH key exists at `~/.ssh/oracle-worker`
- `VM.Standard.A1.Flex` free-tier capacity is unavailable in all three Chicago availability domains
- no worker VM has been launched
- Ashburn switch was not completed because the tenancy is not subscribed to `us-ashburn-1`

Recommended next step:

- either keep retrying Chicago A1 capacity manually, or create/enable a tenancy/region with available A1 capacity
- once a VM exists, install Node/pnpm/git, clone the repo, apply env vars, run `pnpm worker:missions -- --once`, then add cron

## Highest Priority Next Work

1. Push `runtime-rebuild` and open review against the intended base branch.
2. Apply and verify Supabase migrations `032` and `033` in the target environment.
3. Run the golden flows from the runtime rebuild spec:
   - search -> compare -> detail -> tour
   - listing CTA -> follow-up -> deep dive mission
   - chat search -> map sync -> refine -> compare top 2
   - mission approval -> resume -> completion
4. Decide worker hosting:
   - GitHub Actions stopgap
   - Oracle VM once capacity exists
   - paid/managed worker if free capacity remains blocked

## Operational Risk

The product code is now ahead of deployed infrastructure. Do not treat queued missions as production-ready until:

- migrations are live
- one worker path is active
- retry behavior is observed on real mission rows
- logs are monitored
