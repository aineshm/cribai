import { createSecretClient } from '@campusnest/supabase/server';
import type { Mission } from '@campusnest/types';
import { claimNextMission } from './mission-repository';
import { executeMission } from './executor';

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
  const maxJobs = Math.max(1, options.maxJobs ?? 1);
  const leaseSeconds = Math.max(30, options.leaseSeconds ?? 300);
  const claimedMissionIds: string[] = [];
  const claimedMissions: Array<{
    readonly id: string;
    readonly type: string;
    readonly startFromStep: number;
  }> = [];

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

  return {
    claimedMissionIds,
    claimedMissions,
    processed: claimedMissionIds.length,
  };
}

export function summarizeClaimedMissions(missions: readonly Mission[]): readonly string[] {
  return missions.map((mission) => mission.id);
}
