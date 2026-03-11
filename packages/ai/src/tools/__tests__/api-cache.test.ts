import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCached, setCache } from '../lib/api-cache';
import { createMockQueryBuilder, createMockContext } from './helpers';

describe('api-cache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getCached', () => {
    it('returns data when entry exists and is not expired', async () => {
      const cached = { foo: 'bar' };
      const builder = createMockQueryBuilder(null);
      builder.single.mockResolvedValue({
        data: {
          response: cached,
          expires_at: '2026-06-01T13:00:00Z', // 1 hour in the future
        },
        error: null,
      });

      const ctx = createMockContext();
      (ctx.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);

      const result = await getCached(ctx.supabase, 'test-key');

      expect(result).toEqual(cached);
      expect(ctx.supabase.from).toHaveBeenCalledWith('api_cache');
      expect(builder.eq).toHaveBeenCalledWith('key', 'test-key');
    });

    it('returns null when entry is expired', async () => {
      const builder = createMockQueryBuilder(null);
      builder.single.mockResolvedValue({
        data: {
          response: { foo: 'bar' },
          expires_at: '2026-06-01T11:00:00Z', // 1 hour in the past
        },
        error: null,
      });

      const ctx = createMockContext();
      (ctx.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);

      const result = await getCached(ctx.supabase, 'expired-key');

      expect(result).toBeNull();
    });

    it('returns null when no entry exists', async () => {
      const builder = createMockQueryBuilder(null);
      builder.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      const ctx = createMockContext();
      (ctx.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);

      const result = await getCached(ctx.supabase, 'missing-key');

      expect(result).toBeNull();
    });
  });

  describe('setCache', () => {
    it('upserts with correct key, response, and computed expires_at', async () => {
      const builder = createMockQueryBuilder();
      const ctx = createMockContext();
      (ctx.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);

      const ttlMs = 3600_000; // 1 hour
      await setCache(ctx.supabase, 'cache-key', { data: 123 }, ttlMs);

      expect(ctx.supabase.from).toHaveBeenCalledWith('api_cache');
      expect(builder.upsert).toHaveBeenCalledWith(
        {
          key: 'cache-key',
          response: { data: 123 },
          expires_at: '2026-06-01T13:00:00.000Z',
        },
        { onConflict: 'key' },
      );
    });
  });
});
