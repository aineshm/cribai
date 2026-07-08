/**
 * Tests for the first-run intro seed (AIN-104.2).
 *
 * `useCrmChat` seeds one client-side assistant `text` message the first time
 * the CRM chat ever mounts in this browser — never an LLM turn. Gated by the
 * `cribai.crm_intro_seen` localStorage flag so it fires exactly once per
 * browser, and by `messages.length === 0` so it never overwrites a live
 * thread. localStorage access is wrapped in try/catch (private-mode Safari
 * throws on write) — a failure degrades to "don't seed", never a crash.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useCrmChat } from '../useCrmChat';

const INTRO_SEEN_KEY = 'cribai.crm_intro_seen';
const INTRO_SNIPPET = "I'm CribAI, your apartment-hunting copilot";

describe('useCrmChat — first-run intro seed (AIN-104.2)', () => {
  it('seeds the intro message once when the thread is empty and the flag is unset', async () => {
    expect(window.localStorage.getItem(INTRO_SEEN_KEY)).toBeNull();

    const { result } = renderHook(() => useCrmChat());

    await waitFor(() =>
      expect(
        result.current.messages.some(
          (m) => m.kind === 'text' && m.role === 'assistant' && m.text.includes(INTRO_SNIPPET),
        ),
      ).toBe(true),
    );

    // The verbatim copy mentions the extension, the CribAI checks it runs,
    // and the My Apartments panel — spot-check a couple of the founder-locked
    // phrases so a future edit can't silently drift the message.
    const intro = result.current.messages.find(
      (m) => m.kind === 'text' && m.role === 'assistant' && m.text.includes(INTRO_SNIPPET),
    );
    expect(intro).toBeDefined();
    expect((intro as { text: string }).text).toContain('rank my places');
    expect((intro as { text: string }).text).toContain('My Apartments panel');

    expect(window.localStorage.getItem(INTRO_SEEN_KEY)).toBeTruthy();
  });

  it('never seeds when the flag is already set', async () => {
    window.localStorage.setItem(INTRO_SEEN_KEY, '1');

    const { result } = renderHook(() => useCrmChat());

    // Give the mount effect a tick to (not) fire.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      result.current.messages.some((m) => m.kind === 'text' && m.text.includes(INTRO_SNIPPET)),
    ).toBe(false);
  });

  it('does not seed a second intro after further interaction in the same session', async () => {
    const { result } = renderHook(() => useCrmChat());

    await waitFor(() =>
      expect(
        result.current.messages.filter(
          (m) => m.kind === 'text' && m.text.includes(INTRO_SNIPPET),
        ).length,
      ).toBe(1),
    );

    result.current.send('hello there');

    await waitFor(() =>
      expect(result.current.messages.some((m) => m.kind === 'text' && m.role === 'user')).toBe(
        true,
      ),
    );

    expect(
      result.current.messages.filter((m) => m.kind === 'text' && m.text.includes(INTRO_SNIPPET))
        .length,
    ).toBe(1);
  });

  it('degrades to no-seed without crashing when localStorage throws (private-mode Safari)', async () => {
    const getItemSpy = vi
      .spyOn(window.localStorage.__proto__, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked in private mode');
      });
    const setItemSpy = vi
      .spyOn(window.localStorage.__proto__, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked in private mode');
      });

    expect(() => renderHook(() => useCrmChat())).not.toThrow();
    const { result } = renderHook(() => useCrmChat());

    // Give the mount effect a tick — it must not throw and must not seed.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      result.current.messages.some((m) => m.kind === 'text' && m.text.includes(INTRO_SNIPPET)),
    ).toBe(false);

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});
