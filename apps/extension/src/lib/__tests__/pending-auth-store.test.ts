/**
 * Unit tests for the pendingAuth session-storage seam.
 *
 * Covers: persist, read (fresh / stale / absent), clear, and expiry boundary.
 * Uses vi.useFakeTimers to control Date.now() per the repo idiom.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPendingAuthStore,
  PENDING_AUTH_RESUME_WINDOW_MS,
} from '../pending-auth-store';

// ---------------------------------------------------------------------------
// Mock chrome.storage.session shape (mirrors the local mock in storage-adapter tests)
// ---------------------------------------------------------------------------

type ChromeCallback<T> = (result: T) => void;

function makeMockSessionStorage(initialData: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initialData };
  let lastError: { message: string } | undefined;

  const mockRuntime = {
    get lastError() {
      return lastError;
    },
  };

  (globalThis as Record<string, unknown>)['chrome'] = {
    runtime: mockRuntime,
    storage: { session: {} },
  };

  const storage = {
    get(keys: string[], callback: ChromeCallback<Record<string, unknown>>): void {
      lastError = undefined;
      const result: Record<string, unknown> = {};
      for (const k of keys) {
        if (k in store) result[k] = store[k];
      }
      callback(result);
    },
    set(items: Record<string, unknown>, callback: () => void): void {
      lastError = undefined;
      for (const [k, v] of Object.entries(items)) {
        store[k] = v;
      }
      callback();
    },
    remove(keys: string[], callback: () => void): void {
      lastError = undefined;
      for (const k of keys) {
        delete store[k];
      }
      callback();
    },
    _store: store,
    _setError(msg: string) {
      lastError = { message: msg };
    },
  };

  return storage;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createPendingAuthStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // --- persist ---------------------------------------------------------------

  it('persist stores email and requestedAt from Date.now()', async () => {
    vi.setSystemTime(new Date('2026-06-11T10:00:00.000Z'));
    const storage = makeMockSessionStorage();
    const store = createPendingAuthStore(storage as unknown as typeof chrome.storage.session);

    await store.persist('user@wisc.edu');

    const raw = storage._store['pendingAuth'] as { email: string; requestedAt: number };
    expect(raw).toMatchObject({
      email: 'user@wisc.edu',
      requestedAt: new Date('2026-06-11T10:00:00.000Z').getTime(),
    });
  });

  // --- read (fresh) ----------------------------------------------------------

  it('read returns email when record is fresh (within window)', async () => {
    const now = new Date('2026-06-11T10:00:00.000Z').getTime();
    vi.setSystemTime(now);
    const storage = makeMockSessionStorage({
      pendingAuth: { email: 'student@wisc.edu', requestedAt: now - 5 * 60 * 1000 }, // 5 min ago
    });
    const store = createPendingAuthStore(storage as unknown as typeof chrome.storage.session);

    const result = await store.read();
    expect(result).toBe('student@wisc.edu');
  });

  it('read returns email exactly at the boundary (requestedAt = now - window + 1ms)', async () => {
    const now = new Date('2026-06-11T10:15:00.000Z').getTime();
    vi.setSystemTime(now);
    const freshEnough = now - PENDING_AUTH_RESUME_WINDOW_MS + 1;
    const storage = makeMockSessionStorage({
      pendingAuth: { email: 'edge@wisc.edu', requestedAt: freshEnough },
    });
    const store = createPendingAuthStore(storage as unknown as typeof chrome.storage.session);

    const result = await store.read();
    expect(result).toBe('edge@wisc.edu');
  });

  // --- read (stale) ----------------------------------------------------------

  it('read returns null and clears when record is stale (beyond window)', async () => {
    const now = new Date('2026-06-11T10:30:00.000Z').getTime();
    vi.setSystemTime(now);
    const stale = now - PENDING_AUTH_RESUME_WINDOW_MS - 1; // one ms past window
    const storage = makeMockSessionStorage({
      pendingAuth: { email: 'stale@wisc.edu', requestedAt: stale },
    });
    const store = createPendingAuthStore(storage as unknown as typeof chrome.storage.session);

    const result = await store.read();
    expect(result).toBeNull();
    // Should have been cleared from storage
    expect(storage._store['pendingAuth']).toBeUndefined();
  });

  it('read returns null when no record exists', async () => {
    const storage = makeMockSessionStorage();
    const store = createPendingAuthStore(storage as unknown as typeof chrome.storage.session);

    const result = await store.read();
    expect(result).toBeNull();
  });

  it('read returns null when stored value has unexpected shape', async () => {
    const storage = makeMockSessionStorage({ pendingAuth: 'not-an-object' });
    const store = createPendingAuthStore(storage as unknown as typeof chrome.storage.session);

    const result = await store.read();
    expect(result).toBeNull();
  });

  // --- clear -----------------------------------------------------------------

  it('clear removes the record from storage', async () => {
    const now = Date.now();
    const storage = makeMockSessionStorage({
      pendingAuth: { email: 'user@wisc.edu', requestedAt: now },
    });
    const store = createPendingAuthStore(storage as unknown as typeof chrome.storage.session);

    await store.clear();
    expect(storage._store['pendingAuth']).toBeUndefined();
  });

  it('clear is idempotent when no record exists', async () => {
    const storage = makeMockSessionStorage();
    const store = createPendingAuthStore(storage as unknown as typeof chrome.storage.session);

    // Should not throw
    await expect(store.clear()).resolves.toBeUndefined();
  });

  // --- round-trip ------------------------------------------------------------

  it('persist → read round-trips the email when still fresh', async () => {
    const now = new Date('2026-06-11T09:00:00.000Z').getTime();
    vi.setSystemTime(now);
    const storage = makeMockSessionStorage();
    const store = createPendingAuthStore(storage as unknown as typeof chrome.storage.session);

    await store.persist('roundtrip@wisc.edu');

    // Advance time by 1 minute (still fresh)
    vi.setSystemTime(now + 60_000);
    const result = await store.read();
    expect(result).toBe('roundtrip@wisc.edu');
  });

  it('persist → advance past window → read returns null', async () => {
    const now = new Date('2026-06-11T09:00:00.000Z').getTime();
    vi.setSystemTime(now);
    const storage = makeMockSessionStorage();
    const store = createPendingAuthStore(storage as unknown as typeof chrome.storage.session);

    await store.persist('expired@wisc.edu');

    // Advance past the 15-minute window
    vi.setSystemTime(now + PENDING_AUTH_RESUME_WINDOW_MS + 1_000);
    const result = await store.read();
    expect(result).toBeNull();
  });

  it('persist → clear → read returns null', async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const storage = makeMockSessionStorage();
    const store = createPendingAuthStore(storage as unknown as typeof chrome.storage.session);

    await store.persist('cleareduser@wisc.edu');
    await store.clear();
    const result = await store.read();
    expect(result).toBeNull();
  });
});
