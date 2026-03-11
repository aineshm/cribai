'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { Lightbox } from './Lightbox';
import type { PhotoItem } from '@/lib/mock-listing-detail';

interface PhotoGalleryProps {
  readonly photos: readonly PhotoItem[];
}

export function PhotoGallery({ photos }: PhotoGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mobileIndex, setMobileIndex] = useState(0);

  const openLightbox = useCallback((index: number) => {
    setActiveIndex(index);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const prevMobile = useCallback(() => {
    setMobileIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
  }, [photos.length]);

  const nextMobile = useCallback(() => {
    setMobileIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1));
  }, [photos.length]);

  const heroPhoto = photos[0];
  const sidePhotos = photos.slice(1, 5);

  return (
    <>
      {/* Desktop Grid Layout */}
      <motion.div
        className="hidden md:grid md:grid-cols-3 gap-2 rounded-xl overflow-hidden relative"
        style={{ height: '420px' }}
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {/* Hero Image (2/3 width) */}
        <motion.button
          className="col-span-2 relative cursor-pointer"
          variants={staggerItem}
          onClick={() => openLightbox(0)}
          type="button"
          aria-label={heroPhoto?.alt ?? 'Main photo'}
        >
          <div
            className={`w-full h-full bg-gradient-to-br ${heroPhoto?.gradient ?? 'from-primary-200 to-primary-400'} flex items-center justify-center`}
          >
            <span className="text-sm text-white/70 font-medium">
              {heroPhoto?.alt}
            </span>
          </div>
        </motion.button>

        {/* Side Thumbnails (1/3 width, 2x2 grid) */}
        <div className="grid grid-rows-2 grid-cols-2 gap-2">
          {sidePhotos.map((photo, i) => (
            <motion.button
              key={photo.id}
              className="relative cursor-pointer overflow-hidden"
              variants={staggerItem}
              onClick={() => openLightbox(i + 1)}
              type="button"
              aria-label={photo.alt}
            >
              <div
                className={`w-full h-full bg-gradient-to-br ${photo.gradient} flex items-center justify-center`}
              >
                <span className="text-xs text-white/60">{i + 2}</span>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Show all photos overlay button */}
        {photos.length > 5 && (
          <Button
            variant="outline"
            size="sm"
            className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm"
            onClick={() => openLightbox(0)}
          >
            <Camera className="size-4" />
            Show all {photos.length} photos
          </Button>
        )}
      </motion.div>

      {/* Mobile Carousel */}
      <div className="md:hidden relative rounded-xl overflow-hidden" style={{ height: '280px' }}>
        <button
          type="button"
          onClick={() => openLightbox(mobileIndex)}
          className={`w-full h-full bg-gradient-to-br ${photos[mobileIndex]?.gradient ?? 'from-primary-200 to-primary-400'} flex items-center justify-center transition-all duration-300 cursor-pointer`}
          aria-label={photos[mobileIndex]?.alt ?? 'View photo'}
        >
          <span className="text-sm text-white/70">
            {photos[mobileIndex]?.alt}
          </span>
        </button>

        {/* Navigation Arrows */}
        <button
          type="button"
          onClick={prevMobile}
          className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-sm rounded-full p-1.5 shadow-md"
          aria-label="Previous photo"
        >
          <ChevronLeft className="size-5 text-foreground" />
        </button>
        <button
          type="button"
          onClick={nextMobile}
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-sm rounded-full p-1.5 shadow-md"
          aria-label="Next photo"
        >
          <ChevronRight className="size-5 text-foreground" />
        </button>

        {/* Dots indicator */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setMobileIndex(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === mobileIndex ? 'bg-white' : 'bg-white/50'
              }`}
              aria-label={`Go to photo ${i + 1}`}
            />
          ))}
        </div>

        {/* Photo counter */}
        <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
          {mobileIndex + 1} / {photos.length}
        </div>
      </div>

      {/* Lightbox */}
      <Lightbox
        photos={photos}
        isOpen={lightboxOpen}
        activeIndex={activeIndex}
        onClose={closeLightbox}
        onIndexChange={setActiveIndex}
      />
    </>
  );
}
