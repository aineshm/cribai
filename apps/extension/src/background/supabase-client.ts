/**
 * Supabase client factory for the service worker.
 *
 * Uses the chrome.storage.local adapter instead of localStorage, which
 * does not exist in MV3 service worker contexts.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createChromeStorageAdapter } from '../lib/storage-adapter';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/constants';

let _client: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase client configured for the service worker.
 * The client persists sessions in chrome.storage.local.
 */
export function getSupabaseClient(): SupabaseClient {
  if (_client !== null) return _client;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/extension/.env',
    );
  }

  const storageAdapter = createChromeStorageAdapter();

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: storageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return _client;
}
