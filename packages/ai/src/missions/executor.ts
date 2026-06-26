/**
 * MissionExecutor — sequential step pipeline runner with queue semantics.
 *
 * Uses a service-role Supabase client to persist state after each step and
 * cooperates with the durable worker by maintaining mission leases, retry
 * status, and resumable HITL pauses.
 */

import { createSecretClient } from '@campusnest/supabase/server';
import type { Mission } from '@campusnest/types';
import type { ExecuteOptions, StepContext } from './types';
import { getMissionDefinition } from './registry';
import {
  clearMissionLease,
  completeMission,
  getMission,
  heartbeatMissionLease,
  updateMissionStatus,
  updateMissionState,
  markMissionFailed,
  insertMissionLog,
  insertMissionDraft,
  getCampusSlug,
  getAllUnappliedSteerings,
  markMissionRetrying,
  markMissionWaitingApproval,
  markSteeringApplied,
  updateMissionInput,
} from './mission-repository';
import { parseSteeringIntent } from './steering-parser';

const DEFAULT_LEASE_SECONDS = 300;
// Heartbeat at ~1/3 of the lease window so two heartbeats fit comfortably
// before the lease would expire — prevents a sibling worker from re-claiming
// the mission while a long-running step is still executing.
const HEARTBEAT_INTERVAL_MS = Math.floor((DEFAULT_LEASE_SECONDS / 3) * 1000);
const MAX_STEP_RETRIES = 2;

function parseStepAttempts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>(
    (acc, [key, count]) => {
      if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
        acc[key] = Math.trunc(count);
      }
      return acc;
    },
    {},
  );
}

function isRetryableError(message: string): boolean {
  return !/(invalid|not found|forbidden|unauthorized|signed in|permission|zod|validation)/i.test(
    message,
  );
}

/**
 * Execute a mission's step pipeline sequentially.
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
  if (!['queued', 'retrying', 'pending', 'running'].includes(mission.status)) {
    console.warn(
      `[executor] Skipping mission ${options.missionId} — status is '${mission.status}'`,
    );
    return;
  }

  // ── Look up mission definition ──────────────────────────
  const definition = getMissionDefinition(mission.type);
  if (!definition) {
    const noDefMessage = `No mission definition registered for type: ${mission.type}`;
    console.error(`[executor] ${noDefMessage}`);
    await insertMissionLog(supabase, {
      mission_id: options.missionId,
      action: 'executor_error',
      detail: noDefMessage,
      status: 'error',
    });
    // Use markMissionFailed (not updateMissionStatus) so last_error is durably
    // persisted — updateMissionStatus only sets status, leaving last_error=NULL.
    await markMissionFailed(supabase, options.missionId, noDefMessage, {});
    return;
  }

  // ── Refresh the lease and set status to running ────────
  await updateMissionStatus(supabase, options.missionId, 'running');
  await heartbeatMissionLease(supabase, options.missionId, DEFAULT_LEASE_SECONDS);

  // ── Resolve campus context ─────────────────────────────
  const campusSlug = mission.campus_id
    ? await getCampusSlug(supabase, mission.campus_id)
    : 'unknown';

  // ── Execute steps ──────────────────────────────────────
  // Resume from explicit step or persisted index (supports HITL resume after approval)
  const startIndex = options.startFromStep ?? mission.current_step_index;
  // Spread to create a mutable copy — each step's output is merged immutably
  let state: Readonly<Record<string, unknown>> = { ...mission.state };
  let stepAttempts = parseStepAttempts(
    (mission as Mission & { readonly step_attempts?: unknown }).step_attempts,
  );

  for (let i = startIndex; i < definition.steps.length; i++) {
    const step = definition.steps[i]!;

    await heartbeatMissionLease(supabase, options.missionId, DEFAULT_LEASE_SECONDS);

    // Log step start
    await insertMissionLog(supabase, {
      mission_id: options.missionId,
      action: step.id,
      detail: `Running: ${step.label}`,
      status: 'running',
      tool_name: step.tool ?? null,
    });

    // Pulse the mission lease throughout the step so claim_next_mission_job
    // cannot re-claim this row while we're still working on it. Without this,
    // any step that exceeds DEFAULT_LEASE_SECONDS lets a second worker pick
    // up the mission and re-run side-effectful tools (e.g. duplicate insert
    // in sublease_post). The interval is cleared in `finally` so it runs
    // even when the step throws or pauses for HITL approval.
    const heartbeatTimer: NodeJS.Timeout = setInterval(() => {
      void heartbeatMissionLease(
        supabase,
        options.missionId,
        DEFAULT_LEASE_SECONDS,
      ).catch((err) => {
        const msg = err instanceof Error ? err.message : 'unknown';
        console.warn(
          `[executor] Heartbeat failed for mission ${options.missionId}: ${msg}`,
        );
      });
    }, HEARTBEAT_INTERVAL_MS);

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

      // ── Steering check: apply all pending mid-mission corrections ───────────
      // Fetches every unapplied steering in chronological order so the newest
      // correction wins when multiple arrive between steps (Bug: reverse-replay).
      // On the final step (result.done or last index) steerings are left unapplied
      // and logged as too-late — no subsequent step exists to consume the change.
      // Never throws — failures are warned and skipped to keep the mission alive.
      try {
        const pendingSteerings = await getAllUnappliedSteerings(supabase, options.missionId);
        if (pendingSteerings.length > 0) {
          const isLastStep = result.done === true || i === definition.steps.length - 1;

          if (isLastStep) {
            // No subsequent step will run — updating input would have no effect.
            // Leave steerings unapplied so they remain visible in the audit trail.
            for (const steering of pendingSteerings) {
              await insertMissionLog(supabase, {
                mission_id: options.missionId,
                action: 'steering_too_late',
                detail: `Steering arrived after final step and was not applied: "${steering.raw_input}"`,
                status: 'error',
                tool_output: null,
              });
            }
          } else {
            // Apply all pending steerings oldest-first so the newest correction wins.
            // Collect parse results first so we can persist input before marking applied.
            type SteeringResult = {
              steering: typeof pendingSteerings[number];
              parsed: Record<string, unknown>;
            };
            const applied: SteeringResult[] = [];
            let inputUpdated = false;

            for (const steering of pendingSteerings) {
              const parsed = await parseSteeringIntent(
                steering.raw_input,
                mission.type,
                mission.input,
              );
              if (parsed !== null) {
                if (Object.keys(parsed).length > 0) {
                  // Immutably fold into mission.input — later steerings overwrite earlier ones
                  mission = { ...mission, input: { ...mission.input, ...parsed } };
                  inputUpdated = true;
                }
                applied.push({ steering, parsed });
              } else {
                // Parse failed — leave unapplied so it is retried on the next step
                console.warn(
                  `[executor] Steering parse failed for mission ${options.missionId}, steering ${steering.id}`,
                );
              }
            }

            // Persist the final merged input BEFORE marking steerings applied.
            // If the DB write fails, steerings remain unapplied and will be retried
            // on the next step rather than being silently lost.
            if (inputUpdated) {
              await updateMissionInput(supabase, options.missionId, mission.input);
            }

            // Only mark steerings applied (and log them) after input is durably persisted
            for (const { steering, parsed } of applied) {
              await markSteeringApplied(supabase, steering.id);
              await insertMissionLog(supabase, {
                mission_id: options.missionId,
                action: 'steering_applied',
                detail: `Steering applied: "${steering.raw_input}"`,
                status: 'success',
                tool_output: Object.keys(parsed).length > 0
                  ? (parsed as Record<string, unknown>)
                  : null,
              });
            }
          }
        }
      } catch (steeringErr) {
        const msg = steeringErr instanceof Error ? steeringErr.message : 'unknown';
        console.warn(`[executor] Steering check error for mission ${options.missionId}: ${msg}`);
        // Steering errors never kill the mission — continue to next step
      }

      // HITL pause: save draft and wait for user approval.
      // Execution stops here — the approve endpoint resumes from current_step_index.
      if (result.draft) {
        await insertMissionDraft(supabase, {
          mission_id: options.missionId,
          draft_type: result.draft.draftType,
          payload: result.draft.payload as Record<string, unknown>,
        });
        await markMissionWaitingApproval(supabase, options.missionId);
        return;
      }

      // Early completion
      if (result.done) {
        break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const nextStepAttempts = {
        ...stepAttempts,
        [step.id]: (stepAttempts[step.id] ?? 0) + 1,
      };
      stepAttempts = nextStepAttempts;
      const currentStepAttempts = nextStepAttempts[step.id] ?? 0;
      const retryable = isRetryableError(message) && currentStepAttempts <= MAX_STEP_RETRIES;

      await insertMissionLog(supabase, {
        mission_id: options.missionId,
        action: step.id,
        detail: retryable
          ? `Retry scheduled: ${message}`
          : `Failed: ${message}`,
        status: 'error',
        tool_name: step.tool ?? null,
      });

      if (retryable) {
        await markMissionRetrying(
          supabase,
          options.missionId,
          message,
          nextStepAttempts,
        );
      } else {
        await markMissionFailed(
          supabase,
          options.missionId,
          message,
          nextStepAttempts,
        );
      }
      return;
    } finally {
      // Always stop the heartbeat timer — covers completion, HITL pause,
      // early break (done=true), and the catch-block `return` above.
      clearInterval(heartbeatTimer);
    }
  }

  // ── Mission complete ───────────────────────────────────
  await completeMission(supabase, options.missionId, state);
  await clearMissionLease(supabase, options.missionId);
}
