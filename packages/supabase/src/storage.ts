/**
 * Capture-storage helper (AIN-84).
 *
 * Server-only (uses `node:zlib`). Wraps the private `listing-captures`
 * Supabase Storage bucket introduced by migration 043, which replaced the
 * `crm_listing_captures.html` text column: capture HTML is now gzipped and
 * stored as an object at `${userId}/${listingId}.html.gz`; the DB row keeps
 * only a `storage_path` pointer.
 *
 * The bucket is private and carries NO `storage.objects` policies (default
 * deny for `anon`/`authenticated`) — only a service-role client (which
 * bypasses storage RLS) can read or write. Callers MUST pass a client built
 * via `createSecretClient()` from `./server`, not a session/bearer client.
 */
import { gzipSync, gunzipSync } from 'node:zlib';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The single private bucket for extension-captured listing HTML (AIN-84). */
export const CAPTURE_BUCKET = 'listing-captures';

/** Object path convention: one gzipped HTML blob per (user, listing). */
export function capturePath(userId: string, listingId: string): string {
  return `${userId}/${listingId}.html.gz`;
}

export interface UploadCaptureParams {
  readonly userId: string;
  readonly listingId: string;
  readonly html: string;
}

/**
 * Gzip `html` and upload it to the private `listing-captures` bucket at
 * `capturePath(userId, listingId)`, overwriting any existing object
 * (`upsert: true` — a re-ingest of the same listing always wins).
 *
 * Returns the storage path on success. Throws on any failure — callers treat
 * an upload failure as "skip the pointer-row write entirely" (best-effort
 * capture persistence; the mission still runs and falls back to a
 * server-side fetch).
 */
export async function uploadCapture(
  client: SupabaseClient,
  params: UploadCaptureParams,
): Promise<string> {
  const path = capturePath(params.userId, params.listingId);
  const gzipped = gzipSync(Buffer.from(params.html, 'utf8'));

  const { error } = await client.storage.from(CAPTURE_BUCKET).upload(path, gzipped, {
    contentType: 'application/gzip',
    upsert: true,
  });

  if (error) {
    throw new Error(`uploadCapture failed for ${path}: ${error.message}`);
  }

  return path;
}

/**
 * Download and gunzip a capture object at `storagePath`. Returns `null` (and
 * warns) on any failure — a download-miss is treated by callers as a
 * capture-miss, which falls back to the existing server-side fetch path.
 * Never throws.
 */
export async function downloadCapture(
  client: SupabaseClient,
  storagePath: string,
): Promise<string | null> {
  try {
    const { data, error } = await client.storage.from(CAPTURE_BUCKET).download(storagePath);
    if (error || !data) {
      console.warn(
        `[storage] downloadCapture miss for ${storagePath}:`,
        (error as { message?: string } | null)?.message ?? 'no data returned',
      );
      return null;
    }
    const arrayBuffer = await (data as Blob).arrayBuffer();
    return gunzipSync(Buffer.from(arrayBuffer)).toString('utf8');
  } catch (err) {
    console.warn(
      `[storage] downloadCapture failed for ${storagePath}:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
