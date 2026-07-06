import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useCrmChat } from '../useCrmChat';
import type { ChatMessage } from '@/lib/crm/chat-messages';

const isSavedUnit = (m: ChatMessage): m is Extract<ChatMessage, { kind: 'saved-unit' }> =>
  m.kind === 'saved-unit';

describe('useCrmChat', () => {
  it('a pasted URL yields a saved-unit then an analysis message', async () => {
    const { result } = renderHook(() => useCrmChat());
    act(() => {
      result.current.send('https://www.chapteratmadison.com/floor-plan/studio-s1/');
    });
    await waitFor(() => expect(result.current.messages.some((m) => m.kind === 'saved-unit')).toBe(true));
    await waitFor(() => expect(result.current.messages.some((m) => m.kind === 'analysis')).toBe(true));
  });

  it('a "rank" message yields a rank message', async () => {
    const { result } = renderHook(() => useCrmChat());
    act(() => {
      result.current.send('rank my places');
    });
    await waitFor(() => expect(result.current.messages.some((m) => m.kind === 'rank')).toBe(true));
  });

  it('echoes the user text and answers other messages with a canned text reply', async () => {
    const { result } = renderHook(() => useCrmChat());
    act(() => {
      result.current.send('hello there');
    });
    // The user's own message is echoed immediately as a user-role text bubble.
    expect(result.current.messages.some((m) => m.kind === 'text' && m.role === 'user')).toBe(true);
    await waitFor(() =>
      expect(result.current.messages.some((m) => m.kind === 'text' && m.role === 'assistant')).toBe(true),
    );
  });

  // AIN-95 follow-up: propagate a drawer rename into the thread's saved-unit
  // message so the chat card reflects the new name without a reload.
  it('renameUnit immutably updates the matching saved-unit message', async () => {
    const { result } = renderHook(() => useCrmChat());
    act(() => {
      result.current.send('https://www.chapteratmadison.com/floor-plan/studio-s1/');
    });
    await waitFor(() => expect(result.current.messages.some(isSavedUnit)).toBe(true));

    const before = result.current.messages.find(isSavedUnit)!;

    act(() => {
      result.current.renameUnit(before.unit.id, 'The Regent gem');
    });

    const after = result.current.messages.find(isSavedUnit)!;
    expect(after).not.toBe(before);
    expect(after.unit).not.toBe(before.unit);
    expect(after.unit.nickname).toBe('The Regent gem');
    expect(after.unit._proposed.unit.building).toBe('The Regent gem');
  });
});
