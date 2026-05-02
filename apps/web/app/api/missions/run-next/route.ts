import { NextRequest, NextResponse } from 'next/server';
import { runMissionQueueOnce } from '@campusnest/ai';

const MAX_JOBS_PER_REQUEST = 10;
const MIN_LEASE_SECONDS = 30;
const MAX_LEASE_SECONDS = 1800;

function isWorkerAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
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
