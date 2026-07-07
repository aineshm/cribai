/**
 * AIN-93 Task 2 — conversations row helper. Uses the same
 * stubbed-`.from()`-chain convention as `crm/__tests__/add-listing.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createConversationRow, deleteConversationRow } from '../conversation';

function fakeSupabase(fromImpl: (table: string) => unknown): SupabaseClient {
  return { from: vi.fn(fromImpl) } as unknown as SupabaseClient;
}

describe('createConversationRow', () => {
  it('inserts a row owned by userId and returns its UUID id', async () => {
    const insertSpy = vi.fn();
    const supabase = fakeSupabase((table) => {
      expect(table).toBe('conversations');
      return {
        insert: insertSpy.mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: '11111111-1111-4111-8111-111111111111' },
              error: null,
            }),
          }),
        }),
      };
    });

    const id = await createConversationRow(supabase, { userId: 'user-abc' });

    expect(id).toBe('11111111-1111-4111-8111-111111111111');
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-abc', title: expect.any(String) }),
    );
  });

  it('uses a caller-supplied title when given', async () => {
    const insertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'id-1' }, error: null }),
      }),
    });
    const supabase = fakeSupabase(() => ({ insert: insertSpy }));

    await createConversationRow(supabase, { userId: 'u', title: 'AIN-93 scenario X' });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'AIN-93 scenario X' }),
    );
  });

  it('throws when the insert errors', async () => {
    const supabase = fakeSupabase(() => ({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
        }),
      }),
    }));

    await expect(createConversationRow(supabase, { userId: 'u' })).rejects.toThrow(/db down/);
  });
});

describe('deleteConversationRow', () => {
  it('deletes by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabase = fakeSupabase((table) => {
      expect(table).toBe('conversations');
      return { delete: deleteSpy };
    });

    await deleteConversationRow(supabase, 'conv-1');

    expect(deleteSpy).toHaveBeenCalled();
    expect(eqSpy).toHaveBeenCalledWith('id', 'conv-1');
  });

  it('never throws — logs a warning on delete failure', async () => {
    const supabase = fakeSupabase(() => ({
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: { message: 'nope' } }) }),
    }));

    await expect(deleteConversationRow(supabase, 'conv-1')).resolves.toBeUndefined();
  });
});
