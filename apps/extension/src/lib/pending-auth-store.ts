/**
 * PendingAuth session-storage seam.
 *
 * Persists a `{ email, requestedAt }` record in chrome.storage.session while
 * the user is mid-OTP flow (after email submitted, before code verified).
 * chrome.storage.session survives popup close + MV3 service-worker restarts
 * within the same browser session, but is auto-cleared on browser exit —
 * the right lifetime for a transient auth handshake.
 *
 * This module is a thin testable seam (injected storage, no raw chrome.*
 * calls in business logic) matching the existing storage-adapter pattern.
 */

/** How long (ms) a pendingAuth record stays valid for resume. */
export const PENDING_AUTH_RESUME_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const STORAGE_KEY = 'pendingAuth';

interface PendingAuthRecord {
  readonly email: string;
  readonly requestedAt: number;
}

export interface PendingAuthStore {
  /** Persist a pending auth record with email + current timestamp. */
  persist: (email: string) => Promise<void>;
  /**
   * Read the pending email if a record exists and is still fresh.
   * Returns null if absent, malformed, or older than PENDING_AUTH_RESUME_WINDOW_MS.
   * Side effect: clears the record when it is stale.
   */
  read: () => Promise<string | null>;
  /** Clear the record. Safe to call when no record exists. */
  clear: () => Promise<void>;
}

/**
 * Creates a PendingAuthStore backed by the injected chrome.storage.session
 * instance. Pass a mock in tests; omit to use the real API.
 */
export function createPendingAuthStore(
  storage: typeof chrome.storage.session = chrome.storage.session,
): PendingAuthStore {
  return {
    async persist(email: string): Promise<void> {
      const record: PendingAuthRecord = { email, requestedAt: Date.now() };
      return new Promise<void>((resolve, reject) => {
        storage.set({ [STORAGE_KEY]: record }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      });
    },

    async read(): Promise<string | null> {
      return new Promise<string | null>((resolve, reject) => {
        storage.get([STORAGE_KEY], (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          const raw = result[STORAGE_KEY];

          // Validate shape
          if (
            typeof raw !== 'object' ||
            raw === null ||
            typeof (raw as PendingAuthRecord).email !== 'string' ||
            typeof (raw as PendingAuthRecord).requestedAt !== 'number'
          ) {
            resolve(null);
            return;
          }

          const record = raw as PendingAuthRecord;
          const age = Date.now() - record.requestedAt;

          if (age > PENDING_AUTH_RESUME_WINDOW_MS) {
            // Stale — evict and return null
            storage.remove([STORAGE_KEY], () => {
              resolve(null);
            });
            return;
          }

          resolve(record.email);
        });
      });
    },

    async clear(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        storage.remove([STORAGE_KEY], () => {
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
