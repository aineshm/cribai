import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@campusnest/ai', () => ({
  runMissionQueueOnce: vi.fn(),
}));

import { runMissionQueueOnce } from '@campusnest/ai';
import { POST } from '../route';

const mockRun = vi.mocked(runMissionQueueOnce);

function buildRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/missions/run-next', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/missions/run-next', () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockRun.mockReset();
    mockRun.mockResolvedValue({ claimed: 0, completed: 0 } as never);
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
    if (originalNodeEnv === undefined) {
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    } else {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    }
  });

  it('returns 401 with no Authorization header even when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const res = await POST(buildRequest());
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('returns 401 with a wrong secret', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const res = await POST(
      buildRequest({ authorization: 'Bearer not-the-secret' }),
    );
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('returns 401 in development when CRON_SECRET is unset (no dev fallthrough)', async () => {
    delete process.env.CRON_SECRET;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    const res = await POST(buildRequest());
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('returns 401 in production when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const res = await POST(buildRequest());
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('returns 401 when the provided token is a prefix of the expected secret', async () => {
    // Guards against silent acceptance via length mismatch handling.
    process.env.CRON_SECRET = 'super-secret-long';
    const res = await POST(
      buildRequest({ authorization: 'Bearer super-secret' }),
    );
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('returns 200 when the secret matches', async () => {
    process.env.CRON_SECRET = 'super-secret';
    mockRun.mockResolvedValueOnce({ claimed: 1, completed: 1 } as never);
    const res = await POST(
      buildRequest({ authorization: 'Bearer super-secret' }),
    );
    expect(res.status).toBe(200);
    expect(mockRun).toHaveBeenCalledOnce();
  });
});
