/**
 * chrome.storage.local adapter for @supabase/supabase-js.
 *
 * Supabase's createClient accepts a custom storage implementation.
 * This adapter lets the service worker persist sessions in chrome.storage
 * rather than localStorage (which doesn't exist in service workers).
 *
 * The adapter is a thin seam: pure functions that return Promises,
 * with no side effects beyond the chrome.storage calls. This makes
 * the surrounding logic testable via mock injection.
 */

export interface StorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

/**
 * Creates a chrome.storage.local–backed storage adapter.
 *
 * @param storage - Injected chrome.storage.local instance (defaults to the
 *   real one; pass a mock in tests).
 */
export function createChromeStorageAdapter(
  storage: typeof chrome.storage.local = chrome.storage.local,
): StorageAdapter {
  return {
    async getItem(key: string): Promise<string | null> {
      return new Promise((resolve, reject) => {
        storage.get([key], (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          const value = result[key];
          resolve(typeof value === 'string' ? value : null);
        });
      });
    },

    async setItem(key: string, value: string): Promise<void> {
      return new Promise((resolve, reject) => {
        storage.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      });
    },

    async removeItem(key: string): Promise<void> {
      return new Promise((resolve, reject) => {
        storage.remove([key], () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      });
    },
  };
}
