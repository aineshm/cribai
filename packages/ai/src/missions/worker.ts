import { createSecretClient } from '@campusnest/supabase/server';
import type { Mission } from '@campusnest/types';
import { claimNextMission } from './mission-repository';
import { executeMission } from './executor';
// Populate the mission registry — worker.ts never imports the barrel (index.ts)
// so registerMission() would never run without this explicit import.
import './register';
// Worker process must register the Langfuse OTel span processor itself — the
// chat route's initLangfuse() runs in a different process (Next.js server) and
// has no effect here. Without this, mission LLM steps (synthesize, reanalyze)
// produce no spans and all mission traces are silently absent from Langfuse.
import { initLangfuse, flushLangfuse } from '../runtime/observability';

const MAX_JOBS_PER_RUN = 10;
const MIN_LEASE_SECONDS = 30;
const MAX_LEASE_SECONDS = 1800;

export interface MissionQueueRunResult {
  readonly claimedMissionIds: readonly string[];
  readonly claimedMissions: readonly {
    readonly id: string;
    readonly type: string;
    readonly startFromStep: number;
  }[];
  readonly processed: number;
}

export interface RunMissionQueueOptions {
  readonly maxJobs?: number;
  readonly leaseSeconds?: number;
}

/**
 * Claim and execute up to `maxJobs` runnable missions.
 * Workers call this entrypoint instead of relying on request-lifecycle hooks.
 */
export async function runMissionQueueOnce(
  options: RunMissionQueueOptions = {},
): Promise<MissionQueueRunResult> {
  const supabase = createSecretClient();
  const maxJobs = Math.min(Math.max(Math.floor(options.maxJobs ?? 1), 1), MAX_JOBS_PER_RUN);
  const leaseSeconds = Math.min(
    Math.max(Math.floor(options.leaseSeconds ?? 300), MIN_LEASE_SECONDS),
    MAX_LEASE_SECONDS,
  );
  const claimedMissionIds: string[] = [];
  const claimedMissions: Array<{
    readonly id: string;
    readonly type: string;
    readonly startFromStep: number;
  }> = [];

  // Idempotently register the Langfuse OTel span processor for this process.
  // Safe to call on every queue drain — initLangfuse() installs the processor
  // only once per process and is a no-op when LANGFUSE_* keys are absent.
  initLangfuse();

  try {
    for (let i = 0; i < maxJobs; i++) {
      const mission = await claimNextMission(supabase, leaseSeconds);
      if (!mission) {
        break;
      }

      claimedMissionIds.push(mission.id);
      claimedMissions.push({
        id: mission.id,
        type: mission.type,
        startFromStep: mission.current_step_index,
      });
      await executeMission({ missionId: mission.id, startFromStep: mission.current_step_index });
    }
  } finally {
    // Flush buffered Langfuse spans before the process may exit. Runs on every
    // return path — including when claimNextMission or executeMission throws —
    // so no spans are lost on unexpected failures. flushLangfuse() always
    // resolves (no-op when Langfuse is not configured).
    await flushLangfuse();
  }

  return {
    claimedMissionIds,
    claimedMissions,
    processed: claimedMissionIds.length,
  };
}

export function summarizeClaimedMissions(missions: readonly Mission[]): readonly string[] {
  return missions.map((mission) => mission.id);
}
