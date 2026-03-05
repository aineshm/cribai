'use client';

import { useState } from 'react';
import Image from 'next/image';

interface ListingPhotoGalleryProps {
  readonly photoUrls: readonly string[];
  readonly sourceUrl: string | null;
  readonly address: string;
}

function SourceLink({ sourceUrl }: { readonly sourceUrl: string }) {
  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-[var(--primary-600)] hover:text-[var(--primary-700)] underline"
    >
      View on source
    </a>
  );
}

export function ListingPhotoGallery({
  photoUrls,
  sourceUrl,
  address,
}: ListingPhotoGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (photoUrls.length === 0) {
    if (sourceUrl) {
      return (
        <div className="flex items-center justify-center rounded-lg bg-[var(--surface-100)] py-12">
          <SourceLink sourceUrl={sourceUrl} />
        </div>
      );
    }
    return null;
  }

  if (photoUrls.length === 1) {
    return (
      <div className="space-y-2">
        <div className="relative aspect-video overflow-hidden rounded-lg">
          <Image
            src={photoUrls[0]}
            alt={`Photo of ${address}`}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover"
          />
        </div>
        {sourceUrl && (
          <div className="text-right">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--primary-600)] hover:text-[var(--primary-700)] underline"
            >
              More photos on source
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
        {photoUrls.map((url, index) => (
          <button
            key={url}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`relative flex-shrink-0 w-72 aspect-video overflow-hidden rounded-lg snap-center ${
              index === activeIndex
                ? 'ring-2 ring-[var(--primary-500)]'
                : ''
            }`}
          >
            <Image
              src={url}
              alt={`Photo ${index + 1} of ${address}`}
              fill
              sizes="288px"
              className="object-cover"
            />
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {photoUrls.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`h-1.5 rounded-full transition-all ${
                index === activeIndex
                  ? 'w-4 bg-[var(--primary-500)]'
                  : 'w-1.5 bg-[var(--surface-300)]'
              }`}
              aria-label={`Go to photo ${index + 1}`}
            />
          ))}
        </div>

        {photoUrls.length < 5 && sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--primary-600)] hover:text-[var(--primary-700)] underline"
          >
            More photos on source
          </a>
        )}
      </div>
    </div>
  );
}
