import { NextRequest, NextResponse } from 'next/server';
import { runMissionQueueOnce } from '@campusnest/ai';

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

  const result = await runMissionQueueOnce({
    maxJobs: Number.isFinite(maxJobs) ? maxJobs : 1,
    leaseSeconds: Number.isFinite(leaseSeconds) ? leaseSeconds : 300,
  });

  return NextResponse.json(result);
}

