/**
 * Lazy service-role Supabase singleton for CRM write operations.
 *
 * Mirrors the pattern in tools/handlers/create-sublease.ts:17-32.
 * Uses `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` (service-role key).
 * Auth refresh and session persistence are disabled — server-side singleton only.
 *
 * Exported as `getCrmServiceClient()` so it can be mocked in handler tests
 * via `vi.mock('../service-client')`.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _crmServiceClient: SupabaseClient | null = null;

/**
 * Return the shared service-role Supabase client for CRM writes.
 * Throws a generic error on missing env vars so secrets are never logged.
 */
export function getCrmServiceClient(): SupabaseClient {
  if (_crmServiceClient) return _crmServiceClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error('Server configuration error. Please try again later.');
  }

  _crmServiceClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _crmServiceClient;
}
