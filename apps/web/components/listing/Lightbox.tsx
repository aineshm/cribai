'use client';

import { useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { scaleIn, fadeIn } from '@/lib/animations';
import type { PhotoItem } from '@/lib/mock-listing-detail';

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
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

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
          className="fixed inset-0 z-50 flex items-center justify-center"
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
            <div
              className={`w-full aspect-[16/10] rounded-xl bg-gradient-to-br ${currentPhoto?.gradient ?? 'from-primary-200 to-primary-400'} flex items-center justify-center`}
            >
              <span className="text-white/70 text-lg">
                {currentPhoto?.alt}
              </span>
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

          {/* Thumbnail strip */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
            {photos.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => onIndexChange(i)}
                className={`w-12 h-8 rounded-md overflow-hidden border-2 transition-all ${
                  i === activeIndex
                    ? 'border-white scale-110'
                    : 'border-transparent opacity-60 hover:opacity-80'
                }`}
                aria-label={`View photo ${i + 1}`}
              >
                <div
                  className={`w-full h-full bg-gradient-to-br ${photo.gradient}`}
                />
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
