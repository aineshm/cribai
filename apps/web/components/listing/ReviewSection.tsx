'use client';

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { staggerContainer, staggerItem } from '@/lib/animations';
import type { Review } from '@/lib/mock-listing-detail';

interface ReviewSectionProps {
  readonly reviews: readonly Review[];
}

export function ReviewSection({ reviews }: ReviewSectionProps) {
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1" role="img" aria-label={`${averageRating.toFixed(1)} out of 5 stars`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={`avg-star-${i}`}
              aria-hidden="true"
              className={`size-5 ${
                i < Math.round(averageRating)
                  ? 'fill-[var(--secondary-500)] text-[var(--secondary-500)]'
                  : 'text-[var(--surface-300)]'
              }`}
            />
          ))}
        </div>
        <span className="text-sm font-medium text-foreground">
          {averageRating.toFixed(1)}
        </span>
        <span className="text-sm text-muted-foreground">
          ({reviews.length} review{reviews.length !== 1 ? 's' : ''})
        </span>
      </div>

      {/* Review Cards */}
      <motion.div
        className="space-y-3"
        variants={staggerContainer}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true, margin: '-50px' }}
      >
        {reviews.map((review) => (
          <motion.div key={review.id} variants={staggerItem}>
            <Card size="sm">
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground text-sm">
                        {review.studentName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {review.university}
                      </p>
                    </div>
                    <div className="flex items-center gap-1" role="img" aria-label={`${review.rating} out of 5 stars`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={`${review.id}-star-${i}`}
                          aria-hidden="true"
                          className={`size-3.5 ${
                            i < review.rating
                              ? 'fill-[var(--secondary-500)] text-[var(--secondary-500)]'
                              : 'text-[var(--surface-300)]'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {review.text}
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    <time dateTime={review.date}>
                      {new Date(`${review.date}T00:00:00`).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </time>
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
