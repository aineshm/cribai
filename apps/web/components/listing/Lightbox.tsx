'use client';

import { useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { scaleIn, fadeIn } from '@/lib/animations';
import type { PhotoItem } from './PhotoGallery';

interface LightboxProps {
  readonly photos: readonly PhotoItem[];
  readonly isOpen: boolean;
  readonly activeIndex: number;
  readonly onClose: () => void;
  readonly onIndexChange: (index: number) => void;
}

export function Lightbox({
  photos,
  isOpen,
  activeIndex,
  onClose,
  onIndexChange,
}: LightboxProps) {
  const goPrev = useCallback(() => {
    onIndexChange(activeIndex === 0 ? photos.length - 1 : activeIndex - 1);
  }, [activeIndex, photos.length, onIndexChange]);

  const goNext = useCallback(() => {
    onIndexChange(activeIndex === photos.length - 1 ? 0 : activeIndex + 1);
  }, [activeIndex, photos.length, onIndexChange]);

  const lightboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          goPrev();
          break;
        case 'ArrowRight':
          goNext();
          break;
        case 'Tab': {
          if (!lightboxRef.current) break;
          const focusableElements = lightboxRef.current.querySelectorAll<HTMLElement>(
            'button, [href], [tabindex]:not([tabindex="-1"])'
          );
          const firstEl = focusableElements[0];
          const lastEl = focusableElements[focusableElements.length - 1];

          if (e.shiftKey && document.activeElement === firstEl) {
            e.preventDefault();
            lastEl?.focus();
          } else if (!e.shiftKey && document.activeElement === lastEl) {
            e.preventDefault();
            firstEl?.focus();
          }
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    lightboxRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose, goPrev, goNext]);

  const currentPhoto = photos[activeIndex];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={lightboxRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Photo lightbox: ${currentPhoto?.alt ?? 'Photo gallery'}`}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center focus:outline-none"
          variants={fadeIn}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/90"
            onClick={onClose}
          />

          {/* Content */}
          <motion.div
            className="relative z-10 w-full max-w-4xl mx-4"
            variants={scaleIn}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute -top-12 right-0 text-white/80 hover:text-white transition-colors"
              aria-label="Close lightbox"
            >
              <X className="size-6" />
            </button>

            {/* Photo counter */}
            <div className="absolute -top-12 left-0 text-white/80 text-sm">
              {activeIndex + 1} / {photos.length}
            </div>

            {/* Photo display */}
            <div className="w-full aspect-[16/10] rounded-xl overflow-hidden relative">
              {currentPhoto?.url ? (
                <Image
                  src={currentPhoto.url}
                  alt={currentPhoto.alt}
                  fill
                  className="object-contain bg-black"
                  sizes="(max-width: 1024px) 100vw, 896px"
                />
              ) : (
                <div
                  className={`w-full h-full bg-gradient-to-br ${currentPhoto?.gradient ?? 'from-primary-200 to-primary-400'} flex items-center justify-center`}
                >
                  <span className="text-white/70 text-lg">
                    {currentPhoto?.alt}
                  </span>
                </div>
              )}
            </div>

            {/* Navigation */}
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full p-2 transition-colors"
              aria-label="Previous photo"
            >
              <ChevronLeft className="size-6 text-white" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full p-2 transition-colors"
              aria-label="Next photo"
            >
              <ChevronRight className="size-6 text-white" />
            </button>
          </motion.div>

          {/* Thumbnail strip (max 10) */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
            {photos.slice(0, 10).map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => onIndexChange(i)}
                className={`w-12 h-8 rounded-md overflow-hidden border-2 transition-all relative ${
                  i === activeIndex
                    ? 'border-white scale-110'
                    : 'border-transparent opacity-60 hover:opacity-80'
                }`}
                aria-label={`View photo ${i + 1}`}
              >
                {photo.url ? (
                  <Image
                    src={photo.url}
                    alt={photo.alt}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                ) : (
                  <div
                    className={`w-full h-full bg-gradient-to-br ${photo.gradient}`}
                  />
                )}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
