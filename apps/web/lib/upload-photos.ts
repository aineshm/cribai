import { createClient } from '@campusnest/supabase/client';

const BUCKET_NAME = 'listing-photos';

// SECURITY: Only allow safe image MIME types (no SVG — XSS vector)
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface PhotoUploadResult {
  readonly urls: readonly string[];
  readonly errors: readonly string[];
}

/**
 * Upload an array of photo files to Supabase Storage.
 * Returns public URLs for successful uploads and error messages for failures.
 * Continues uploading remaining files if one fails.
 */
export async function uploadListingPhotos(
  files: readonly File[],
  userId: string,
): Promise<PhotoUploadResult> {
  if (files.length === 0) {
    return { urls: [], errors: [] };
  }

  const supabase = createClient();
  const timestamp = Date.now();

  const results = await Promise.allSettled(
    files.map(async (file, index) => {
      // SECURITY: Validate MIME type and file size before upload
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        throw new Error(`File type not allowed: ${file.name} (${file.type})`);
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error(`File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB, max 10MB)`);
      }

      const sanitizedName = file.name
        .replace(/\.\./g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 100);
      const path = `${userId}/${timestamp}-${index}-${sanitizedName}`;

      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        throw new Error(`Failed to upload ${file.name}: ${error.message}`);
      }

      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);

      return urlData.publicUrl;
    }),
  );

  const urls: string[] = [];
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      urls.push(result.value);
    } else {
      errors.push(
        result.reason instanceof Error
          ? result.reason.message
          : 'Unknown upload error',
      );
    }
  }

  return { urls, errors };
}
