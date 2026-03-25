'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, X, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WizardFormData } from './PostWizard';

interface StepPhotosProps {
  readonly formData: WizardFormData;
  readonly updateFormData: (updates: Partial<WizardFormData>) => void;
}

export function StepPhotos({ formData, updateFormData }: StepPhotosProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const newPhotos = Array.from(files).filter((f) =>
        f.type.startsWith('image/')
      );
      updateFormData({ photos: [...formData.photos, ...newPhotos] });
    },
    [formData.photos, updateFormData]
  );

  const removePhoto = useCallback(
    (index: number) => {
      updateFormData({
        photos: formData.photos.filter((_, i) => i !== index),
      });
    },
    [formData.photos, updateFormData]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-foreground">
          Photos
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add photos to showcase your space. Minimum 3 photos recommended.
        </p>
      </div>

      {/* Drop zone */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/30 hover:border-muted-foreground/50'
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Upload className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            Drag & drop photos here
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            or click to browse files
          </p>
        </div>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Photo thumbnails */}
      {formData.photos.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {formData.photos.map((photo, index) => (
            <div
              key={`${photo.name}-${photo.size}-${index}`}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
            >
              <div className="flex size-full items-center justify-center">
                <ImageIcon className="size-8 text-muted-foreground/50" />
              </div>
              <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-xs text-white">
                {photo.name}
              </div>
              <button
                type="button"
                onClick={() => removePhoto(index)}
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {formData.photos.length > 0 && formData.photos.length < 3 && (
        <p className="text-xs text-slate-600">
          You have {formData.photos.length} photo
          {formData.photos.length === 1 ? '' : 's'}. We recommend at least 3.
        </p>
      )}
    </div>
  );
}
