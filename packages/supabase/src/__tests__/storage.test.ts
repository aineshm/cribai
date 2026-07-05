/**
 * Tests for the capture-storage helper (AIN-84).
 *
 * `uploadCapture` / `downloadCapture` wrap the private `listing-captures`
 * Supabase Storage bucket. gzip/gunzip are exercised for real (node:zlib) —
 * only the Supabase storage client is mocked, so the round-trip proves the
 * compression logic actually works, not just that mocks were called.
 */
import { describe, it, expect, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import {
  CAPTURE_BUCKET,
  capturePath,
  uploadCapture,
  downloadCapture,
} from '../storage';

// ---------------------------------------------------------------------------
// Mock Supabase storage client
// ---------------------------------------------------------------------------

/**
 * A minimal fake of the `SupabaseClient.storage.from(bucket)` surface backed
 * by an in-memory Map, so upload() really produces bytes that download()
 * really reads back — this is what lets the gzip round-trip be genuine.
 */
function makeFakeStorageClient() {
  const objects = new Map<string, Buffer>();

  const uploadSpy = vi.fn(async (path: string, body: Buffer, _opts?: unknown) => {
    objects.set(path, body);
    return { data: { path }, error: null };
  });

  const downloadSpy = vi.fn(async (path: string) => {
    const bytes = objects.get(path);
    if (!bytes) {
      return { data: null, error: { message: 'Object not found' } };
    }
    // Real Supabase returns a Blob; arrayBuffer() is the only method our
    // implementation needs, so a minimal stand-in is sufficient.
    return {
      data: { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) },
      error: null,
    };
  });

  const client = {
    storage: {
      from: vi.fn(() => ({ upload: uploadSpy, download: downloadSpy })),
    },
  };

  return { client, uploadSpy, downloadSpy, objects };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('capturePath', () => {
  it('builds the object path as ${userId}/${listingId}.html.gz', () => {
    expect(capturePath('user-1', 'listing-1')).toBe('user-1/listing-1.html.gz');
  });
});

describe('uploadCapture / downloadCapture round-trip', () => {
  it('gzips on upload and gunzips on download, returning the original HTML', async () => {
    const { client, uploadSpy, downloadSpy } = makeFakeStorageClient();
    const html = '<html><body><h1>Apt for rent</h1></body></html>'.repeat(50);

    const storagePath = await uploadCapture(client as never, {
      userId: 'user-1',
      listingId: 'listing-1',
      html,
    });

    expect(storagePath).toBe('user-1/listing-1.html.gz');
    expect(uploadSpy).toHaveBeenCalledWith(
      'user-1/listing-1.html.gz',
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'application/gzip', upsert: true }),
    );

    // Prove the bytes that were actually uploaded are gzip-compressed, not
    // the raw HTML text.
    const uploadedBytes = uploadSpy.mock.calls[0]?.[1] as Buffer;
    expect(uploadedBytes.equals(gzipSync(Buffer.from(html, 'utf8')))).toBe(true);

    const downloaded = await downloadCapture(client as never, storagePath);
    expect(downloaded).toBe(html);
    expect(downloadSpy).toHaveBeenCalledWith(storagePath);
  });

  it('uses the CAPTURE_BUCKET constant when opening the storage client', async () => {
    const { client } = makeFakeStorageClient();
    await uploadCapture(client as never, { userId: 'u', listingId: 'l', html: '<html></html>' });
    expect(client.storage.from).toHaveBeenCalledWith(CAPTURE_BUCKET);
  });

  it('uploadCapture throws when the storage client returns an error', async () => {
    const client = {
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({ data: null, error: { message: 'bucket not found' } }),
        })),
      },
    };

    await expect(
      uploadCapture(client as never, { userId: 'u', listingId: 'l', html: '<html></html>' }),
    ).rejects.toThrow(/bucket not found/);
  });

  it('downloadCapture returns null (not throw) when the object is missing', async () => {
    const client = {
      storage: {
        from: vi.fn(() => ({
          download: vi.fn().mockResolvedValue({ data: null, error: { message: 'Object not found' } }),
        })),
      },
    };

    const result = await downloadCapture(client as never, 'u/l.html.gz');
    expect(result).toBeNull();
  });

  it('downloadCapture returns null when the client throws', async () => {
    const client = {
      storage: {
        from: vi.fn(() => ({
          download: vi.fn().mockRejectedValue(new Error('network error')),
        })),
      },
    };

    const result = await downloadCapture(client as never, 'u/l.html.gz');
    expect(result).toBeNull();
  });
});
