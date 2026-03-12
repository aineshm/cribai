import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Retrieve a cached API response by key.
 * Returns null if the entry is missing or expired.
 */
export async function getCached<T>(
  supabase: SupabaseClient,
  key: string,
): Promise<T | null> {
  const { data, error } = await supabase
    .from('api_cache')
    .select('response, expires_at')
    .eq('key', key)
    .single();

  if (error || !data) {
    return null;
  }

  const expiresAt = new Date(data.expires_at).getTime();
  if (expiresAt < Date.now()) {
    return null;
  }

  return data.response as T;
}

/**
 * Store an API response in the cache with a TTL.
 * Upserts on key conflict so repeated calls update the entry.
 */
export async function setCache(
  supabase: SupabaseClient,
  key: string,
  response: unknown,
  ttlMs: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  await supabase.from('api_cache').upsert(
    {
      key,
      response,
      expires_at: expiresAt,
    },
    { onConflict: 'key' },
  );
}
