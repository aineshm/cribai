import { createSecretClient } from '@campusnest/supabase/server';
import type { ExecuteOptions, StepContext } from './types';
import { getMissionDefinition } from './registry';
import {
  getMission,
  updateMissionStatus,
  updateMissionState,
  setMissionResult,
  insertMissionLog,
  insertMissionDraft,
  getCampusSlug,
} from './mission-repository';

/**
 * Execute a mission's step pipeline sequentially.
 *
 * Designed to run inside Next.js `after()` — uses service-role client
 * (no cookie context), persists state after each step, and handles
 * HITL pause/resume via draft + current_step_index.
 *
 * This function never throws — all errors are caught, logged, and
 * reflected in the mission's status.
 */
export async function executeMission(options: ExecuteOptions): Promise<void> {
  const supabase = createSecretClient();

  // ── Fetch mission ──────────────────────────────────────
  let mission;
  try {
    mission = await getMission(supabase, options.missionId);
  } catch {
    console.error(`[executor] Mission not found: ${options.missionId}`);
    return;
  }

  // ── Guard: only run if pending or running ──────────────
  if (mission.status !== 'pending' && mission.status !== 'running') {
    console.warn(
      `[executor] Skipping mission ${options.missionId} — status is '${mission.status}'`,
    );
    return;
  }

  // ── Look up mission definition ──────────────────────────
  const definition = getMissionDefinition(mission.type);
  if (!definition) {
    await insertMissionLog(supabase, {
      mission_id: options.missionId,
      action: 'executor_error',
      detail: `No mission definition registered for type: ${mission.type}`,
      status: 'error',
    });
    await updateMissionStatus(supabase, options.missionId, 'failed');
    return;
  }

  // ── Set status to running ──────────────────────────────
  await updateMissionStatus(supabase, options.missionId, 'running');

  // ── Resolve campus context ─────────────────────────────
  const campusSlug = mission.campus_id
    ? await getCampusSlug(supabase, mission.campus_id)
    : 'unknown';

  // ── Execute steps ──────────────────────────────────────
  const startIndex = options.startFromStep ?? mission.current_step_index;
  let state: Readonly<Record<string, unknown>> = { ...mission.state };

  for (let i = startIndex; i < definition.steps.length; i++) {
    const step = definition.steps[i]!;

    // Log step start
    await insertMissionLog(supabase, {
      mission_id: options.missionId,
      action: step.id,
      detail: `Running: ${step.label}`,
      status: 'running',
      tool_name: step.tool ?? null,
    });

    try {
      const ctx: StepContext = {
        missionId: options.missionId,
        userId: mission.user_id,
        campusId: mission.campus_id ?? '',
        campusSlug,
        input: { ...mission.input },
        state,
        supabase,
      };

      const result = await step.run(ctx);

      // Immutable state accumulation
      state = { ...state, ...result.output };

      // Persist state + advance step index
      await updateMissionState(supabase, options.missionId, state, i + 1);

      // Log step completion
      await insertMissionLog(supabase, {
        mission_id: options.missionId,
        action: step.id,
        detail: `Completed: ${step.label}`,
        status: 'success',
        tool_name: step.tool ?? null,
        tool_output: result.output as Record<string, unknown>,
      });

      // HITL pause: save draft and wait for approval
      if (result.draft) {
        await insertMissionDraft(supabase, {
          mission_id: options.missionId,
          draft_type: result.draft.draftType,
          payload: result.draft.payload as Record<string, unknown>,
        });
        await updateMissionStatus(supabase, options.missionId, 'waiting_approval');
        return;
      }

      // Early completion
      if (result.done) {
        break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      await insertMissionLog(supabase, {
        mission_id: options.missionId,
        action: step.id,
        detail: `Failed: ${message}`,
        status: 'error',
        tool_name: step.tool ?? null,
      });

      await updateMissionStatus(supabase, options.missionId, 'failed');
      return;
    }
  }

  // ── Mission complete ───────────────────────────────────
  await setMissionResult(supabase, options.missionId, state);
  await updateMissionStatus(supabase, options.missionId, 'completed');
}
