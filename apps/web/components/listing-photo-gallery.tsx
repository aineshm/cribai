'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

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

function Lightbox({
  photoUrls,
  activeIndex,
  address,
  onClose,
  onNext,
  onPrev,
}: {
  readonly photoUrls: readonly string[];
  readonly activeIndex: number;
  readonly address: string;
  readonly onClose: () => void;
  readonly onNext: () => void;
  readonly onPrev: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();

      // Trap focus within dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    // Move focus into dialog
    dialogRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previouslyFocused?.focus();
    };
  }, [onClose, onNext, onPrev]);

  const url = photoUrls[activeIndex]!;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${activeIndex + 1} of ${photoUrls.length}`}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        aria-label="Close lightbox"
      >
        <X className="h-6 w-6" strokeWidth={2} />
      </button>

      {/* Counter */}
      <span className="absolute top-4 left-4 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white">
        {activeIndex + 1} / {photoUrls.length}
      </span>

      {/* Prev button */}
      {photoUrls.length > 1 && (
        <button
          onClick={onPrev}
          className="absolute left-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Previous photo"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
      )}

      {/* Image */}
      <div className="relative h-[80vh] w-[90vw] md:w-[80vw]">
        <Image
          src={url}
          alt={`Photo ${activeIndex + 1} of ${address}`}
          fill
          sizes="90vw"
          className="object-contain"
          priority
        />
      </div>

      {/* Next button */}
      {photoUrls.length > 1 && (
        <button
          onClick={onNext}
          className="absolute right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Next photo"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

export function ListingPhotoGallery({
  photoUrls,
  sourceUrl,
  address,
}: ListingPhotoGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (activeIndex >= photoUrls.length && photoUrls.length > 0) {
      setActiveIndex(photoUrls.length - 1);
    }
  }, [photoUrls.length, activeIndex]);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const nextPhoto = useCallback(() => {
    setActiveIndex((i) => (i + 1) % photoUrls.length);
  }, [photoUrls.length]);
  const prevPhoto = useCallback(() => {
    setActiveIndex((i) => (i - 1 + photoUrls.length) % photoUrls.length);
  }, [photoUrls.length]);

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
    const singlePhoto = photoUrls[0] as string;
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="relative aspect-video w-full overflow-hidden rounded-lg cursor-zoom-in"
        >
          <Image
            src={singlePhoto}
            alt={`Photo of ${address}`}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover"
          />
        </button>
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
        {lightboxOpen && (
          <Lightbox
            photoUrls={photoUrls}
            activeIndex={activeIndex}
            address={address}
            onClose={closeLightbox}
            onNext={nextPhoto}
            onPrev={prevPhoto}
          />
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
            onClick={() => {
              setActiveIndex(index);
              setLightboxOpen(true);
            }}
            className={`relative flex-shrink-0 w-72 aspect-video overflow-hidden rounded-lg snap-center cursor-zoom-in ${
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

      {lightboxOpen && (
        <Lightbox
          photoUrls={photoUrls}
          activeIndex={activeIndex}
          address={address}
          onClose={closeLightbox}
          onNext={nextPhoto}
          onPrev={prevPhoto}
        />
      )}
    </div>
  );
}
