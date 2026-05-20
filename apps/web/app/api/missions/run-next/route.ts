import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runMissionQueueOnce } from '@campusnest/ai';

const MAX_JOBS_PER_REQUEST = 10;
const MIN_LEASE_SECONDS = 30;
const MAX_LEASE_SECONDS = 1800;
const BEARER_PREFIX = 'Bearer ';

// TODO(AIN-xxx): add rate limiting before public worker traffic to prevent
// authorized callers from starving the mission queue with rapid claims.

/**
 * Returns true only when the request's Authorization header carries the
 * configured CRON_SECRET. Fails closed in every environment when the secret
 * is missing — never auto-trusts in dev/preview.
 */
function isWorkerAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return false;
  }

  const provided = authHeader.slice(BEARER_PREFIX.length);
  const expectedBytes = Buffer.from(secret, 'utf8');
  const providedBytes = Buffer.from(provided, 'utf8');

  // timingSafeEqual throws on unequal-length buffers — check length first.
  if (expectedBytes.length !== providedBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, providedBytes);
}

export async function POST(request: NextRequest) {
  if (!isWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const maxJobs = Number(url.searchParams.get('maxJobs') ?? '1');
  const leaseSeconds = Number(url.searchParams.get('leaseSeconds') ?? '300');
  const clampedMaxJobs = Number.isFinite(maxJobs)
    ? Math.min(Math.max(Math.floor(maxJobs), 1), MAX_JOBS_PER_REQUEST)
    : 1;
  const clampedLeaseSeconds = Number.isFinite(leaseSeconds)
    ? Math.min(Math.max(Math.floor(leaseSeconds), MIN_LEASE_SECONDS), MAX_LEASE_SECONDS)
    : 300;

  const result = await runMissionQueueOnce({
    maxJobs: clampedMaxJobs,
    leaseSeconds: clampedLeaseSeconds,
  });

  return NextResponse.json(result);
}
