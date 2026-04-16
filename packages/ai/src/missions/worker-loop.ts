import os from 'node:os';
import process from 'node:process';
import { runMissionQueueOnce } from './worker';

interface WorkerConfig {
  readonly intervalMs: number;
  readonly idleLogIntervalMs: number;
  readonly maxJobsPerTick: number;
  readonly leaseSeconds: number;
  readonly runOnce: boolean;
}

function getNumberEnv(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, parsed);
}

function getConfig(): WorkerConfig {
  return {
    intervalMs: getNumberEnv('MISSION_WORKER_INTERVAL_MS', 5000, 1000),
    idleLogIntervalMs: getNumberEnv('MISSION_WORKER_IDLE_LOG_INTERVAL_MS', 60000, 5000),
    maxJobsPerTick: getNumberEnv('MISSION_WORKER_MAX_JOBS_PER_TICK', 5, 1),
    leaseSeconds: getNumberEnv('MISSION_WORKER_LEASE_SECONDS', 300, 30),
    runOnce:
      process.argv.includes('--once') ||
      process.env.MISSION_WORKER_RUN_ONCE === '1' ||
      process.env.MISSION_WORKER_RUN_ONCE === 'true',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(event: string, payload?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      source: 'mission-worker',
      event,
      pid: process.pid,
      host: os.hostname(),
      ...(payload ?? {}),
    }),
  );
}

async function main() {
  const config = getConfig();
  let shouldStop = false;
  let lastIdleLogAt = 0;

  const shutdown = (signal: NodeJS.Signals) => {
    shouldStop = true;
    log('shutdown_requested', { signal });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log('worker_started', {
    config,
    nodeEnv: process.env.NODE_ENV ?? null,
  });

  while (!shouldStop) {
    const tickStartedAt = Date.now();
    const tickId = `${tickStartedAt}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      log('tick_started', { tickId });
      const result = await runMissionQueueOnce({
        maxJobs: config.maxJobsPerTick,
        leaseSeconds: config.leaseSeconds,
      });
      const durationMs = Date.now() - tickStartedAt;

      if (result.processed > 0) {
        log('tick_processed', {
          tickId,
          durationMs,
          processed: result.processed,
          claimedMissionIds: result.claimedMissionIds,
          claimedMissions: result.claimedMissions,
        });
      } else if (tickStartedAt - lastIdleLogAt >= config.idleLogIntervalMs) {
        lastIdleLogAt = tickStartedAt;
        log('tick_idle', {
          tickId,
          durationMs,
          intervalMs: config.intervalMs,
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown worker error');
      log('tick_error', {
        tickId,
        message: err.message,
        stack: err.stack ?? null,
      });
    }

    if (config.runOnce) {
      break;
    }

    if (!shouldStop) {
      await sleep(config.intervalMs);
    }
  }

  log('worker_stopped');
}

void main().catch((error) => {
  const err = error instanceof Error ? error : new Error('Unknown worker fatal error');
  log('worker_fatal', {
    message: err.message,
    stack: err.stack ?? null,
  });
  process.exitCode = 1;
});
