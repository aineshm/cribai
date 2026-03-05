import { z } from 'zod';

export const tourRequestSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  campusId: z.string().uuid(),
  userId: z.string().uuid(),
  studentName: z.string().min(1).max(200),
  studentEmail: z.string().email(),
  preferredDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')).default([]),
  notes: z.string().max(500).nullable().default(null),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).default('pending'),
  createdAt: z.string().datetime().optional(),
});

export type TourRequest = z.infer<typeof tourRequestSchema>;

// Input schema for creating tour requests (subset of fields)
export const tourRequestInputSchema = z.object({
  listingId: z.string().uuid(),
  studentName: z.string().min(1).max(200),
  studentEmail: z.string().email(),
  preferredDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')).min(1, 'At least one preferred date required'),
  notes: z.string().max(500).optional(),
});

export type TourRequestInput = z.infer<typeof tourRequestInputSchema>;
