'use client';

import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { uploadListingPhotos } from '@/lib/upload-photos';

interface PhotoUploaderProps {
  readonly listingId: string;
  readonly userId: string;
  readonly existingPhotos: readonly string[];
  readonly onPhotosUpdated: (urls: readonly string[]) => void;
}

const MAX_PHOTOS = 10;

export function PhotoUploader({
  listingId,
  userId,
  existingPhotos,
  onPhotosUpdated,
}: PhotoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const remainingSlots = MAX_PHOTOS - existingPhotos.length;

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files).slice(0, remainingSlots);
    if (fileArray.length === 0) {
      toast.error(`Maximum ${MAX_PHOTOS} photos per listing`);
      return;
    }

    setUploading(true);
    try {
      const result = await uploadListingPhotos(fileArray, userId);

      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} photo(s) failed to upload`);
      }

      if (result.urls.length > 0) {
        const updatedUrls = [...existingPhotos, ...result.urls];

        // PATCH listing with new photo_urls
        const res = await fetch(`/api/listings/${listingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_urls: updatedUrls }),
        });

        if (res.ok) {
          onPhotosUpdated(updatedUrls);
          toast.success(`${result.urls.length} photo(s) uploaded`);
        } else {
          toast.error('Failed to save photos');
        }
      }
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [listingId, userId, existingPhotos, remainingSlots, onPhotosUpdated]);

  const handleRemovePhoto = useCallback(async (urlToRemove: string) => {
    if (uploading) return;
    setUploading(true);
    try {
      const updatedUrls = existingPhotos.filter(url => url !== urlToRemove);

      const res = await fetch(`/api/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_urls: updatedUrls }),
      });

      if (res.ok) {
        onPhotosUpdated(updatedUrls);
        toast.success('Photo removed');
      } else {
        toast.error('Failed to remove photo');
      }
    } finally {
      setUploading(false);
    }
  }, [listingId, existingPhotos, onPhotosUpdated, uploading]);

  return (
    <div className="space-y-3">
      {/* Existing photos with remove buttons */}
      {existingPhotos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {existingPhotos.map((url) => (
            <div key={url} className="relative group rounded-lg overflow-hidden aspect-video">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemovePhoto(url)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove photo"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {remainingSlots > 0 && (
        <label className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-red-800 bg-red-50 hover:bg-red-100 rounded-xl border border-dashed border-red-300 cursor-pointer transition-colors">
          {uploading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <ImagePlus className="size-4" />
              Add Photos ({remainingSlots} remaining)
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
            disabled={uploading}
            className="sr-only"
          />
        </label>
      )}
    </div>
  );
}
