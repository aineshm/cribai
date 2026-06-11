/**
 * Unit tests for the chrome.storage.local adapter.
 *
 * We inject a mock storage object so no real chrome APIs are needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChromeStorageAdapter } from '../storage-adapter';

// ---------------------------------------------------------------------------
// Mock chrome.storage.local shape
// ---------------------------------------------------------------------------

type ChromeCallback<T> = (result: T) => void;

function makeMockStorage(initialData: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initialData };
  let lastError: { message: string } | undefined;

  const mockRuntime = {
    get lastError() {
      return lastError;
    },
  };

  // Stub chrome.runtime globally
  (globalThis as Record<string, unknown>)['chrome'] = {
    runtime: mockRuntime,
    storage: { local: {} },
  };

  const storage = {
    get(keys: string[], callback: ChromeCallback<Record<string, unknown>>): void {
      lastError = undefined;
      const result: Record<string, string> = {};
      for (const k of keys) {
        if (k in store) result[k] = store[k] as string;
      }
      callback(result);
    },
    set(items: Record<string, string>, callback: () => void): void {
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
    // Helper to inspect internal state in tests
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

describe('createChromeStorageAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getItem returns null for missing key', async () => {
    const storage = makeMockStorage();
    const adapter = createChromeStorageAdapter(storage as unknown as typeof chrome.storage.local);

    const result = await adapter.getItem('missing-key');
    expect(result).toBeNull();
  });

  it('setItem stores value, getItem retrieves it', async () => {
    const storage = makeMockStorage();
    const adapter = createChromeStorageAdapter(storage as unknown as typeof chrome.storage.local);

    await adapter.setItem('session', 'my-session-data');
    const result = await adapter.getItem('session');
    expect(result).toBe('my-session-data');
  });

  it('removeItem deletes the value', async () => {
    const storage = makeMockStorage({ session: 'existing' });
    const adapter = createChromeStorageAdapter(storage as unknown as typeof chrome.storage.local);

    await adapter.removeItem('session');
    const result = await adapter.getItem('session');
    expect(result).toBeNull();
  });

  it('setItem then removeItem then getItem returns null', async () => {
    const storage = makeMockStorage();
    const adapter = createChromeStorageAdapter(storage as unknown as typeof chrome.storage.local);

    await adapter.setItem('k', 'v');
    await adapter.removeItem('k');
    const result = await adapter.getItem('k');
    expect(result).toBeNull();
  });

  it('can store and retrieve multiple keys independently', async () => {
    const storage = makeMockStorage();
    const adapter = createChromeStorageAdapter(storage as unknown as typeof chrome.storage.local);

    await adapter.setItem('key1', 'value1');
    await adapter.setItem('key2', 'value2');

    expect(await adapter.getItem('key1')).toBe('value1');
    expect(await adapter.getItem('key2')).toBe('value2');
  });

  it('setItem overwrites existing value', async () => {
    const storage = makeMockStorage({ k: 'old' });
    const adapter = createChromeStorageAdapter(storage as unknown as typeof chrome.storage.local);

    await adapter.setItem('k', 'new');
    expect(await adapter.getItem('k')).toBe('new');
  });

  it('getItem rejects when chrome.runtime.lastError is set', async () => {
    const storage = makeMockStorage();
    // Override get to set lastError AFTER the internal reset but BEFORE callback runs
    storage.get = (_keys: string[], callback: ChromeCallback<Record<string, unknown>>) => {
      // Set error first, then invoke callback — adapter reads lastError inside callback
      storage._setError('Storage quota exceeded');
      callback({});
    };
    const adapter = createChromeStorageAdapter(storage as unknown as typeof chrome.storage.local);

    await expect(adapter.getItem('key')).rejects.toThrow('Storage quota exceeded');
  });
});
