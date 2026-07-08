/**
 * Tests for the AIN-98 extension-context-invalidated guard.
 *
 * When the extension is reloaded/updated/uninstalled, every content script
 * still injected into an already-open tab has its `chrome.runtime` context
 * invalidated: `chrome.runtime.id` becomes `undefined`, and calling
 * `chrome.runtime.sendMessage` throws synchronously ("Extension context
 * invalidated."). `content/index.ts`'s poll interval (`checkNavigation`
 * every 1.5s) and both its `sendMessage` call sites (CHECK_SAVED on mount,
 * CONTENT_SAVE_LISTING on click) never checked for this — an old tab left
 * open across a reload spammed the console with uncaught throws forever
 * (the interval never stops itself).
 *
 * Pure module, no real `chrome.*` types — `RuntimeLike` is a minimal
 * structural shape so this stays chrome-free/DOM-free per the extension's
 * node-env test convention.
 */
import { describe, it, expect, vi } from 'vitest';
import { isExtensionContextAlive, safeSendMessage, type RuntimeLike } from '../runtime-guard';

describe('isExtensionContextAlive', () => {
  it('returns true when runtime.id is a non-empty string', () => {
    expect(isExtensionContextAlive({ id: 'abcd1234', sendMessage: vi.fn() })).toBe(true);
  });

  it('returns false when runtime.id is undefined (context invalidated)', () => {
    expect(isExtensionContextAlive({ id: undefined, sendMessage: vi.fn() })).toBe(false);
  });

  it('returns false when runtime itself is undefined or null', () => {
    expect(isExtensionContextAlive(undefined)).toBe(false);
    expect(isExtensionContextAlive(null)).toBe(false);
  });
});

describe('safeSendMessage', () => {
  it('calls runtime.sendMessage normally when the context is alive', () => {
    const sendMessage = vi.fn();
    const runtime: RuntimeLike = { id: 'abcd1234', sendMessage };
    const callback = vi.fn();
    const onDead = vi.fn();

    safeSendMessage(runtime, { type: 'CHECK_SAVED' }, callback, onDead);

    expect(sendMessage).toHaveBeenCalledWith({ type: 'CHECK_SAVED' }, callback);
    expect(onDead).not.toHaveBeenCalled();
  });

  it('calls onDead instead of sendMessage when runtime.id is already undefined', () => {
    const sendMessage = vi.fn();
    const runtime: RuntimeLike = { id: undefined, sendMessage };
    const onDead = vi.fn();

    safeSendMessage(runtime, { type: 'CHECK_SAVED' }, vi.fn(), onDead);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  it('calls onDead (never throws) when sendMessage itself throws synchronously', () => {
    const sendMessage = vi.fn(() => {
      throw new Error('Extension context invalidated.');
    });
    const runtime: RuntimeLike = { id: 'abcd1234', sendMessage };
    const onDead = vi.fn();

    expect(() => safeSendMessage(runtime, { type: 'CHECK_SAVED' }, vi.fn(), onDead)).not.toThrow();
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  it('calls onDead when runtime itself is undefined', () => {
    const onDead = vi.fn();
    expect(() => safeSendMessage(undefined, { type: 'CHECK_SAVED' }, vi.fn(), onDead)).not.toThrow();
    expect(onDead).toHaveBeenCalledTimes(1);
  });
});
